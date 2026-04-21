/** Backend RPC publik gratis untuk chain EVM (tanpa API key). */
const { JsonRpcProvider } = require("ethers");
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

const providerCache = new Map();

function getProvider(chainId) {
    if (!providerCache.has(chainId)) {
        const url = RPCS[chainId];
        if (!url) throw new Error(`Chain ${chainId} tidak didukung`);
        providerCache.set(chainId, new JsonRpcProvider(url, chainId, { staticNetwork: true }));
    }
    return providerCache.get(chainId);
}

function chainName(chainId) {
    return NAMES[chainId] || `chain${chainId}`;
}

async function balanceMulti(chainId, addresses, limiter) {
    const provider = getProvider(chainId);
    const out      = new Map();
    for (const addr of addresses) {
        if (limiter) await limiter();
        try {
            const bal = await withRetry(() => provider.getBalance(addr), 3, 500);
            out.set(addr.toLowerCase(), bal);
        } catch {
            out.set(addr.toLowerCase(), 0n);
        }
    }
    return out;
}

module.exports = { balanceMulti, chainName };
