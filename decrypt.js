/** decrypt.js — mendekripsi berkas hasil dan menampilkannya. */

const fs = require("fs");
const path = require("path");
const { readEncryptedFrames, parseAesKey } = require("./lib/storage");

const CONFIG_FILE = path.join(__dirname, "config.json");

function loadKey() {
    if (!fs.existsSync(CONFIG_FILE)) {
        throw new Error(`config.json tidak ditemukan di ${CONFIG_FILE}`);
    }
    const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    return parseAesKey(cfg.AUDITOR_AES_KEY);
}

function tampilkan(namaBerkas) {
    if (!fs.existsSync(namaBerkas)) {
        console.log(`Berkas '${namaBerkas}' tidak ditemukan.`);
        return;
    }
    try {
        const key = loadKey();
        const records = readEncryptedFrames(namaBerkas, key);
        if (records.length === 0) {
            console.log(`Tidak ada catatan di ${namaBerkas}.`);
            return;
        }
        console.log(`Total ${records.length} catatan di ${namaBerkas}:\n`);
        records.forEach((reg, i) => {
            console.log(`Catatan ${i + 1}:`);
            console.log(`  Pola         : ${reg.pattern}`);
            console.log(`  Strategi     : ${reg.strategy ?? "-"}`);
            console.log(`  Chain        : ${reg.chain_name ?? reg.chain_id ?? "-"}`);
            console.log(`  Alamat       : ${reg.address}`);
            console.log(`  Kunci privat : ${reg.private_key_hex}`);
            console.log(`  Saldo (wei)  : ${reg.balance_wei}`);
            console.log(`  Tx terakhir  : ${reg.last_tx_unix ?? "-"}`);
            console.log("-".repeat(40));
        });
    } catch (e) {
        console.log(`Galat saat mendekripsi: ${e.message}`);
    }
}

if (require.main === module) {
    const target = process.argv[2] || "hallazgos.enc";
    tampilkan(target);
}

module.exports = { tampilkan };
