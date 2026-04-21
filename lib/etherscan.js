/** Backend RPC publik gratis untuk chain EVM (tanpa API key). */
const { JsonRpcProvider } = require("ethers");

const RPCS = {
    1: "https://eth.llamarpc.com",
    10: "https://optimism.llamarpc.com",
    56: "https://binance.llamarpc.com",
    137: "https://polygon.llamarpc.com",
    8453: "https://base.llamarpc.com",
    42161: "https://arbitrum.llamarpc.com",
    43114: "https://avalanche-c-chain-rpc.publicnode.com",
};

const NAMES = {
    1: "Ethereum",
    10: "Optimism",
    56: "BNB Chain",
    137: "Polygon",
    8453: "Base",
    42161: "Arbitrum",
    43114: "Avalanche",
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
    const out = new Map();
    for (const addr of addresses) {
        if (limiter) await limiter();
        try {
            out.set(addr.toLowerCase(), await provider.getBalance(addr));
        } catch {
            out.set(addr.toLowerCase(), 0n);
        }
    }
    return out;
}

module.exports = { balanceMulti, chainName };
