/**
 * Backend RPC publik gratis untuk chain EVM (tanpa API key).
 *
 * Fitur ketahanan:
 *  - Banyak endpoint per chain (drpc, llamarpc, publicnode, ankr, 1rpc, blast,
 *    onfinality, omniatech, dst).
 *  - Circuit breaker: endpoint yang baru saja gagal "didinginkan" sementara
 *    sehingga tidak dicoba lagi sampai cooldown habis.
 *  - Sticky last-good: request berikut mulai dari endpoint yang terakhir sukses.
 *  - Mode "race": untuk chain yang notoriously lambat (Arbitrum), 2 endpoint
 *    pertama yang sehat ditembak paralel — pemenang dipakai, sisanya dibatalkan.
 *  - Timeout adaptif per chain — chain yang sering lambat dapat timeout lebih lama.
 *  - Auto-split: kalau RPC menolak batch besar (HTTP 413/-32600/payload limit),
 *    payload otomatis dipecah dan dicoba ulang.
 *  - Batch size per chain — chain yang sensitif rate-limit pakai batch kecil.
 *
 * Helper tambahan:
 *  - codeOfMulti  → batch eth_getCode untuk deteksi smart-contract (#3)
 *  - tokenBalancesMulti → batch eth_call balanceOf(...) untuk ERC-20 (#4)
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
        "https://eth-mainnet.public.blastapi.io",
        "https://ethereum.api.onfinality.io/public",
        "https://endpoints.omniatech.io/v1/eth/mainnet/public",
    ],
    56: [ // BNB Chain
        "https://binance.llamarpc.com",
        "https://bsc-rpc.publicnode.com",
        "https://bsc-dataseed.binance.org",
        "https://bsc-dataseed1.defibit.io",
        "https://bsc-dataseed1.ninicoin.io",
        "https://bsc.drpc.org",
        "https://1rpc.io/bnb",
        "https://bsc-mainnet.public.blastapi.io",
        "https://bsc.api.onfinality.io/public",
        "https://endpoints.omniatech.io/v1/bsc/mainnet/public",
    ],
    137: [ // Polygon
        "https://polygon.llamarpc.com",
        "https://polygon-bor-rpc.publicnode.com",
        "https://polygon-rpc.com",
        "https://polygon.drpc.org",
        "https://1rpc.io/matic",
        "https://rpc.ankr.com/polygon",
        "https://polygon-mainnet.public.blastapi.io",
        "https://polygon.api.onfinality.io/public",
        "https://endpoints.omniatech.io/v1/matic/mainnet/public",
    ],
    42161: [ // Arbitrum One — daftar diperluas + diversifikasi (sering rate-limit)
        "https://arbitrum-one-rpc.publicnode.com",
        "https://arbitrum.llamarpc.com",
        "https://arb1.arbitrum.io/rpc",
        "https://arbitrum.drpc.org",
        "https://1rpc.io/arb",
        "https://rpc.ankr.com/arbitrum",
        "https://arb-mainnet.public.blastapi.io",
        "https://arbitrum-one.public.blastapi.io",
        "https://arbitrum.api.onfinality.io/public",
        "https://endpoints.omniatech.io/v1/arbitrum/one/public",
        "https://arbitrum.meowrpc.com",
        "https://arbitrum.rpc.subquery.network/public",
    ],
    10: [ // Optimism
        "https://optimism.llamarpc.com",
        "https://optimism-rpc.publicnode.com",
        "https://mainnet.optimism.io",
        "https://optimism.drpc.org",
        "https://1rpc.io/op",
        "https://rpc.ankr.com/optimism",
        "https://optimism-mainnet.public.blastapi.io",
        "https://optimism.api.onfinality.io/public",
        "https://endpoints.omniatech.io/v1/op/mainnet/public",
    ],
    8453: [ // Base
        "https://base.llamarpc.com",
        "https://base-rpc.publicnode.com",
        "https://mainnet.base.org",
        "https://base.drpc.org",
        "https://1rpc.io/base",
        "https://base-mainnet.public.blastapi.io",
        "https://base.api.onfinality.io/public",
        "https://endpoints.omniatech.io/v1/base/mainnet/public",
        "https://base.meowrpc.com",
    ],
    43114: [ // Avalanche C-Chain
        "https://avalanche-c-chain-rpc.publicnode.com",
        "https://api.avax.network/ext/bc/C/rpc",
        "https://avalanche.drpc.org",
        "https://1rpc.io/avax/c",
        "https://rpc.ankr.com/avalanche",
        "https://ava-mainnet.public.blastapi.io/ext/bc/C/rpc",
        "https://avalanche.api.onfinality.io/public/ext/bc/C/rpc",
        "https://endpoints.omniatech.io/v1/avax/mainnet/public",
    ],
    250: [ // Fantom Opera
        "https://rpc.ftm.tools",
        "https://fantom-rpc.publicnode.com",
        "https://rpc.ankr.com/fantom",
        "https://fantom.drpc.org",
        "https://1rpc.io/ftm",
        "https://fantom-mainnet.public.blastapi.io",
        "https://fantom.api.onfinality.io/public",
    ],
    100: [ // Gnosis Chain (xDAI)
        "https://rpc.gnosischain.com",
        "https://gnosis-rpc.publicnode.com",
        "https://gnosis.drpc.org",
        "https://rpc.ankr.com/gnosis",
        "https://1rpc.io/gnosis",
        "https://gnosis-mainnet.public.blastapi.io",
        "https://gnosis.api.onfinality.io/public",
    ],
    59144: [ // Linea
        "https://rpc.linea.build",
        "https://linea-rpc.publicnode.com",
        "https://linea.drpc.org",
        "https://1rpc.io/linea",
        "https://linea-mainnet.public.blastapi.io",
    ],
    534352: [ // Scroll
        "https://rpc.scroll.io",
        "https://scroll-rpc.publicnode.com",
        "https://scroll.drpc.org",
        "https://1rpc.io/scroll",
        "https://scroll-mainnet.public.blastapi.io",
    ],
    324: [ // zkSync Era
        "https://mainnet.era.zksync.io",
        "https://zksync.drpc.org",
        "https://1rpc.io/zksync2-era",
        "https://zksync-mainnet.public.blastapi.io",
        "https://zksync.meowrpc.com",
    ],
    // ───── Chain BARU ─────
    25: [ // Cronos
        "https://evm.cronos.org",
        "https://cronos-evm-rpc.publicnode.com",
        "https://cronos.drpc.org",
        "https://1rpc.io/cro",
        "https://cronos.blockpi.network/v1/rpc/public",
    ],
    42220: [ // Celo
        "https://forno.celo.org",
        "https://celo-rpc.publicnode.com",
        "https://rpc.ankr.com/celo",
        "https://1rpc.io/celo",
        "https://celo.drpc.org",
    ],
    1284: [ // Moonbeam
        "https://rpc.api.moonbeam.network",
        "https://moonbeam-rpc.publicnode.com",
        "https://moonbeam.drpc.org",
        "https://1rpc.io/glmr",
        "https://rpc.ankr.com/moonbeam",
    ],
    5000: [ // Mantle
        "https://rpc.mantle.xyz",
        "https://mantle-rpc.publicnode.com",
        "https://mantle.drpc.org",
        "https://1rpc.io/mantle",
        "https://rpc.ankr.com/mantle",
    ],
    81457: [ // Blast
        "https://rpc.blast.io",
        "https://blast-rpc.publicnode.com",
        "https://blast.drpc.org",
        "https://rpc.ankr.com/blast",
    ],
    204: [ // opBNB
        "https://opbnb-mainnet-rpc.bnbchain.org",
        "https://opbnb-rpc.publicnode.com",
        "https://opbnb.drpc.org",
        "https://1rpc.io/opbnb",
    ],
    1101: [ // Polygon zkEVM
        "https://zkevm-rpc.com",
        "https://polygon-zkevm-rpc.publicnode.com",
        "https://polygon-zkevm.drpc.org",
        "https://1rpc.io/polygon/zkevm",
        "https://rpc.ankr.com/polygon_zkevm",
    ],
};

// Per-chain meta: nama, ukuran batch optimal, mode race, timeout per request.
const CHAIN_META = {
    1:      { name: "Ethereum",     batch: 100, timeout: 8_000  },
    56:     { name: "BNB Chain",    batch: 100, timeout: 8_000  },
    137:    { name: "Polygon",      batch: 80,  timeout: 8_000  },
    42161:  { name: "Arbitrum",     batch: 40,  timeout: 10_000, race: 2 },
    10:     { name: "Optimism",     batch: 80,  timeout: 8_000  },
    8453:   { name: "Base",         batch: 80,  timeout: 8_000  },
    43114:  { name: "Avalanche",    batch: 80,  timeout: 8_000  },
    250:    { name: "Fantom",       batch: 80,  timeout: 8_000  },
    100:    { name: "Gnosis",       batch: 60,  timeout: 8_000  },
    59144:  { name: "Linea",        batch: 50,  timeout: 10_000 },
    534352: { name: "Scroll",       batch: 50,  timeout: 10_000 },
    324:    { name: "zkSync Era",   batch: 50,  timeout: 10_000 },
    25:     { name: "Cronos",       batch: 60,  timeout: 10_000 },
    42220:  { name: "Celo",         batch: 60,  timeout: 10_000 },
    1284:   { name: "Moonbeam",     batch: 60,  timeout: 10_000 },
    5000:   { name: "Mantle",       batch: 50,  timeout: 10_000 },
    81457:  { name: "Blast",        batch: 50,  timeout: 10_000 },
    204:    { name: "opBNB",        batch: 60,  timeout: 10_000 },
    1101:   { name: "Polygon zkEVM",batch: 50,  timeout: 10_000 },
};

const NAMES = Object.fromEntries(
    Object.entries(CHAIN_META).map(([id, m]) => [id, m.name])
);

const DEFAULT_TIMEOUT_MS = 8_000;
const COOLDOWN_MS        = 60_000;

const lastGood = new Map();   // chainId → idx terakhir sukses
const cooldown = new Map();   // url → cooldown_until_ms

function chainName(chainId)              { return CHAIN_META[chainId]?.name    || `chain${chainId}`; }
function chainBatchSize(chainId, fb=80)  { return CHAIN_META[chainId]?.batch || fb; }
function chainTimeout(chainId)           { return CHAIN_META[chainId]?.timeout || DEFAULT_TIMEOUT_MS; }
function isCoolingDown(url)              { const u = cooldown.get(url); return u && u > Date.now(); }
function markCooldown(url)               { cooldown.set(url, Date.now() + COOLDOWN_MS); }
function clearCooldown(url)              { cooldown.delete(url); }

/**
 * Tambahkan RPC baru ke chain (dipakai oleh auto-discovery chainlist.org).
 * Endpoint duplikat di-skip. Endpoint baru ditaruh di akhir daftar (prioritas
 * lebih rendah daripada yang sudah hard-coded — yang sudah teruji menang).
 */
