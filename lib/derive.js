/**
 * Derivasi private key dari frasa dengan banyak strategi hashing.
 *
 * Strategi default (10 — cepat, dipakai setiap audit):
 *   sha256, doubleSha256, keccak256, sha256NoSpace, sha256Lower, md5,
 *   pbkdf2, scrypt, hmacBitcoinSeed, bip39Seed.
 *
 * Strategi opsional (5 — MAHAL, aktifkan manual via --strategies / config):
 *   argon2      — Argon2id m=4MB, t=1 (~50–150 ms / derive)
 *   argon2d     — Argon2d  m=4MB, t=1 (varian data-dependent)
 *   bip44eth    — BIP39 → BIP32 derive m/44'/60'/0'/0/0 (path Ethereum/MetaMask)
 *   electrum    — PBKDF2-SHA512 salt="electrum" iter 2048 (Electrum 2.x seed)
 *   warpwallet  — scrypt(N=2^18) XOR PBKDF2(2^16) — SANGAT MAHAL (~detik/derive)
 *
 * Strategi default sengaja dibuat ringan supaya audit cepat, tapi tetap
 * menangkap brainwallet "weak-params" yang umum dipakai 2013–2015. Opsional
 * berat hanya dipakai bila target dicurigai memakai KDF berat.
 */

const crypto = require("crypto");
const { keccak256, toUtf8Bytes, computeAddress, getBytes, HDNodeWallet } = require("ethers");

const { pbkdf2 }              = require("@noble/hashes/pbkdf2.js");
const { scrypt }              = require("@noble/hashes/scrypt.js");
const { argon2id, argon2d }   = require("@noble/hashes/argon2.js");
const { hmac }                = require("@noble/hashes/hmac.js");
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

    // ───────── Opsional: KDF mahal & path BIP44 (aktifkan manual) ─────────

    /**
     * Argon2id — brainwallet modern. Parameter ringan (m=4MB, t=1) supaya
     * tidak menghabiskan waktu audit. Aktifkan hanya kalau target dicurigai
     * pakai Argon2.
     */
    argon2: (phrase) => {
        const data = Buffer.from(phrase, "utf8");
        const out  = argon2id(data, Buffer.from("brainwallet", "utf8"),
            { t: 1, m: 4096, p: 1, dkLen: 32 });
        return u8ToBuf(out);
    },

    /**
     * Argon2d — varian data-dependent (rentan side-channel, jarang dipakai
     * untuk password tapi pernah muncul di tools brainwallet eksperimental).
     * Parameter sama dengan argon2id agar biaya setara.
     */
    argon2d: (phrase) => {
        const data = Buffer.from(phrase, "utf8");
        const out  = argon2d(data, Buffer.from("brainwallet", "utf8"),
            { t: 1, m: 4096, p: 1, dkLen: 32 });
        return u8ToBuf(out);
    },

    /**
     * BIP44 Ethereum — perlakukan frasa sebagai mnemonic-like:
     *   1. PBKDF2-SHA512(phrase, "mnemonic", 2048) → seed 64 byte (BIP39)
     *   2. BIP32 master dari seed → derive m/44'/60'/0'/0/0 (path MetaMask)
     * Banyak orang mengetik kalimat sebagai "mnemonic palsu" lalu impor ke
     * MetaMask — strategi ini menangkap pola itu.
     */
    bip44eth: (phrase) => {
        const data = Buffer.from(phrase, "utf8");
        const seed = pbkdf2(nSha512, data, Buffer.from("mnemonic", "utf8"),
            { c: 2048, dkLen: 64 });
        const seedHex = "0x" + Buffer.from(seed).toString("hex");
        const node = HDNodeWallet.fromSeed(seedHex).derivePath("m/44'/60'/0'/0/0");
        return Buffer.from(getBytes(node.privateKey));
    },

    /**
     * Electrum 2.x seed — PBKDF2-SHA512(phrase, "electrum", 2048) → 64 byte,
     * ambil 32 byte pertama. Spec Electrum sebenarnya pakai salt="electrum"
     * (tanpa passphrase) untuk new-seed-encoding.
     */
    electrum: (phrase) => {
        const data = Buffer.from(phrase, "utf8");
        const out  = pbkdf2(nSha512, data, Buffer.from("electrum", "utf8"),
            { c: 2048, dkLen: 64 });
        return u8ToBuf(out).slice(0, 32);
    },

    /**
     * WarpWallet (Keybase, 2013) — KDF "deterministic wallet" yang sengaja
     * mahal supaya brute-force lambat:
     *   s1 = scrypt(passphrase || 0x01, salt || 0x01, N=2^18, r=8, p=1, 32B)
     *   s2 = pbkdf2-sha256(passphrase || 0x02, salt || 0x02, c=2^16, 32B)
     *   privkey = s1 XOR s2
     * Salt asli = email user; di sini kita pakai "" (mode tanpa salt) yang
     * juga didukung varian publik. SANGAT MAHAL (~1–3 detik per derive),
     * jangan pakai di audit besar tanpa --limit.
     */
    warpwallet: (phrase) => {
        const pw   = Buffer.from(phrase, "utf8");
        const salt = Buffer.alloc(0);
        const s1 = scrypt(
            Buffer.concat([pw,   Buffer.from([0x01])]),
            Buffer.concat([salt, Buffer.from([0x01])]),
            { N: 1 << 18, r: 8, p: 1, dkLen: 32 },
        );
        const s2 = pbkdf2(nSha256,
            Buffer.concat([pw,   Buffer.from([0x02])]),
            Buffer.concat([salt, Buffer.from([0x02])]),
            { c: 1 << 16, dkLen: 32 },
        );
        const out = Buffer.alloc(32);
        for (let i = 0; i < 32; i++) out[i] = s1[i] ^ s2[i];
        return out;
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
