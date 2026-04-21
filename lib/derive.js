const crypto = require("crypto");
const { keccak256, toUtf8Bytes, computeAddress, getBytes, hexlify } = require("ethers");

function sha256Hex(buf) {
    return crypto.createHash("sha256").update(buf).digest();
}

const STRATEGIES = {
    sha256: (phrase) => sha256Hex(Buffer.from(phrase, "utf8")),
    doubleSha256: (phrase) => sha256Hex(sha256Hex(Buffer.from(phrase, "utf8"))),
    keccak256: (phrase) => Buffer.from(getBytes(keccak256(toUtf8Bytes(phrase)))),
    sha256NoSpace: (phrase) => sha256Hex(Buffer.from(phrase.replace(/\s+/g, ""), "utf8")),
    sha256Lower: (phrase) => sha256Hex(Buffer.from(phrase.toLowerCase(), "utf8")),
};

function deriveAll(phrase, strategies) {
    const out = [];
    for (const name of strategies) {
        const fn = STRATEGIES[name];
        if (!fn) continue;
        try {
            const priv = fn(phrase);
            const privHex = "0x" + Buffer.from(priv).toString("hex");
            const address = computeAddress(privHex);
            out.push({ phrase, strategy: name, privHex, address });
        } catch {
            // ignore invalid keys
        }
    }
    return out;
}

module.exports = { deriveAll, STRATEGIES };
