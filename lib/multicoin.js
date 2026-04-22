/**
 * Derivasi alamat & pengecekan saldo untuk koin non-EVM.
 *
 * Koin yang didukung:
 *   btc        — Bitcoin legacy P2PKH    (1...)
 *   btc-bech32 — Bitcoin SegWit P2WPKH   (bc1...)
 *   ltc        — Litecoin                (L...)
 *   doge       — Dogecoin                (D...)
 *   bch        — Bitcoin Cash            (bitcoincash:...)
 *   dash       — Dash                    (X...)
 *   zec        — Zcash transparent       (t1...)
 *   sol        — Solana                  (base58 ed25519)
 *   ada        — Cardano Shelley enterprise (addr1...)
 *
 * Semua API yang dipakai gratis dan tanpa kunci.
 * Setiap koin punya rate-limiter & batch sendiri agar paralel tanpa saling menghambat.
 * Setiap panggilan API dilindungi dengan retry otomatis (exponential backoff).
 * Parameter opsional onBatch(done, total, batchSize) dipanggil setelah tiap batch selesai.
 */

const crypto                = require("crypto");
const { SigningKey }        = require("ethers");
const { ed25519 }           = require("@noble/curves/ed25519.js");
const { blake2b }           = require("@noble/hashes/blake2.js");
const { createRateLimiter, chunkArray, withRetry, httpRequest } = require("./util");
const rpcStats              = require("./rpcStats");

// ───────────────────────── base58 / base58check ─────────────────────────
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

// ───────────────────────── bech32 (BIP-173) ─────────────────────────
const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

function bech32Polymod(values) {
    const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
    let chk = 1;
    for (const v of values) {
        const top = chk >>> 25;
        chk = ((chk & 0x1ffffff) << 5) ^ v;
        for (let i = 0; i < 5; i++) if ((top >> i) & 1) chk ^= GEN[i];
    }
    return chk;
}
function bech32HrpExpand(hrp) {
    const out = [];
    for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) >> 5);
    out.push(0);
    for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) & 31);
    return out;
}
function bech32CreateChecksum(hrp, data) {
    const values = [...bech32HrpExpand(hrp), ...data];
    const polymod = bech32Polymod([...values, 0, 0, 0, 0, 0, 0]) ^ 1;
    return [0, 1, 2, 3, 4, 5].map((i) => (polymod >> (5 * (5 - i))) & 31);
}
function convertBits(data, fromBits, toBits, pad) {
    let acc = 0, bits = 0;
    const out = [];
    const maxv = (1 << toBits) - 1;
    for (const v of data) {
        if (v < 0 || v >> fromBits !== 0) throw new Error("convertBits: nilai tidak valid");
        acc = (acc << fromBits) | v;
        bits += fromBits;
        while (bits >= toBits) {
            bits -= toBits;
            out.push((acc >> bits) & maxv);
        }
    }
    if (pad) {
        if (bits > 0) out.push((acc << (toBits - bits)) & maxv);
    } else if (bits >= fromBits || ((acc << (toBits - bits)) & maxv)) {
        throw new Error("convertBits: padding tidak valid");
    }
    return out;
}
/** Bech32 untuk SegWit BIP-173: HRP + witness version + program. */
function bech32EncodeWitness(hrp, witver, program) {
    const data = [witver, ...convertBits(Array.from(program), 8, 5, true)];
    const chk  = bech32CreateChecksum(hrp, data);
    let s = hrp + "1";
    for (const v of [...data, ...chk]) s += BECH32_CHARSET[v];
    return s;
}
/** Bech32 generik (tanpa witness version) — dipakai untuk Cardano. */
function bech32EncodeRaw(hrp, payload) {
    const data = convertBits(Array.from(payload), 8, 5, true);
    const chk  = bech32CreateChecksum(hrp, data);
    let s = hrp + "1";
    for (const v of [...data, ...chk]) s += BECH32_CHARSET[v];
    return s;
}

