/** Backend RPC publik gratis untuk chain EVM (tanpa API key). */
const { withRetry, createRateLimiter } = require("./util");
const rpcStats = require("./rpcStats");

// Daftar endpoint per chain (urut berdasarkan reliabilitas).
// Arbitrum diperbanyak karena RPC publiknya paling cepat kena rate-limit.
const RPCS = {
    1: [
        "https://eth.llamarpc.com",
        "https://ethereum-rpc.publicnode.com",
        "https://rpc.ankr.com/eth",
        "https://cloudflare-eth.com",
        "https://eth.drpc.org",
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
    42161: [
        "https://arbitrum.llamarpc.com",
        "https://arbitrum-one-rpc.publicnode.com",
        "https://arbitrum.drpc.org",
        "https://arb1.arbitrum.io/rpc",
        "https://1rpc.io/arb",
        "https://arbitrum.blockpi.network/v1/rpc/public",
        "https://arbitrum.api.onfinality.io/public",
    ],
};

const NAMES = {
    1:     "Ethereum",
    56:    "BNB Chain",
    137:   "Polygon",
    42161: "Arbitrum",
};

// Tuning per-chain: rps & batch-size yang aman untuk RPC publik gratisan.
// Arbitrum lebih ketat karena penyedia gratis sengaja batasi (TPS L2 tinggi).
// Auditor akan ambil min(opts, TUNING) → user tetap bisa turunkan via config.
const TUNING = {
    1:     { rps: 5, batch: 100 },
    56:    { rps: 5, batch: 100 },
    137:   { rps: 5, batch: 100 },
    42161: { rps: 2, batch: 25 },
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

// ── Per-chain limiter (di-cache, dibuat saat pertama dipakai) ─────────
const limiters = new Map();
function getChainLimiter(chainId, maxRps) {
    const rps = Math.max(1, Math.min(maxRps ?? 5, getChainRps(chainId)));
    const key = `${chainId}:${rps}`;
    if (!limiters.has(key)) limiters.set(key, createRateLimiter(rps));
    return limiters.get(key);
}

// ── Adaptive cooldown — kalau chain spam 429, pause sebentar ─────────
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
    // Exponential backoff: 1s, 2s, 4s, 8s, … capped 30s.
    // Atau honor retry-after kalau server kasih hint lebih besar.
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
            err.rateLimited = true;
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
 * Per-chain rate-limit + adaptive cooldown saat 429.
 * Jika RPC pertama gagal/timeout, otomatis pindah ke RPC cadangan.
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

    const startIdx   = lastGood.get(chainId) ?? 0;
    const label      = `EVM/${chainName(chainId)}`;
    let   data       = null;
    let   lastErr    = null;
    let   all429     = true;
    let   maxRetryAfter = 0;

    for (let off = 0; off < urls.length; off++) {
        const idx = (startIdx + off) % urls.length;
        const url = urls[idx];
        try {
            data = await withRetry(() => postJsonRpc(url, payload), 2, 400);
            lastGood.set(chainId, idx);
            rpcStats.recordOk(label, url);
            all429 = false;
            reset429(chainId);
            break;
        } catch (e) {
            lastErr = e;
            rpcStats.recordFail(label, url);
            if (!e.rateLimited) all429 = false;
            else if (e.retryAfterMs) maxRetryAfter = Math.max(maxRetryAfter, e.retryAfterMs);
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
        // Kalau penyebabnya 429 di SEMUA endpoint, masuk cooldown.
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
    // diekspos untuk testing/observability
    _internal: { cooldownUntil, failStreak, RPCS, TUNING },
};
