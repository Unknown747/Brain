/**
 * Derivasi alamat & pengecekan saldo untuk koin non-EVM:
 *   btc, ltc, doge (secp256k1 + base58check)
 *   trx  (secp256k1 + keccak256 + base58check)
 *   sol  (ed25519 + base58)
 *
 * Semua API yang dipakai gratis dan tanpa kunci.
 * Setiap koin punya rate-limiter & batch sendiri agar paralel tanpa saling menghambat.
 * Setiap panggilan API dilindungi dengan retry otomatis (exponential backoff).
 * Parameter opsional onBatch(done, total, batchSize) dipanggil setelah tiap batch selesai.
 */

const crypto = require("crypto");
const { SigningKey, keccak256, getBytes } = require("ethers");
const { createRateLimiter, chunkArray, withRetry } = require("./util");

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
function pubkeyUncompressedXY(privHex) {
    return Buffer.from(new SigningKey(privHex).publicKey.slice(4), "hex");
}

// ---------- derivasi alamat ----------
function btcLike(privHex, version) {
    const h160 = ripemd160(sha256(pubkeyCompressed(privHex)));
    return base58Check(Buffer.concat([Buffer.from([version]), h160]));
}
const deriveBTC  = (p) => btcLike(p, 0x00);
const deriveLTC  = (p) => btcLike(p, 0x30);
const deriveDOGE = (p) => btcLike(p, 0x1e);

function deriveTRX(privHex) {
    const pub = pubkeyUncompressedXY(privHex);
    const h   = Buffer.from(getBytes(keccak256(pub)));
    return base58Check(Buffer.concat([Buffer.from([0x41]), h.slice(-20)]));
}

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
async function getJSON(url) {
    const res = await fetch(url, {
        headers: { "User-Agent": "BWAuditor/1.0", "accept": "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
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
        try {
            const data = await withRetry(() =>
                getJSON(`https://blockchain.info/balance?active=${batch.join("|")}&cors=true`)
            );
            for (const a of batch) out.set(a, BigInt(data[a]?.final_balance ?? 0));
        } catch {
            for (const a of batch) out.set(a, 0n);
        }
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
    let   done    = 0;
    for (const batch of batches) {
        if (limiter) await limiter();
        try {
            const data = await withRetry(() =>
                getJSON(`https://api.blockchair.com/${chain}/dashboards/addresses/${batch.join(",")}`)
            );
            const addrs = data?.data?.addresses || {};
            for (const a of batch) out.set(a, BigInt(addrs[a]?.balance ?? 0));
        } catch {
            for (const a of batch) out.set(a, 0n);
        }
        done++;
        if (onBatch) onBatch(done, batches.length, batch.length);
    }
    return out;
}

/**
 * TRX — TronGrid, satu request per alamat (paralel).
 * onBatch dipanggil setelah tiap alamat (done, total, 1).
 * @param {string[]} addresses
 * @param {Function} limiter
 * @param {Function} [onBatch]
 */
async function balTRX(addresses, limiter, onBatch) {
    const out  = new Map();
    let   done = 0;
    await Promise.all(addresses.map(async (a) => {
        if (limiter) await limiter();
        try {
            const d = await withRetry(() =>
                getJSON(`https://api.trongrid.io/v1/accounts/${a}`)
            );
            out.set(a, BigInt(d?.data?.[0]?.balance ?? 0));
        } catch { out.set(a, 0n); }
        done++;
        if (onBatch) onBatch(done, addresses.length, 1);
    }));
    return out;
}

/**
 * SOL — Solana RPC, 100 alamat per batch (serial).
 * @param {string[]} addresses
 * @param {Function} limiter
 * @param {Function} [onBatch]
 */
async function balSOL(addresses, limiter, onBatch) {
    const out     = new Map();
    const batches = chunkArray(addresses, 100);
    let   done    = 0;
    for (const batch of batches) {
        if (limiter) await limiter();
        try {
            const body = {
                jsonrpc: "2.0",
                id: 1,
                method: "getMultipleAccounts",
                params: [batch, { commitment: "confirmed" }],
            };
            const data = await withRetry(async () => {
                const res = await fetch("https://api.mainnet-beta.solana.com", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify(body),
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
            });
            const arr = data?.result?.value || [];
            batch.forEach((a, i) => out.set(a, BigInt(arr[i]?.lamports ?? 0)));
        } catch {
            for (const a of batch) out.set(a, 0n);
        }
        done++;
        if (onBatch) onBatch(done, batches.length, batch.length);
    }
    return out;
}

// ---------- registry ----------
const COINS = {
    btc:  { name: "Bitcoin",  derive: deriveBTC,  balance: (a, l, cb) => balBTC(a, l, cb),                                    rate: 8 },
    ltc:  { name: "Litecoin", derive: deriveLTC,  balance: (a, l, cb) => balBlockchair("litecoin", a, l, cb),                 rate: 1 },
    doge: { name: "Dogecoin", derive: deriveDOGE, balance: (a, l, cb) => balBlockchair("dogecoin", a, l, cb),                 rate: 1 },
    trx:  { name: "Tron",     derive: deriveTRX,  balance: (a, l, cb) => balTRX(a, l, cb),                                   rate: 5 },
    sol:  { name: "Solana",   derive: deriveSOL,  balance: (a, l, cb) => balSOL(a, l, cb),                                   rate: 8 },
};

const limiters = {};
function getLimiter(coin) {
    if (!limiters[coin]) limiters[coin] = createRateLimiter(COINS[coin].rate);
    return limiters[coin];
}

module.exports = { COINS, getLimiter };
