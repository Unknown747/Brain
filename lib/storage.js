/** Penyimpanan terenkripsi AES-256-GCM (framed/append) + cache alamat in-memory. */

const fs     = require("fs");
const path   = require("path");
const crypto = require("crypto");
const logger = require("./logger");

const KEY_FILE = path.join(process.cwd(), "aes.key");

function parseAesKey() {
    let hex = "";
    if (fs.existsSync(KEY_FILE)) {
        hex = fs.readFileSync(KEY_FILE, "utf8").trim();
    }
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
        hex = crypto.randomBytes(32).toString("hex");
        fs.writeFileSync(KEY_FILE, hex + "\n", { mode: 0o600 });
        logger.info(`Kunci AES baru dibuat → ${KEY_FILE}`);
        logger.warn(`SIMPAN file aes.key baik-baik. Tanpa kunci, hallazgos.enc tidak bisa didekripsi.`);
    }
    return Buffer.from(hex, "hex");
}

function appendEncryptedFrame(records, outFile, key) {
    const plain  = Buffer.from(JSON.stringify(records), "utf8");
    const nonce  = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, nonce);
    const ct     = Buffer.concat([cipher.update(plain), cipher.final()]);
    const tag    = cipher.getAuthTag();
    const len    = Buffer.alloc(4);
    len.writeUInt32BE(ct.length + tag.length, 0);
    fs.appendFileSync(outFile, Buffer.concat([len, nonce, ct, tag]));
}

function readEncryptedFrames(file, key) {
    const data    = fs.readFileSync(file);
    const records = [];
    let   off     = 0;
    while (off + 4 <= data.length) {
        const bodyLen  = data.readUInt32BE(off); off += 4;
        const nonce    = data.slice(off, off + 12); off += 12;
        const body     = data.slice(off, off + bodyLen); off += bodyLen;
        const ct       = body.slice(0, body.length - 16);
        const tag      = body.slice(body.length - 16);
        const decipher = crypto.createDecipheriv("aes-256-gcm", key, nonce);
        decipher.setAuthTag(tag);
        const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
        for (const r of JSON.parse(plain.toString("utf8"))) records.push(r);
    }
    return records;
}

function appendFoundTxt(records, file) {
    const lines = records.map((r) =>
        `${r.address}\t${r.coin}\t${r.chain_name}\t${r.balance}\t${r.private_key_hex}\t${r.pattern}\t${r.strategy}`
    );
    fs.appendFileSync(file, lines.join("\n") + "\n");
}

/** Cache alamat hanya di memori — tidak ada file yang dibaca/ditulis. */
class AddressCache {
    constructor() { this.set = new Set(); }
    has(key)  { return this.set.has(String(key).toLowerCase()); }
    add(key)  { this.set.add(String(key).toLowerCase()); }
    get size() { return this.set.size; }
}

module.exports = { parseAesKey, appendEncryptedFrame, readEncryptedFrames, appendFoundTxt, AddressCache };
