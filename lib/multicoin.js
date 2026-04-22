/**
 * Derivasi alamat & pengecekan saldo untuk koin non-EVM:
 *   btc, ltc, doge (secp256k1 + base58check)
 *   sol  (ed25519 + base58)
 *
 * Semua API yang dipakai gratis dan tanpa kunci.
 * Setiap koin punya rate-limiter & batch sendiri agar paralel tanpa saling menghambat.
 * Setiap panggilan API dilindungi dengan retry otomatis (exponential backoff).
 * Parameter opsional onBatch(done, total, batchSize) dipanggil setelah tiap batch selesai.
 */

const crypto = require("crypto");
const { SigningKey } = require("ethers");
const { createRateLimiter, chunkArray, withRetry } = require("./util");
const rpcStats = require("./rpcStats");

// ---------- base58 ----------
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Encode(buf) {
    let n = 0n;
    for (const b of buf) n = (n << 8n) | BigInt(b);
    let s = "";
    while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
    for (const b of buf) { if (b === 0) s = "1" + s; else break; }
    return s;
}
function sha256(b) { return crypto.createHash("sha256").update(b).digest(); }
function ripemd160(b) { return crypto.createHash("ripemd160").update(b).digest(); }
function base58Check(payload) {
    return base58Encode(Buffer.concat([payload, sha256(sha256(payload)).slice(0, 4)]));
}

// ---------- pubkey helpers ----------
function pubkeyCompressed(privHex) {
    return Buffer.from(new SigningKey(privHex).compressedPublicKey.slice(2), "hex");
}

// ---------- derivasi alamat ----------
function btcLike(privHex, version) {
    const h160 = ripemd160(sha256(pubkeyCompressed(privHex)));
    return base58Check(Buffer.concat([Buffer.from([version]), h160]));
}
const deriveBTC  = (p) => btcLike(p, 0x00);
const deriveLTC  = (p) => btcLike(p, 0x30);
const deriveDOGE = (p) => btcLike(p, 0x1e);

function deriveSOL(privHex) {
    const seed = Buffer.from(privHex.slice(2), "hex");
    const der  = Buffer.concat([
        Buffer.from("302e020100300506032b657004220420", "hex"),
        seed,
    ]);
    const priv   = crypto.createPrivateKey({ key: der, format: "der", type: "pkcs8" });
    const pubDer = crypto.createPublicKey(priv).export({ format: "der", type: "spki" });
    return base58Encode(pubDer.slice(-32));
}

// ---------- pengambilan saldo ----------
async function getJSON(url, timeoutMs = 15000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            headers: { "User-Agent": "BWAuditor/1.0", "accept": "application/json" },
            signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } finally {
        clearTimeout(t);
    }
}

/**
 * BTC — blockchain.info, 50 alamat per batch (serial).
 * @param {string[]} addresses
 * @param {Function} limiter
 * @param {Function} [onBatch] (done, total, batchSize) dipanggil setelah tiap batch
 */
async function balBTC(addresses, limiter, onBatch) {
    const out     = new Map();
    const batches = chunkArray(addresses, 50);
    let   done    = 0;
    for (const batch of batches) {
        if (limiter) await limiter();
        let resolved = false;
        try {
            const data = await withRetry(() =>
                getJSON(`https://blockchain.info/balance?active=${batch.join("|")}&cors=true`), 2, 400
            );
            for (const a of batch) out.set(a, BigInt(data[a]?.final_balance ?? 0));
            rpcStats.recordOk("BTC", "https://blockchain.info");
            resolved = true;
        } catch {
            rpcStats.recordFail("BTC", "https://blockchain.info");
        }
        if (!resolved) {
            // Fallback: mempool.space (per-address) — lebih lambat tapi dapat data.
            try {
                await Promise.all(batch.map(async (a) => {
                    try {
                        const d = await withRetry(() =>
                            getJSON(`https://mempool.space/api/address/${a}`), 2, 400
                        );
                        const funded = BigInt(d?.chain_stats?.funded_txo_sum ?? 0);
                        const spent  = BigInt(d?.chain_stats?.spent_txo_sum  ?? 0);
                        out.set(a, funded - spent);
                    } catch { out.set(a, 0n); }
                }));
                rpcStats.recordOk("BTC", "https://mempool.space");
                resolved = true;
            } catch {
                rpcStats.recordFail("BTC", "https://mempool.space");
            }
        }
        if (!resolved) for (const a of batch) out.set(a, 0n);
        done++;
        if (onBatch) onBatch(done, batches.length, batch.length);
    }
    return out;
}

