const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const KEY_FILE = path.join(process.cwd(), "aes.key");

function generateKey() {
    return crypto.randomBytes(32).toString("hex");
}

function parseAesKey(value) {
    let hex = (value || "").trim();
    if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
        if (fs.existsSync(KEY_FILE)) {
            hex = fs.readFileSync(KEY_FILE, "utf8").trim();
        }
        if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
            hex = generateKey();
            fs.writeFileSync(KEY_FILE, hex + "\n", { mode: 0o600 });
            console.log(`[AES] Kunci AES baru dibuat & disimpan di ${KEY_FILE}`);
            console.log(`[AES] SIMPAN baik-baik isi file ini. Tanpa kunci, file hallazgos.enc tidak bisa didekripsi.`);
        }
    }
    return Buffer.from(hex, "hex");
}

function appendEncryptedFrame(records, outFile, key) {
    const plain = Buffer.from(JSON.stringify(records), "utf8");
    const nonce = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, nonce);
    const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
    const tag = cipher.getAuthTag();
    const len = Buffer.alloc(4);
    len.writeUInt32BE(ct.length + tag.length, 0);
    fs.appendFileSync(outFile, Buffer.concat([len, nonce, ct, tag]));
}

function readEncryptedFrames(file, key) {
    const data = fs.readFileSync(file);
    const records = [];
    let off = 0;
    while (off < data.length) {
        if (off + 4 > data.length) break;
        const bodyLen = data.readUInt32BE(off); off += 4;
        const nonce = data.slice(off, off + 12); off += 12;
        const body = data.slice(off, off + bodyLen); off += bodyLen;
        const ct = body.slice(0, body.length - 16);
        const tag = body.slice(body.length - 16);
        const decipher = crypto.createDecipheriv("aes-256-gcm", key, nonce);
        decipher.setAuthTag(tag);
        const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
        const arr = JSON.parse(plain.toString("utf8"));
        for (const r of arr) records.push(r);
    }
    return records;
}

function appendFoundTxt(records, file) {
    const lines = records.map((r) =>
        `${r.address}\t${r.chain_name}\t${r.balance_wei}\t${r.private_key_hex}\t${r.pattern}\t${r.strategy}`
    );
    fs.appendFileSync(file, lines.join("\n") + "\n");
}

class AddressCache {
    constructor(file) {
        this.file = file;
        this.set = new Set();
        if (fs.existsSync(file)) {
            for (const line of fs.readFileSync(file, "utf8").split("\n")) {
                const t = line.trim().toLowerCase();
                if (t) this.set.add(t);
            }
        }
        this.stream = fs.createWriteStream(file, { flags: "a" });
    }
    has(addr) { return this.set.has(addr.toLowerCase()); }
    add(addr) {
        const a = addr.toLowerCase();
        if (this.set.has(a)) return;
        this.set.add(a);
        this.stream.write(a + "\n");
    }
    close() { try { this.stream.end(); } catch {} }
}

module.exports = { parseAesKey, appendEncryptedFrame, readEncryptedFrames, appendFoundTxt, AddressCache };
