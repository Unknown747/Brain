/** Backend RPC publik gratis untuk chain EVM (tanpa API key). */
const { withRetry, createRateLimiter } = require("./util");
const rpcStats = require("./rpcStats");
const logger   = require("./logger");

// Daftar endpoint per chain (urut berdasarkan reliabilitas).
// Arbitrum/Optimism/Base diperbanyak — RPC publiknya paling cepat kena rate-limit.
const RPCS = {
    1: [
        "https://eth.llamarpc.com",
        "https://ethereum-rpc.publicnode.com",
        "https://rpc.ankr.com/eth",
        "https://cloudflare-eth.com",
        "https://eth.drpc.org",
    ],
    10: [
        "https://optimism.llamarpc.com",
        "https://optimism-rpc.publicnode.com",
        "https://mainnet.optimism.io",
        "https://optimism.drpc.org",
        "https://1rpc.io/op",
    ],
    56: [
        "https://binance.llamarpc.com",
        "https://bsc-rpc.publicnode.com",
        "https://bsc-dataseed.binance.org",
        "https://bsc.drpc.org",
    ],
    137: [
        "https://polygon.llamarpc.com",
        "https://polygon-bor-rpc.publicnode.com",
        "https://polygon-rpc.com",
        "https://polygon.drpc.org",
    ],
    8453: [
        "https://base.llamarpc.com",
        "https://base-rpc.publicnode.com",
        "https://mainnet.base.org",
        "https://base.drpc.org",
        "https://1rpc.io/base",
    ],
    42161: [
        "https://arbitrum.llamarpc.com",
        "https://arbitrum-one-rpc.publicnode.com",
        "https://arbitrum.drpc.org",
        "https://arb1.arbitrum.io/rpc",
        "https://1rpc.io/arb",
        "https://arbitrum.blockpi.network/v1/rpc/public",
        "https://arbitrum.api.onfinality.io/public",
    ],
    43114: [
        "https://avalanche-c-chain-rpc.publicnode.com",
        "https://api.avax.network/ext/bc/C/rpc",
        "https://avalanche.drpc.org",
        "https://1rpc.io/avax/c",
        "https://rpc.ankr.com/avalanche",
    ],
};

const NAMES = {
    1:     "Ethereum",
    10:    "Optimism",
    56:    "BNB Chain",
    137:   "Polygon",
    8453:  "Base",
    42161: "Arbitrum",
    43114: "Avalanche",
};

// Tuning per-chain: rps & batch-size yang aman untuk RPC publik gratisan.
// L2 (Arb/Op/Base) lebih ketat karena penyedia gratis sengaja batasi.
// Auditor akan ambil min(opts, TUNING) → user tetap bisa turunkan via config.
const TUNING = {
    1:     { rps: 5, batch: 100 },
    10:    { rps: 3, batch: 50  },
    56:    { rps: 5, batch: 100 },
    137:   { rps: 5, batch: 100 },
    8453:  { rps: 3, batch: 50  },
    42161: { rps: 2, batch: 25  },
    43114: { rps: 5, batch: 100 },
};

function chainName(chainId) {
    return NAMES[chainId] || `chain${chainId}`;
}

function getChainBatchSize(chainId) {
    return TUNING[chainId]?.batch ?? 100;
}

function getChainRps(chainId) {
    return TUNING[chainId]?.rps ?? 5;
}

function getSupportedChains() {
    return Object.keys(RPCS).map(Number);
}

// ── Per-chain limiter (di-cache, dibuat saat pertama dipakai) ─────────
const limiters = new Map();
function getChainLimiter(chainId, maxRps) {
    const rps = Math.max(1, Math.min(maxRps ?? 5, getChainRps(chainId)));
    const key = `${chainId}:${rps}`;
    if (!limiters.has(key)) limiters.set(key, createRateLimiter(rps));
    return limiters.get(key);
}

// ── Adaptive cooldown chain — kalau spam 429, pause sebentar ─────────
const cooldownUntil = new Map(); // chainId → timestamp
const failStreak    = new Map(); // chainId → berapa kali berturut-turut 429
const COOLDOWN_MAX  = 30000;     // max 30 detik

async function waitCooldown(chainId) {
    const until = cooldownUntil.get(chainId);
    if (until && Date.now() < until) {
        await new Promise((r) => setTimeout(r, until - Date.now()));
    }
}

function trip429(chainId, retryAfterMs) {
    const n = (failStreak.get(chainId) || 0) + 1;
    failStreak.set(chainId, n);
    const exp = Math.min(COOLDOWN_MAX, 1000 * Math.pow(2, n - 1));
    const ms  = Math.min(COOLDOWN_MAX, Math.max(exp, retryAfterMs || 0));
    cooldownUntil.set(chainId, Date.now() + ms);
    return ms;
}

function reset429(chainId) {
    if (failStreak.get(chainId)) {
        failStreak.delete(chainId);
        cooldownUntil.delete(chainId);
    }
}

// ── Per-endpoint blacklist (mati 5 menit kalau gagal terus-terusan) ──
const DEAD_AFTER_FAILS = 5;             // gagal berturut-turut → blacklist
const REVIVE_MS        = 5 * 60 * 1000; // auto-revive setelah 5 menit
const endpointDeadUntil  = new Map();   // url → timestamp
const endpointFailStreak = new Map();   // url → count