function addRpcs(chainId, urls) {
    if (!Array.isArray(urls) || urls.length === 0) return 0;
    if (!RPCS[chainId]) RPCS[chainId] = [];
    const have = new Set(RPCS[chainId].map((u) => u.replace(/\/+$/, "")));
    let added = 0;
    for (const u of urls) {
        const norm = u.replace(/\/+$/, "");
        if (!have.has(norm)) { RPCS[chainId].push(norm); have.add(norm); added++; }
    }
    return added;
}

function supportedChains() {
    return Object.keys(RPCS).map((s) => parseInt(s, 10));
}

async function postJsonRpc(url, payload, timeoutMs) {
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
    } finally { clearTimeout(t); }
}

function isPayloadTooLarge(err) {
    if (!err) return false;
    if (err.status === 413) return true;
    const msg = String(err.message || "").toLowerCase();
    return msg.includes("payload") || msg.includes("too large") || msg.includes("batch");
}

/**
 * Kirim batch JSON-RPC arbitrer ke satu endpoint dengan auto-split.
 * `requests` = array { method, params } — id ditambahkan otomatis.
 * Returns array { id, result } sejajar dengan requests (id = index aslinya).
 */
async function callBatchGeneric(url, requests, timeoutMs) {
    const payload = requests.map((r, i) => ({
        jsonrpc: "2.0", id: i, method: r.method, params: r.params,
    }));
    try {
        const data = await postJsonRpc(url, payload, timeoutMs);
        if (!Array.isArray(data)) throw new Error("respons RPC tidak valid");
        return data.map((r) => ({ id: r.id, result: r.result }));
    } catch (e) {
        if (isPayloadTooLarge(e) && requests.length > 10) {
            const mid = Math.floor(requests.length / 2);
            const left  = requests.slice(0, mid);
            const right = requests.slice(mid);
            const a = await callBatchGeneric(url, left,  timeoutMs);
            const b = await callBatchGeneric(url, right, timeoutMs);
            return [...a, ...b.map((r) => ({ id: r.id + mid, result: r.result }))];
        }
        throw e;
    }
}

