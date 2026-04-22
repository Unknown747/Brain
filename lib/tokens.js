/**
 * Daftar token ERC-20 populer per chain + helper untuk cek saldo via
 * eth_call balanceOf(address) batch.
 *
 * Banyak brainwallet menyimpan stablecoin (USDT/USDC) tetapi ETH-nya kosong
 * untuk gas — tanpa cek token, mereka tidak terdeteksi.
 *
 * Dipakai oleh auditor_brainwallet kalau opsi `checkTokens` aktif (default ON).
 */

// Selector untuk ERC-20 balanceOf(address): keccak256("balanceOf(address)")[0..4]
const BALANCE_OF = "0x70a08231";

// Token utama per chain (symbol → { address, decimals }).
// Kriteria: stablecoin populer + WETH/wrapped + 1-2 token blue-chip lokal.
const TOKENS = {
    1: { // Ethereum
        USDT: { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
        USDC: { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
        DAI:  { address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18 },
        WETH: { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18 },
        LINK: { address: "0x514910771AF9Ca656af840dff83E8264EcF986CA", decimals: 18 },
    },
    56: { // BNB Chain
        USDT: { address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18 },
        USDC: { address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18 },
        BUSD: { address: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56", decimals: 18 },
        DAI:  { address: "0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3", decimals: 18 },
        ETH:  { address: "0x2170Ed0880ac9A755fd29B2688956BD959F933F8", decimals: 18 },
    },
    137: { // Polygon
        USDT:   { address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", decimals: 6  },
        USDC:   { address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", decimals: 6  },
        DAI:    { address: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063", decimals: 18 },
        WETH:   { address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", decimals: 18 },
        WMATIC: { address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", decimals: 18 },
    },
    42161: { // Arbitrum
        USDT: { address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", decimals: 6  },
        USDC: { address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6  },
        DAI:  { address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", decimals: 18 },
        WETH: { address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", decimals: 18 },
        ARB:  { address: "0x912CE59144191C1204E64559FE8253a0e49E6548", decimals: 18 },
    },
    10: { // Optimism
        USDT: { address: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58", decimals: 6  },
        USDC: { address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", decimals: 6  },
        DAI:  { address: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", decimals: 18 },
        WETH: { address: "0x4200000000000000000000000000000000000006", decimals: 18 },
        OP:   { address: "0x4200000000000000000000000000000000000042", decimals: 18 },
    },
    8453: { // Base
        USDC: { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6  },
        DAI:  { address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", decimals: 18 },
        WETH: { address: "0x4200000000000000000000000000000000000006", decimals: 18 },
    },
    43114: { // Avalanche
        USDT:  { address: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7", decimals: 6  },
        USDC:  { address: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", decimals: 6  },
        DAI:   { address: "0xd586E7F844cEa2F87f50152665BCbc2C279D8d70", decimals: 18 },
        WAVAX: { address: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7", decimals: 18 },
    },
    100: { // Gnosis
        USDT: { address: "0x4ECaBa5870353805a9F068101A40E0f32ed605C6", decimals: 6  },
        USDC: { address: "0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83", decimals: 6  },
        WETH: { address: "0x6A023CCd1ff6F2045C3309768eAd9E68F978f6e1", decimals: 18 },
    },
    59144: { // Linea
        USDC: { address: "0x176211869cA2b568f2A7D4EE941E073a821EE1ff", decimals: 6  },
        WETH: { address: "0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f", decimals: 18 },
    },
    534352: { // Scroll
        USDC: { address: "0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4", decimals: 6  },
        USDT: { address: "0xf55BEC9cafDbE8730f096Aa55dad6D22d44099Df", decimals: 6  },
        WETH: { address: "0x5300000000000000000000000000000000000004", decimals: 18 },
    },
    324: { // zkSync Era
        USDC: { address: "0x1d17CBcF0D6D143135aE902365D2E5e2A16538D4", decimals: 6  },
        WETH: { address: "0x5AEa5775959fBC2557Cc8789bC1bf90A239D9a91", decimals: 18 },
    },
    25: { // Cronos
        USDC: { address: "0xc21223249CA28397B4B6541dfFaEcC539BfF0c59", decimals: 6  },
        USDT: { address: "0x66e428c3f67a68878562e79A0234c1F83c208770", decimals: 6  },
        WCRO: { address: "0x5C7F8A570d578ED84E63fdFA7b1eE72dEae1AE23", decimals: 18 },
    },
    42220: { // Celo
        cUSD: { address: "0x765DE816845861e75A25fCA122bb6898B8B1282a", decimals: 18 },
        USDC: { address: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C", decimals: 6  },
        USDT: { address: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e", decimals: 6  },
    },
    1284: { // Moonbeam
        USDC:  { address: "0xFFFFFFfFea09FB06d082fd1275CD48b191cbCD1d", decimals: 6  },
        WGLMR: { address: "0xAcc15dC74880C9944775448304B263D191c6077F", decimals: 18 },
    },
    5000: { // Mantle
        USDC: { address: "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9", decimals: 6  },
        USDT: { address: "0x201EBa5CC46D216Ce6DC03F6a759e8E766e956aE", decimals: 6  },
        WMNT: { address: "0x78c1b0C915c4FAA5FffA6CAbf0219DA63d7f4cb8", decimals: 18 },
    },
    81457: { // Blast
        USDB: { address: "0x4300000000000000000000000000000000000003", decimals: 18 },
        WETH: { address: "0x4300000000000000000000000000000000000004", decimals: 18 },
    },
    204: { // opBNB
        USDT: { address: "0x9e5AAC1Ba1a2e6aEd6b32689DFcF62A509Ca96f3", decimals: 18 },
    },
    1101: { // Polygon zkEVM
        USDC: { address: "0xA8CE8aee21bC2A48a5EF670afCc9274C7bbbC035", decimals: 6  },
        WETH: { address: "0x4F9A0e7FD2Bf6067db6994CF12E4495Df938E6e9", decimals: 18 },
    },
};

function tokensForChain(chainId) {
    return TOKENS[chainId] || {};
}

function chainHasTokens(chainId) {
    return !!TOKENS[chainId] && Object.keys(TOKENS[chainId]).length > 0;
}

/** Bangun calldata untuk balanceOf(address). Selector + 32-byte zero-pad address. */
function makeBalanceOfData(holderAddress) {
    const addr = holderAddress.toLowerCase().replace(/^0x/, "");
    return BALANCE_OF + addr.padStart(64, "0");
}

module.exports = { TOKENS, tokensForChain, chainHasTokens, makeBalanceOfData };
