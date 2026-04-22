/**
 * Backend RPC publik gratis untuk chain EVM (tanpa API key).
 *
 * Fitur ketahanan:
 *  - Banyak endpoint per chain (drpc, llamarpc, publicnode, ankr, 1rpc, blast,
 *    onfinality, omniatech, dst).
 *  - Circuit breaker: endpoint yang baru saja gagal "didinginkan" sementara
 *    sehingga tidak dicoba lagi sampai cooldown habis. Mencegah RPC lambat
 *    (mis. Arbitrum sering rate-limit) menahan keseluruhan audit.
 *  - Sticky last-good: request berikut mulai dari endpoint yang terakhir sukses.
 *  - Mode "race": untuk chain yang notoriously lambat (Arbitrum), 2 endpoint
 *    pertama yang sehat ditembak paralel — pemenang dipakai, sisanya dibatalkan.
 *  - Timeout adaptif per chain — chain yang sering lambat dapat timeout lebih lama.
 *  - Auto-split: kalau RPC menolak batch besar (HTTP 413/-32600/payload limit),
 *    payload otomatis dipecah dan dicoba ulang.
 *  - Batch size per chain — chain yang sensitif rate-limit pakai batch kecil.
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
};

// Per-chain meta: nama, ukuran batch optimal, mode race (jumlah endpoint paralel),
// dan timeout per request. Defaults: 80 / 8000 ms / no race.
const CHAIN_META = {
    1:      { name: "Ethereum",   batch: 100, timeout: 8_000  },
    56:     { name: "BNB Chain",  batch: 100, timeout: 8_000  },
    137:    { name: "Polygon",    batch: 80,  timeout: 8_000  },
    42161:  { name: "Arbitrum",   batch: 40,  timeout: 10_000, race: 2 },
    10:     { name: "Optimism",   batch: 80,  timeout: 8_000  },
    8453:   { name: "Base",       batch: 80,  timeout: 8_000  },
    43114:  { name: "Avalanche",  batch: 80,  timeout: 8_000  },
    250:    { name: "Fantom",     batch: 80,  timeout: 8_000  },
    100:    { name: "Gnosis",     batch: 60,  timeout: 8_000  },
    59144:  { name: "Linea",      batch: 50,  timeout: 10_000 },
    534352: { name: "Scroll",     batch: 50,  timeout: 10_000 },
    324:    { name: "zkSync Era", batch: 50,  timeout: 10_000 },
};

const NAMES = Object.fromEntries(
    Object.entries(CHAIN_META).map(([id, m]) => [id, m.name])
);

const DEFAULT_TIMEOUT_MS = 8_000;
const COOLDOWN_MS        = 60_000;

// Sticky pointer ke endpoint terakhir yang sukses per chain.
const lastGood = new Map();
// Circuit breaker per URL: { url → cooldown_until_ms }.
const cooldown = new Map();

function chainName(chainId)      { return CHAIN_META[chainId]?.name    || `chain${chainId}`; }
function chainBatchSize(chainId, fallback = 80) {
    return CHAIN_META[chainId]?.batch || fallback;
}
function chainTimeout(chainId)   { return CHAIN_META[chainId]?.timeout || DEFAULT_TIMEOUT_MS; }
function isCoolingDown(url)      { const u = cooldown.get(url); return u && u > Date.now(); }
function markCooldown(url)       { cooldown.set(url, Date.now() + COOLDOWN_MS); }
function clearCooldown(url)      { cooldown.delete(url); }

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
async function callBatch(url, addresses, timeoutMs) {
    const payload = addresses.map((addr, i) => ({
        jsonrpc: "2.0",
        id: i,
        method: "eth_getBalance",
        params: [addr, "latest"],
    }));
    try {
        const data = await postJsonRpc(url, payload, timeoutMs);
        if (!Array.isArray(data)) throw new Error("respons RPC tidak valid");
        return data.map((r) => ({ id: r.id, result: r.result }));
    } catch (e) {
        if (isPayloadTooLarge(e) && addresses.length > 10) {
            const mid = Math.floor(addresses.length / 2);
            const left  = addresses.slice(0, mid);
            const right = addresses.slice(mid);
            const a = await callBatch(url, left,  timeoutMs);
            const b = await callBatch(url, right, timeoutMs);
            return [
                ...a,
                ...b.map((r) => ({ id: r.id + mid, result: r.result })),
            ];
        }
        throw e;
    }
}

/** Pilih N endpoint sehat (tidak sedang cooldown) mulai dari sticky-pointer. */
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
 * Cek saldo banyak alamat sekaligus via JSON-RPC batch.
 *
 * Strategi:
 *  1. Mode "race" (untuk chain yang lambat): tembak ke 2+ endpoint paralel,
 *     ambil pemenang pertama, sisanya dibatalkan.
 *  2. Sequential failover: coba endpoint sehat satu per satu.
 *  3. Force retry: kalau semua sedang cooldown, tetap coba (abaikan cooldown)
 *     supaya audit tidak macet total.
 */
async function balanceMulti(chainId, addresses, limiter) {
    const urls = RPCS[chainId];
    if (!urls) throw new Error(`Chain ${chainId} tidak didukung`);

    const out = new Map();
    if (addresses.length === 0) return out;
    if (limiter) await limiter();

    const meta    = CHAIN_META[chainId] || {};
    const timeout = chainTimeout(chainId);
    const label   = `EVM/${chainName(chainId)}`;
    let   data    = null;
    let   lastErr = null;

    // (1) Race mode untuk chain yang sering lambat / rate-limit.
    if (meta.race && meta.race > 1) {
        const picks = pickHealthyUrls(chainId, Math.min(meta.race, urls.length));
        if (picks.length >= 2) {
            try {
                const winner = await Promise.any(picks.map(async (p) => {
                    const r = await callBatch(p.url, addresses, timeout);
                    return { r, ...p };
                }));
                lastGood.set(chainId, winner.idx);
                clearCooldown(winner.url);
                rpcStats.recordOk(label, winner.url);
                data = winner.r;
            } catch (e) {
                // Promise.any → AggregateError. Tandai semua peserta gagal.
                for (const p of picks) {
                    markCooldown(p.url);
                    rpcStats.recordFail(label, p.url);
                }
                lastErr = e;
            }
        }
    }

    // (2) Sequential failover.
    if (!data) {
        const startIdx = lastGood.get(chainId) ?? 0;
        for (let off = 0; off < urls.length; off++) {
            const idx = (startIdx + off) % urls.length;
            const url = urls[idx];
            if (isCoolingDown(url)) continue;
            try {
                data = await withRetry(() => callBatch(url, addresses, timeout), 1, 300);
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

    // (3) Force retry — semua sedang cooldown, abaikan dan coba lagi sekali.
    if (!data) {
        const startIdx = lastGood.get(chainId) ?? 0;
        for (let off = 0; off < urls.length; off++) {
            const idx = (startIdx + off) % urls.length;
            const url = urls[idx];
            try {
                data = await callBatch(url, addresses, timeout);
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

module.exports = { balanceMulti, chainName, chainBatchSize, RPCS, NAMES, CHAIN_META };
