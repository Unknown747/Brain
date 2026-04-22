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
    const lines = records.map((r) => {
        const tokenInfo = r.token_symbol ? `\t${r.token_symbol}` : "";
        const flag      = r.is_contract ? "\t[CONTRACT]" : "";
        return `${r.address}\t${r.coin}\t${r.chain_name}\t${r.balance}${tokenInfo}\t${r.private_key_hex}\t${r.pattern}\t${r.strategy}${flag}`;
    });
    fs.appendFileSync(file, lines.join("\n") + "\n");
}

/**
 * Cache alamat di memori — bisa di-serialize untuk masuk checkpoint.
 * Dengan begitu, kalau audit di-resume, alamat yang sudah pernah dicek
 * tidak akan diulang. Kapasitas dibatasi (FIFO) supaya checkpoint tidak meledak.
 */
class AddressCache {
    constructor(initial = []) {
        this.set = new Set();
        for (const k of initial) this.set.add(String(k).toLowerCase());
    }
    has(key)  { return this.set.has(String(key).toLowerCase()); }
    add(key)  { this.set.add(String(key).toLowerCase()); }
    get size() { return this.set.size; }

    /** Snapshot (capped at maxEntries) untuk disimpan ke checkpoint. */
    serialize(maxEntries = 200_000) {
        if (this.set.size <= maxEntries) return [...this.set];
        // Set di-iterate sesuai urutan penyisipan → buang yang paling lama.
        const arr = [...this.set];
        return arr.slice(arr.length - maxEntries);
    }
    static deserialize(arr) {
        return new AddressCache(Array.isArray(arr) ? arr : []);
    }
}

module.exports = { parseAesKey, appendEncryptedFrame, readEncryptedFrames, appendFoundTxt, AddressCache };