// ───────────────────────── cashaddr (BCH) ─────────────────────────
function cashaddrPolymod(v) {
    const GEN = [0x98f2bc8e61n, 0x79b76d99e2n, 0xf33e5fb3c4n, 0xae2eabe2a8n, 0x1e4f43e470n];
    let c = 1n;
    for (const d of v) {
        const c0 = c >> 35n;
        c = ((c & 0x07ffffffffn) << 5n) ^ BigInt(d);
        for (let i = 0; i < 5; i++) if ((c0 >> BigInt(i)) & 1n) c ^= GEN[i];
    }
    return c ^ 1n;
}
function cashaddrEncode(prefix, hash160) {
    // Version byte: 0 = P2PKH (160-bit hash).
    const versionByte = 0;
    const payload     = [versionByte, ...hash160];
    const data5       = convertBits(payload, 8, 5, true);
    const pf = [];
    for (const ch of prefix) pf.push(ch.charCodeAt(0) & 31);
    pf.push(0);
    const checksumInput = [...pf, ...data5, 0, 0, 0, 0, 0, 0, 0, 0];
    const polymod       = cashaddrPolymod(checksumInput);
    const checksum      = [];
    for (let i = 0; i < 8; i++) checksum.push(Number((polymod >> BigInt(5 * (7 - i))) & 0x1fn));
    let addr = prefix + ":";
    for (const v of [...data5, ...checksum]) addr += BECH32_CHARSET[v];
    return addr;
}

// ───────────────────────── pubkey helpers ─────────────────────────
function pubkeyCompressed(privHex) {
    return Buffer.from(new SigningKey(privHex).compressedPublicKey.slice(2), "hex");
}

// ───────────────────────── derivasi alamat ─────────────────────────
function btcLike(privHex, version) {
    const h160 = ripemd160(sha256(pubkeyCompressed(privHex)));
    return base58Check(Buffer.concat([Buffer.from([version]), h160]));
}
const deriveBTC  = (p) => btcLike(p, 0x00);
const deriveLTC  = (p) => btcLike(p, 0x30);
const deriveDOGE = (p) => btcLike(p, 0x1e);
const deriveDASH = (p) => btcLike(p, 0x4c);