/**
 * LTC / DOGE — Blockchair, 100 alamat per batch (serial).
 * @param {string} chain
 * @param {string[]} addresses
 * @param {Function} limiter
 * @param {Function} [onBatch]
 */
async function balBlockchair(chain, addresses, limiter, onBatch) {
    const out     = new Map();
    const batches = chunkArray(addresses, 100);
    const label   = chain.toUpperCase();
    let   done    = 0;
    for (const batch of batches) {
        if (limiter) await limiter();
        try {
            const data = await withRetry(() =>
                getJSON(`https://api.blockchair.com/${chain}/dashboards/addresses/${batch.join(",")}`)
            );
            const addrs = data?.data?.addresses || {};
            for (const a of batch) out.set(a, BigInt(addrs[a]?.balance ?? 0));
            rpcStats.recordOk(label, "https://api.blockchair.com");
        } catch {
            for (const a of batch) out.set(a, 0n);
            rpcStats.recordFail(label, "https://api.blockchair.com");
        }
        done++;
        if (onBatch) onBatch(done, batches.length, batch.length);
    }
    return out;
}

/**
 * SOL — Solana RPC, 100 alamat per batch (serial).
 * Multi-endpoint dengan fallback otomatis jika satu RPC gagal.
 */
const SOL_RPCS = [
    "https://api.mainnet-beta.solana.com",
    "https://solana-rpc.publicnode.com",
    "https://rpc.ankr.com/solana",
];
let solLastGood = 0;

async function balSOL(addresses, limiter, onBatch) {
    const out     = new Map();
    const batches = chunkArray(addresses, 100);
    let   done    = 0;
    for (const batch of batches) {
        if (limiter) await limiter();
        const body = {
            jsonrpc: "2.0",
            id: 1,
            method: "getMultipleAccounts",
            params: [batch, { commitment: "confirmed" }],
        };
        let data = null;
        for (let off = 0; off < SOL_RPCS.length; off++) {
            const idx = (solLastGood + off) % SOL_RPCS.length;
            try {
                data = await withRetry(async () => {
                    const res = await fetch(SOL_RPCS[idx], {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify(body),
                    });
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    return res.json();
                }, 2, 400);
                solLastGood = idx;
                rpcStats.recordOk("SOL", SOL_RPCS[idx]);
                break;
            } catch {
                rpcStats.recordFail("SOL", SOL_RPCS[idx]);
            }
        }
        if (data?.result?.value) {
            const arr = data.result.value;
            batch.forEach((a, i) => out.set(a, BigInt(arr[i]?.lamports ?? 0)));
        } else {
            for (const a of batch) out.set(a, 0n);
        }
        done++;
        if (onBatch) onBatch(done, batches.length, batch.length);
    }
    return out;
}

// ---------- registry ----------
const COINS = {
    btc:  { name: "Bitcoin",  derive: deriveBTC,  balance: balBTC,                                                rate: 8  },
    ltc:  { name: "Litecoin", derive: deriveLTC,  balance: (a, l, cb) => balBlockchair("litecoin", a, l, cb),     rate: 1  },
    doge: { name: "Dogecoin", derive: deriveDOGE, balance: (a, l, cb) => balBlockchair("dogecoin", a, l, cb),     rate: 1  },
    sol:  { name: "Solana",   derive: deriveSOL,  balance: balSOL,                                                rate: 8  },
};

const limiters = {};
function getLimiter(coin) {
    if (!limiters[coin]) limiters[coin] = createRateLimiter(COINS[coin].rate);
    return limiters[coin];
}

module.exports = { COINS, getLimiter };
