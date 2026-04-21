/** Backend RPC publik gratis untuk chain EVM (tanpa API key). */
const { withRetry } = require("./util");
const rpcStats = require("./rpcStats");

const RPCS = {
    1: [
        "https://eth.llamarpc.com",
        "https://ethereum-rpc.publicnode.com",
        "https://rpc.ankr.com/eth",
        "https://cloudflare-eth.com",
    ],
    56: [
        "https://binance.llamarpc.com",
        "https://bsc-rpc.publicnode.com",
        "https://bsc-dataseed.binance.org",
    ],
    137: [
        "https://polygon.llamarpc.com",
        "https://polygon-bor-rpc.publicnode.com",
        "https://polygon-rpc.com",
    ],
    42161: [
        "https://arbitrum.llamarpc.com",
        "https://arbitrum-one-rpc.publicnode.com",
        "https://arb1.arbitrum.io/rpc",
    ],
};

const NAMES = {
    1:     "Ethereum",
    56:    "BNB Chain",
    137:   "Polygon",
    42161: "Arbitrum",
};

// Index RPC yang terakhir berhasil per chain — supaya request berikutnya
// tidak buang waktu mencoba endpoint yang sebelumnya gagal.
const lastGood = new Map();

function chainName(chainId) {
    return NAMES[chainId] || `chain${chainId}`;
}

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
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } finally {
        clearTimeout(t);
    }
}

/**
 * Cek saldo banyak alamat sekaligus via JSON-RPC batch.
 * Jika RPC pertama gagal/timeout, otomatis pindah ke RPC cadangan.
 */
async function balanceMulti(chainId, addresses, limiter) {
    const urls = RPCS[chainId];
    if (!urls) throw new Error(`Chain ${chainId} tidak didukung`);

    const out = new Map();
    if (addresses.length === 0) return out;

    if (limiter) await limiter();

    const payload = addresses.map((addr, i) => ({
        jsonrpc: "2.0",
        id: i,
        method: "eth_getBalance",
        params: [addr, "latest"],
    }));

    const startIdx = lastGood.get(chainId) ?? 0;
    let data = null;
    let lastErr = null;
    const label = `EVM/${chainName(chainId)}`;
    for (let off = 0; off < urls.length; off++) {
        const idx = (startIdx + off) % urls.length;
        const url = urls[idx];
        try {
            data = await withRetry(() => postJsonRpc(url, payload), 2, 400);
            lastGood.set(chainId, idx);
            rpcStats.recordOk(label, url);
            break;
        } catch (e) {
            lastErr = e;
            rpcStats.recordFail(label, url);
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
        if (lastErr) throw lastErr;
    }
    return out;
}

module.exports = { balanceMulti, chainName };
