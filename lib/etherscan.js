/** Backend RPC publik gratis untuk chain EVM (tanpa API key). */
const { withRetry } = require("./util");

const RPCS = {
    1:     "https://eth.llamarpc.com",
    56:    "https://binance.llamarpc.com",
    137:   "https://polygon.llamarpc.com",
    42161: "https://arbitrum.llamarpc.com",
};

const NAMES = {
    1:     "Ethereum",
    56:    "BNB Chain",
    137:   "Polygon",
    42161: "Arbitrum",
};

function chainName(chainId) {
    return NAMES[chainId] || `chain${chainId}`;
}

/**
 * Cek saldo banyak alamat sekaligus via JSON-RPC batch.
 * Satu HTTP POST berisi array banyak request `eth_getBalance`.
 * Jauh lebih cepat daripada 1 request per alamat.
 */
async function balanceMulti(chainId, addresses, limiter) {
    const url = RPCS[chainId];
    if (!url) throw new Error(`Chain ${chainId} tidak didukung`);

    const out = new Map();
    if (addresses.length === 0) return out;

    if (limiter) await limiter();

    const payload = addresses.map((addr, i) => ({
        jsonrpc: "2.0",
        id: i,
        method: "eth_getBalance",
        params: [addr, "latest"],
    }));

    try {
        const data = await withRetry(async () => {
            const res = await fetch(url, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        });

        if (Array.isArray(data)) {
            for (const r of data) {
                const addr = addresses[r.id];
                if (!addr) continue;
                let bal = 0n;
                try { if (r.result) bal = BigInt(r.result); } catch {}
                out.set(addr.toLowerCase(), bal);
            }
        }
        for (const a of addresses) {
            const k = a.toLowerCase();
            if (!out.has(k)) out.set(k, 0n);
        }
    } catch {
        for (const a of addresses) out.set(a.toLowerCase(), 0n);
    }
    return out;
}

module.exports = { balanceMulti, chainName };
