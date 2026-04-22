/**
 * Backend RPC publik gratis untuk chain EVM (tanpa API key).
 *
 * Fitur ketahanan:
 *  - Banyak endpoint per chain (drpc, llamarpc, publicnode, ankr, 1rpc, dst).
 *  - Circuit breaker: endpoint yang baru saja gagal "didinginkan" sementara
 *    sehingga tidak dicoba lagi sampai cooldown habis. Mencegah RPC lambat
 *    (mis. Arbitrum sering rate-limit) menahan keseluruhan audit.
 *  - Sticky last-good: request berikut mulai dari endpoint yang terakhir sukses.
 *  - Timeout per request pendek (8 dtk) supaya failover cepat.
 *  - Auto-split: kalau RPC menolak batch besar (HTTP 413/-32600/payload limit),
 *    payload otomatis dipecah dan dicoba ulang.
 */

const { withRetry } = require("./util");
const rpcStats = require("./rpcStats");

const RPCS = {
    1: [ // Ethereum
        "https://eth.llamarpc.com",
        "https://ethereum-rpc.publicnode.com",
        "https://rpc.ankr.com/eth",
        "https://cloudflare-eth.com",
        "https://eth.drpc.org",
        "https://1rpc.io/eth",
        "https://rpc.flashbots.net",
    ],
    56: [ // BNB Chain
        "https://binance.llamarpc.com",
        "https://bsc-rpc.publicnode.com",
        "https://bsc-dataseed.binance.org",
        "https://bsc-dataseed1.defibit.io",
        "https://bsc-dataseed1.ninicoin.io",
        "https://bsc.drpc.org",
        "https://1rpc.io/bnb",
    ],
    137: [ // Polygon
        "https://polygon.llamarpc.com",
        "https://polygon-bor-rpc.publicnode.com",
        "https://polygon-rpc.com",
        "https://polygon.drpc.org",
        "https://1rpc.io/matic",
        "https://rpc.ankr.com/polygon",
    ],
    42161: [ // Arbitrum One
        "https://arbitrum.llamarpc.com",
        "https://arbitrum-one-rpc.publicnode.com",
        "https://arb1.arbitrum.io/rpc",
        "https://arbitrum.drpc.org",
        "https://1rpc.io/arb",
        "https://rpc.ankr.com/arbitrum",
        "https://arb-mainnet.public.blastapi.io",
    ],
    10: [ // Optimism
        "https://optimism.llamarpc.com",
        "https://optimism-rpc.publicnode.com",
        "https://mainnet.optimism.io",
        "https://optimism.drpc.org",
        "https://1rpc.io/op",
        "https://rpc.ankr.com/optimism",
    ],
    8453: [ // Base
        "https://base.llamarpc.com",
        "https://base-rpc.publicnode.com",
        "https://mainnet.base.org",
        "https://base.drpc.org",
        "https://1rpc.io/base",
    ],
    43114: [ // Avalanche C-Chain
        "https://avalanche-c-chain-rpc.publicnode.com",
        "https://api.avax.network/ext/bc/C/rpc",
        "https://avalanche.drpc.org",
        "https://1rpc.io/avax/c",
        "https://rpc.ankr.com/avalanche",
    ],
};

const NAMES = {
    1:     "Ethereum",
    56:    "BNB Chain",
    137:   "Polygon",
    42161: "Arbitrum",
    10:    "Optimism",
    8453:  "Base",
    43114: "Avalanche",
};

// Sticky pointer ke endpoint terakhir yang sukses per chain.
const lastGood = new Map();

// Circuit breaker per URL: { until: epoch_ms } — RPC dilewati sampai waktu ini.
const cooldown = new Map();
const COOLDOWN_MS = 60_000;     // 60 detik istirahat setelah gagal
const REQUEST_TIMEOUT_MS = 8_000;

function chainName(chainId) {
    return NAMES[chainId] || `chain${chainId}`;
}

function isCoolingDown(url) {
    const u = cooldown.get(url);
    return u && u > Date.now();
}

function markCooldown(url) {
    cooldown.set(url, Date.now() + COOLDOWN_MS);
}

function clearCooldown(url) {
    cooldown.delete(url);
}

async function postJsonRpc(url, payload, timeoutMs = REQUEST_TIMEOUT_MS) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
            signal: ctrl.signal,
        });
        if (!res.ok) {
            const err = new Error(`HTTP ${res.status}`);
            err.status = res.status;
            throw err;
        }
        return await res.json();
    } finally {
        clearTimeout(t);
    }
}

function isPayloadTooLarge(err) {
    if (!err) return false;
    if (err.status === 413) return true;
    const msg = String(err.message || "").toLowerCase();
    return msg.includes("payload") || msg.includes("too large") || msg.includes("batch");
}

/** Kirim batch eth_getBalance ke satu endpoint dengan auto-split kalau payload ditolak. */
async function callBatch(url, addresses) {
    const payload = addresses.map((addr, i) => ({
        jsonrpc: "2.0",
        id: i,
        method: "eth_getBalance",
        params: [addr, "latest"],
    }));
    try {
        const data = await postJsonRpc(url, payload);
        if (!Array.isArray(data)) throw new Error("respons RPC tidak valid");
        return data.map((r) => ({ id: r.id, result: r.result }));
    } catch (e) {
        // Pecah jadi 2 bila kemungkinan batch terlalu besar.
        if (isPayloadTooLarge(e) && addresses.length > 10) {
            const mid = Math.floor(addresses.length / 2);
            const left  = addresses.slice(0, mid);
            const right = addresses.slice(mid);
            const a = await callBatch(url, left);
            const b = await callBatch(url, right);
            return [
                ...a,
                ...b.map((r) => ({ id: r.id + mid, result: r.result })),
            ];
        }
        throw e;
    }
}

/**
 * Cek saldo banyak alamat sekaligus via JSON-RPC batch.
 * Jika RPC pertama gagal/timeout/cooldown, otomatis pindah ke RPC cadangan.
 */
async function balanceMulti(chainId, addresses, limiter) {
    const urls = RPCS[chainId];
    if (!urls) throw new Error(`Chain ${chainId} tidak didukung`);

    const out = new Map();
    if (addresses.length === 0) return out;
    if (limiter) await limiter();

    const startIdx = lastGood.get(chainId) ?? 0;
    const label = `EVM/${chainName(chainId)}`;
    let data = null;
    let lastErr = null;

    for (let off = 0; off < urls.length; off++) {
        const idx = (startIdx + off) % urls.length;
        const url = urls[idx];
        if (isCoolingDown(url)) continue;
        try {
            data = await withRetry(() => callBatch(url, addresses), 1, 300);
            lastGood.set(chainId, idx);
            clearCooldown(url);
            rpcStats.recordOk(label, url);
            break;
        } catch (e) {
            lastErr = e;
            markCooldown(url);
            rpcStats.recordFail(label, url);
        }
    }

    // Kalau semua dalam cooldown, paksa coba lagi (abaikan cooldown) supaya
    // audit tidak macet total.
    if (!data) {
        for (let off = 0; off < urls.length; off++) {
            const idx = (startIdx + off) % urls.length;
            const url = urls[idx];
            try {
                data = await callBatch(url, addresses);
                lastGood.set(chainId, idx);
                clearCooldown(url);
                rpcStats.recordOk(label, url);
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
        for (const a of addresses) out.set(a.toLowerCase(), 0n);
        if (lastErr) throw lastErr;
    }
    return out;
}

module.exports = { balanceMulti, chainName, RPCS, NAMES };