function pickHealthyUrls(chainId, n) {
    const urls = RPCS[chainId];
    const startIdx = lastGood.get(chainId) ?? 0;
    const picks = [];
    for (let off = 0; off < urls.length && picks.length < n; off++) {
        const idx = (startIdx + off) % urls.length;
        if (!isCoolingDown(urls[idx])) picks.push({ idx, url: urls[idx] });
    }
    return picks;
}

/**
 * Eksekusi requests pada chain dengan strategi race → sequential → force.
 * Returns array { id, result } atau throw kalau semua endpoint gagal.
 */
async function executeOnChain(chainId, requests, label) {
    const urls = RPCS[chainId];
    if (!urls) throw new Error(`Chain ${chainId} tidak didukung`);
    const meta    = CHAIN_META[chainId] || {};
    const timeout = chainTimeout(chainId);
    let   data    = null;
    let   lastErr = null;

    if (meta.race && meta.race > 1) {
        const picks = pickHealthyUrls(chainId, Math.min(meta.race, urls.length));
        if (picks.length >= 2) {
            try {
                const winner = await Promise.any(picks.map(async (p) => {
                    const r = await callBatchGeneric(p.url, requests, timeout);
                    return { r, ...p };
                }));
                lastGood.set(chainId, winner.idx);
                clearCooldown(winner.url);
                rpcStats.recordOk(label, winner.url);
                data = winner.r;
            } catch (e) {
                for (const p of picks) {
                    markCooldown(p.url);
                    rpcStats.recordFail(label, p.url);
                }
                lastErr = e;
            }
        }
    }
    if (!data) {
        const startIdx = lastGood.get(chainId) ?? 0;
        for (let off = 0; off < urls.length; off++) {
            const idx = (startIdx + off) % urls.length;
            const url = urls[idx];
            if (isCoolingDown(url)) continue;
            try {
                data = await withRetry(() => callBatchGeneric(url, requests, timeout), 1, 300);
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
    }
    if (!data) {
        const startIdx = lastGood.get(chainId) ?? 0;
        for (let off = 0; off < urls.length; off++) {
            const idx = (startIdx + off) % urls.length;
            const url = urls[idx];
            try {
                data = await callBatchGeneric(url, requests, timeout);
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
    if (!Array.isArray(data)) {
        if (lastErr) throw lastErr;
        throw new Error(`semua RPC chain ${chainId} gagal`);
    }
    return data;
}

/** Cek saldo native untuk banyak alamat (eth_getBalance batch). */
async function balanceMulti(chainId, addresses, limiter) {
    const out = new Map();
    if (addresses.length === 0) return out;
    if (limiter) await limiter();

    const requests = addresses.map((a) => ({ method: "eth_getBalance", params: [a, "latest"] }));
    const label    = `EVM/${chainName(chainId)}`;
    let data;
    try { data = await executeOnChain(chainId, requests, label); }
    catch (e) {
        for (const a of addresses) out.set(a.toLowerCase(), 0n);
        throw e;
    }
    for (const r of data) {
        const addr = addresses[r.id]; if (!addr) continue;
        let bal = 0n;
        try { if (r.result) bal = BigInt(r.result); } catch {}
        out.set(addr.toLowerCase(), bal);
    }
    for (const a of addresses) {
        const k = a.toLowerCase(); if (!out.has(k)) out.set(k, 0n);
    }
    return out;
}

/**
 * Cek apakah alamat adalah smart contract (eth_getCode != "0x").
 * Returns Set<addressLower> alamat yang merupakan contract.
 */
async function codeOfMulti(chainId, addresses, limiter) {
    const result = new Set();
    if (addresses.length === 0) return result;
    if (limiter) await limiter();

    const requests = addresses.map((a) => ({ method: "eth_getCode", params: [a, "latest"] }));
    const label    = `EVM/${chainName(chainId)}`;
    let data;
    try { data = await executeOnChain(chainId, requests, label); }
    catch { return result; } // tidak fatal — anggap saja semua EOA

    for (const r of data) {
        const addr = addresses[r.id]; if (!addr) continue;
        const code = String(r.result || "0x");
        if (code !== "0x" && code !== "0x0" && code.length > 2) {
            result.add(addr.toLowerCase());
        }
    }
    return result;
}

/**
 * Cek saldo banyak token ERC-20 untuk banyak holder.
 * @param {number} chainId
 * @param {string[]} holders   alamat pemilik
 * @param {Array<{symbol:string, address:string, decimals:number}>} tokens
 * @returns {Promise<Map<string, Array<{symbol, address, decimals, balance:bigint}>>>}
 *   key = holder.toLowerCase(), value = daftar token yang saldonya > 0.
 */
async function tokenBalancesMulti(chainId, holders, tokens, limiter) {
    const out = new Map();
    if (holders.length === 0 || tokens.length === 0) return out;
    if (limiter) await limiter();

    const { makeBalanceOfData } = require("./tokens");
    // Bangun pasangan (holderIdx, tokenIdx) berurutan.
    const pairs = [];
    for (let h = 0; h < holders.length; h++) {
        for (let t = 0; t < tokens.length; t++) pairs.push({ h, t });
    }
    const requests = pairs.map(({ h, t }) => ({
        method: "eth_call",
        params: [{ to: tokens[t].address, data: makeBalanceOfData(holders[h]) }, "latest"],
    }));
    const label = `EVM/${chainName(chainId)}`;
    let data;
    try { data = await executeOnChain(chainId, requests, label); }
    catch { return out; }

    for (const r of data) {
        const pair = pairs[r.id]; if (!pair) continue;
        let bal = 0n;
        try {
            const hex = String(r.result || "0x0");
            if (hex && hex !== "0x") bal = BigInt(hex);
        } catch {}
        if (bal === 0n) continue;
        const holder = holders[pair.h].toLowerCase();
        const tok    = tokens[pair.t];
        if (!out.has(holder)) out.set(holder, []);
        out.get(holder).push({ ...tok, balance: bal });
    }
    return out;
}

module.exports = {
    balanceMulti, codeOfMulti, tokenBalancesMulti,
    chainName, chainBatchSize, addRpcs, supportedChains,
    RPCS, NAMES, CHAIN_META,
};