function deriveBTCBech32(privHex) {
    const h160 = ripemd160(sha256(pubkeyCompressed(privHex)));
    return bech32EncodeWitness("bc", 0, h160);
}
function deriveBCH(privHex) {
    const h160 = ripemd160(sha256(pubkeyCompressed(privHex)));
    return cashaddrEncode("bitcoincash", Array.from(h160));
}
function deriveZEC(privHex) {
    const h160 = ripemd160(sha256(pubkeyCompressed(privHex)));
    return base58Check(Buffer.concat([Buffer.from([0x1c, 0xb8]), h160]));
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

function deriveADA(privHex) {
    // Pakai privkey 32-byte langsung sebagai ed25519 seed.
    const seed   = Buffer.from(privHex.slice(2), "hex");
    const pub    = ed25519.getPublicKey(seed);
    const hash28 = blake2b(pub, { dkLen: 28 });
    // Header byte: 0x61 = enterprise address mainnet (type 6, network 1).
    const payload = Buffer.concat([Buffer.from([0x61]), Buffer.from(hash28)]);
    return bech32EncodeRaw("addr", payload);
}

// ───────────────────────── pengambilan saldo ─────────────────────────
const UA = "BWAuditor/1.0";
const getJSON  = (url, timeoutMs = 15_000) =>
    httpRequest(url, { timeoutMs, userAgent: UA });
const postJSON = (url, body, timeoutMs = 15_000) =>
    httpRequest(url, { method: "POST", body, timeoutMs, userAgent: UA });

/** BTC (legacy + bech32) — blockchain.info, 50 alamat per batch (serial). */
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

/** Blockchair generic balance — dipakai LTC/DOGE/BCH/DASH/ZEC. */
async function balBlockchair(chainSlug, label, addresses, limiter, onBatch) {
    const out     = new Map();
    const batches = chunkArray(addresses, 100);
    let   done    = 0;
    for (const batch of batches) {
        if (limiter) await limiter();
        try {
            const data = await withRetry(() =>
                getJSON(`https://api.blockchair.com/${chainSlug}/dashboards/addresses/${batch.join(",")}`)
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

/** SOL — Solana RPC, 100 alamat per batch (serial). */
const SOL_RPCS = [
    "https://api.mainnet-beta.solana.com",
    "https://solana-rpc.publicnode.com",
    "https://rpc.ankr.com/solana",
    "https://solana.drpc.org",
    "https://1rpc.io/sol",
    "https://solana-mainnet.public.blastapi.io",
    "https://solana.api.onfinality.io/public",
    "https://endpoints.omniatech.io/v1/sol/mainnet/public",
];
const solCooldown = new Map();
const SOL_COOLDOWN_MS = 60_000;
let solLastGood = 0;

async function balSOL(addresses, limiter, onBatch) {
    const out     = new Map();
    const batches = chunkArray(addresses, 100);
    let   done    = 0;
    for (const batch of batches) {
        if (limiter) await limiter();
        const body = {
            jsonrpc: "2.0", id: 1, method: "getMultipleAccounts",
            params: [batch, { commitment: "confirmed" }],
        };
        let data = null;
        for (let off = 0; off < SOL_RPCS.length; off++) {
            const idx = (solLastGood + off) % SOL_RPCS.length;
            const url = SOL_RPCS[idx];
            const cd = solCooldown.get(url);
            if (cd && cd > Date.now()) continue;
            try {
                data = await withRetry(
                    () => httpRequest(url, { method: "POST", body, timeoutMs: 8000 }),
                    1, 300,
                );
                solLastGood = idx;
                solCooldown.delete(url);
                rpcStats.recordOk("SOL", url);
                break;
            } catch {
                solCooldown.set(url, Date.now() + SOL_COOLDOWN_MS);
                rpcStats.recordFail("SOL", url);
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

/** ADA — Koios free API, 50 alamat per batch (serial). */
async function balADA(addresses, limiter, onBatch) {
    const out     = new Map();
    const batches = chunkArray(addresses, 50);
    let   done    = 0;
    for (const batch of batches) {
        if (limiter) await limiter();
        try {
            const data = await withRetry(() => postJSON(
                "https://api.koios.rest/api/v1/address_info",
                { _addresses: batch }
            ), 2, 500);
            const byAddr = new Map();
            if (Array.isArray(data)) {
                for (const a of data) {
                    if (a?.address) byAddr.set(a.address, BigInt(a.balance ?? 0));
                }
            }
            for (const a of batch) out.set(a, byAddr.get(a) ?? 0n);
            rpcStats.recordOk("ADA", "https://api.koios.rest");
        } catch {
            for (const a of batch) out.set(a, 0n);
            rpcStats.recordFail("ADA", "https://api.koios.rest");
        }
        done++;
        if (onBatch) onBatch(done, batches.length, batch.length);
    }
    return out;
}

// ───────────────────────── registry ─────────────────────────
const COINS = {
    btc:          { name: "Bitcoin",          derive: deriveBTC,        balance: balBTC,                                                          rate: 8 },
    "btc-bech32": { name: "Bitcoin (bech32)", derive: deriveBTCBech32,  balance: balBTC,                                                          rate: 8 },
    ltc:          { name: "Litecoin",         derive: deriveLTC,        balance: (a, l, cb) => balBlockchair("litecoin",     "LTC",  a, l, cb),  rate: 1 },
    doge:         { name: "Dogecoin",         derive: deriveDOGE,       balance: (a, l, cb) => balBlockchair("dogecoin",     "DOGE", a, l, cb),  rate: 1 },
    bch:          { name: "Bitcoin Cash",     derive: deriveBCH,        balance: (a, l, cb) => balBlockchair("bitcoin-cash", "BCH",  a, l, cb),  rate: 1 },
    dash:         { name: "Dash",             derive: deriveDASH,       balance: (a, l, cb) => balBlockchair("dash",         "DASH", a, l, cb),  rate: 1 },
    zec:          { name: "Zcash",            derive: deriveZEC,        balance: (a, l, cb) => balBlockchair("zcash",        "ZEC",  a, l, cb),  rate: 1 },
    sol:          { name: "Solana",           derive: deriveSOL,        balance: balSOL,                                                          rate: 8 },
    ada:          { name: "Cardano",          derive: deriveADA,        balance: balADA,                                                          rate: 4 },
};

const limiters = {};
function getLimiter(coin) {
    if (!limiters[coin]) limiters[coin] = createRateLimiter(COINS[coin].rate);
    return limiters[coin];
}

module.exports = {
    COINS, getLimiter,
    // diekspos untuk unit-test
    _internals: {
        bech32EncodeWitness, bech32EncodeRaw, cashaddrEncode, base58Check, base58Encode,
        deriveBTC, deriveBTCBech32, deriveBCH, deriveDASH, deriveZEC, deriveADA,
    },
};
