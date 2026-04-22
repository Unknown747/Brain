/**
 * Derivasi private key dari frasa dengan banyak strategi hashing.
 *
 * Strategi default (10): sha256, doubleSha256, keccak256, sha256NoSpace,
 *   sha256Lower, md5, pbkdf2, scrypt, hmacBitcoinSeed, bip39Seed.
 *
 * Strategi opsional: argon2 (mahal — aktifkan via config.json kalau perlu).
 *
 * Parameter KDF sengaja dibuat ringan supaya audit cepat, tapi tetap
 * menangkap brainwallet "weak-params" yang umum dipakai 2013–2015.
 */

const crypto = require("crypto");
const { keccak256, toUtf8Bytes, computeAddress, getBytes } = require("ethers");

const { pbkdf2 }   = require("@noble/hashes/pbkdf2.js");
const { scrypt }   = require("@noble/hashes/scrypt.js");
const { argon2id } = require("@noble/hashes/argon2.js");
const { hmac }     = require("@noble/hashes/hmac.js");
const { sha256: nSha256, sha512: nSha512 } = require("@noble/hashes/sha2.js");

function sha256Buf(buf) {
    return crypto.createHash("sha256").update(buf).digest();
}
function u8ToBuf(u8) {
    return Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength);
}

const STRATEGIES = {
    // ───────── Strategi klasik (warisan brainwallet 2011–2015) ─────────

    /** SHA-256 standar — paling umum dipakai brainwallet. */
    sha256: (phrase) =>
        sha256Buf(Buffer.from(phrase, "utf8")),

    /** Double SHA-256 — beberapa alat brainwallet awal. */
    doubleSha256: (phrase) =>
        sha256Buf(sha256Buf(Buffer.from(phrase, "utf8"))),

    /** Keccak-256 — hash native Ethereum. */
    keccak256: (phrase) =>
        Buffer.from(getBytes(keccak256(toUtf8Bytes(phrase)))),

    /** SHA-256 tanpa spasi. */
    sha256NoSpace: (phrase) =>
        sha256Buf(Buffer.from(phrase.replace(/\s+/g, ""), "utf8")),

    /** SHA-256 setelah di-lowercase. */
    sha256Lower: (phrase) =>
        sha256Buf(Buffer.from(phrase.toLowerCase(), "utf8")),

    /** MD5 → SHA-256 — pola era 2011–2013 yang masih pakai MD5. */
    md5: (phrase) => {
        const md5 = crypto.createHash("md5").update(Buffer.from(phrase, "utf8")).digest();
        return sha256Buf(md5);
    },

    // ───────── KDF modern (brainwallet "weak-params") ─────────

    /**
     * PBKDF2-SHA256 — pola WarpWallet/derivat lain.
     * Parameter ringan: salt = "brainwallet", iter 2048. Bukan WarpWallet penuh
     * (yang gabungkan PBKDF2 + scrypt dengan XOR), tapi menangkap pola umum.
     */
    pbkdf2: (phrase) => {
        const data = Buffer.from(phrase, "utf8");
        const out  = pbkdf2(nSha256, data, Buffer.from("brainwallet", "utf8"),
            { c: 2048, dkLen: 32 });
        return u8ToBuf(out);
    },

    /**
     * scrypt — pola Brainwallet.io 2013–2015.
     * Parameter ringan (N=2^14, r=8, p=1) — masih cukup berat tapi feasible
     * untuk audit. ~30–80 ms per derive.
     */
    scrypt: (phrase) => {
        const data = Buffer.from(phrase, "utf8");
        const out  = scrypt(data, Buffer.from("brainwallet", "utf8"),
            { N: 16384, r: 8, p: 1, dkLen: 32 });
        return u8ToBuf(out);
    },

    /**
     * HMAC-SHA512 dengan key="Bitcoin seed" — derivasi master BIP32.
     * Frasa diperlakukan sebagai seed mentah; hasil 64 byte → ambil 32 byte
     * pertama (kunci privat master).
     */
    hmacBitcoinSeed: (phrase) => {
        const out = hmac(nSha512, Buffer.from("Bitcoin seed", "utf8"),
            Buffer.from(phrase, "utf8"));
        return u8ToBuf(out).slice(0, 32);
    },

    /**
     * BIP39 seed — PBKDF2-SHA512 dengan salt="mnemonic" (iter 2048).
     * Banyak orang mengetik kalimat lalu hash → sering kebetulan jadi seed
     * BIP39 valid. Ambil 32 byte pertama sebagai kunci.
     */
    bip39Seed: (phrase) => {
        const data = Buffer.from(phrase, "utf8");
        const out  = pbkdf2(nSha512, data, Buffer.from("mnemonic", "utf8"),
            { c: 2048, dkLen: 64 });
        return u8ToBuf(out).slice(0, 32);
    },

    // ───────── Opsional: Argon2id (mahal, aktifkan manual) ─────────

    /**
     * Argon2id — brainwallet modern. Parameter sangat ringan (m=4MB, t=1)
     * supaya tidak menghabiskan waktu audit. Aktifkan hanya kalau target
     * memang dicurigai pakai Argon2.
     */
    argon2: (phrase) => {
        const data = Buffer.from(phrase, "utf8");
        const out  = argon2id(data, Buffer.from("brainwallet", "utf8"),
            { t: 1, m: 4096, p: 1, dkLen: 32 });
        return u8ToBuf(out);
    },
};

function deriveAll(phrase, strategies) {
    const out = [];
    for (const name of strategies) {
        const fn = STRATEGIES[name];
        if (!fn) continue;
        try {
            const priv    = fn(phrase);
            const privHex = "0x" + Buffer.from(priv).toString("hex");
            const address = computeAddress(privHex);
            out.push({ phrase, strategy: name, privHex, address });
        } catch {
            // Abaikan kunci yang tidak valid (mis. semua-nol).
        }
    }
    return out;
}

module.exports = { deriveAll, STRATEGIES };