function isEndpointDead(url) {
    const until = endpointDeadUntil.get(url);
    if (!until) return false;
    if (Date.now() >= until) {
        // Auto-revive: kasih kesempatan kedua
        endpointDeadUntil.delete(url);
        endpointFailStreak.delete(url);
        return false;
    }
    return true;
}

function markEndpointFailure(url, label) {
    const n = (endpointFailStreak.get(url) || 0) + 1;
    endpointFailStreak.set(url, n);
    if (n >= DEAD_AFTER_FAILS && !endpointDeadUntil.has(url)) {
        endpointDeadUntil.set(url, Date.now() + REVIVE_MS);
        try {
            logger.warn(`[${label}] endpoint dinonaktifkan 5 menit (gagal ${n}×): ${url}`);
        } catch {}
        return true;
    }
    return false;
}

function markEndpointSuccess(url) {
    if (endpointFailStreak.has(url) || endpointDeadUntil.has(url)) {
        endpointFailStreak.delete(url);
        endpointDeadUntil.delete(url);
    }
}

// Index RPC yang terakhir berhasil per chain — request berikutnya
// langsung pakai itu, jangan buang waktu mencoba endpoint yang gagal.
const lastGood = new Map();

async function postJsonRpc(url, payload, timeoutMs = 15000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
            signal: ctrl.signal,
        });
        if (res.status === 429) {
            const ra  = res.headers.get("retry-after");
            const err = new Error("HTTP 429");
            err.rateLimited  = true;
            err.retryAfterMs = ra ? Math.min(COOLDOWN_MAX, parseFloat(ra) * 1000) : 0;
            throw err;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } finally {
        clearTimeout(t);
    }
}

/**
 * Cek saldo banyak alamat sekaligus via JSON-RPC batch.
 * - Per-chain rate-limit + adaptive cooldown saat 429
 * - Per-endpoint blacklist 5 menit saat 5x gagal berturut-turut
 *
 * @param {number} chainId
 * @param {string[]} addresses
 * @param {number} [maxRps]   Cap rps dari opts (effective = min(maxRps, TUNING[chain].rps))
 */
async function balanceMulti(chainId, addresses, maxRps) {
    const urls = RPCS[chainId];
    if (!urls) throw new Error(`Chain ${chainId} tidak didukung`);

    const out = new Map();
    if (addresses.length === 0) return out;

    await waitCooldown(chainId);
    await getChainLimiter(chainId, maxRps)();

    const payload = addresses.map((addr, i) => ({
        jsonrpc: "2.0",
        id: i,
        method: "eth_getBalance",
        params: [addr, "latest"],
    }));

    const startIdx       = lastGood.get(chainId) ?? 0;
    const label          = `EVM/${chainName(chainId)}`;
    let   data           = null;
    let   lastErr        = null;
    let   all429         = true;
    let   maxRetryAfter  = 0;
    let   triedAny       = false;

    // Pass 1: hanya endpoint yang masih hidup
    for (let off = 0; off < urls.length; off++) {
        const idx = (startIdx + off) % urls.length;
        const url = urls[idx];
        if (isEndpointDead(url)) continue;
        triedAny = true;
        try {
            data = await withRetry(() => postJsonRpc(url, payload), 2, 400);
            lastGood.set(chainId, idx);
            rpcStats.recordOk(label, url);
            markEndpointSuccess(url);
            all429 = false;
            reset429(chainId);
            break;
        } catch (e) {
            lastErr = e;
            rpcStats.recordFail(label, url);
            markEndpointFailure(url, label);
            if (!e.rateLimited) all429 = false;
            else if (e.retryAfterMs) maxRetryAfter = Math.max(maxRetryAfter, e.retryAfterMs);
        }
    }

    // Pass 2: kalau semua endpoint mati, paksa coba (last resort)
    if (data == null && !triedAny) {
        try { logger.warn(`[${label}] semua endpoint dinonaktifkan — paksa coba ulang`); } catch {}
        for (let off = 0; off < urls.length; off++) {
            const idx = (startIdx + off) % urls.length;
            const url = urls[idx];
            try {
                data = await withRetry(() => postJsonRpc(url, payload), 1, 400);
                lastGood.set(chainId, idx);
                rpcStats.recordOk(label, url);
                markEndpointSuccess(url);
                all429 = false;
                break;
            } catch (e) {
                lastErr = e;
                rpcStats.recordFail(label, url);
            }
        }
    }

    if (Array.isArray(data)) {
        for (const r of data) {
            const addr = addresses[r.id];
            if (!addr) continue;
            let bal = 0n;
            try { if (r.result) bal = BigInt(r.result); } catch {}
            out.set(addr.toLowerCase(), bal);
        }
        for (const a of addresses) {
            const k = a.toLowerCase();
            if (!out.has(k)) out.set(k, 0n);
        }
    } else {
        // Semua RPC gagal — kembalikan 0 supaya audit tetap jalan.
        for (const a of addresses) out.set(a.toLowerCase(), 0n);
        if (all429) trip429(chainId, maxRetryAfter);
        if (lastErr) throw lastErr;
    }
    return out;
}

module.exports = {
    balanceMulti,
    chainName,
    getChainBatchSize,
    getChainRps,
    getSupportedChains,
    _internal: {
        RPCS, TUNING, NAMES,
        cooldownUntil, failStreak,
        endpointDeadUntil, endpointFailStreak,
        DEAD_AFTER_FAILS, REVIVE_MS,
        // helpers untuk testing
        markEndpointFailure, markEndpointSuccess, isEndpointDead,
    },
};
