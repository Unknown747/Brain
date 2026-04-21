const crypto = require("crypto");
const { keccak256, toUtf8Bytes, computeAddress, getBytes } = require("ethers");

function sha256Hex(buf) {
    return crypto.createHash("sha256").update(buf).digest();
}

const STRATEGIES = {
    // SHA-256 standar — paling umum dipakai brainwallet
    sha256: (phrase) =>
        sha256Hex(Buffer.from(phrase, "utf8")),

    // Double SHA-256 — digunakan beberapa alat brainwallet era awal
    doubleSha256: (phrase) =>
        sha256Hex(sha256Hex(Buffer.from(phrase, "utf8"))),

    // Keccak-256 — hash native Ethereum
    keccak256: (phrase) =>
        Buffer.from(getBytes(keccak256(toUtf8Bytes(phrase)))),

    // SHA-256 tanpa spasi — variasi yang cukup umum
    sha256NoSpace: (phrase) =>
        sha256Hex(Buffer.from(phrase.replace(/\s+/g, ""), "utf8")),

    // SHA-256 lowercase — variasi lain yang sering dijumpai
    sha256Lower: (phrase) =>
        sha256Hex(Buffer.from(phrase.toLowerCase(), "utf8")),

    // MD5 → SHA-256 — pola brainwallet era 2011–2013 yang menggunakan MD5
    // MD5 menghasilkan 16 byte; di-hash ulang dengan SHA-256 untuk mendapat 32 byte yang valid.
    md5: (phrase) => {
        const md5 = crypto.createHash("md5").update(Buffer.from(phrase, "utf8")).digest();
        return sha256Hex(md5);
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
            // Abaikan kunci yang tidak valid
        }
    }
    return out;
}

module.exports = { deriveAll, STRATEGIES };
