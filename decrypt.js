/** decrypt.js — mendekripsi berkas hasil dan menampilkannya. */

const fs = require("fs");
const { readEncryptedFrames, parseAesKey } = require("./lib/storage");

function tampilkan(namaBerkas) {
    if (!fs.existsSync(namaBerkas)) {
        console.log(`Berkas '${namaBerkas}' tidak ditemukan.`);
        return;
    }
    try {
        const records = readEncryptedFrames(namaBerkas, parseAesKey());
        if (records.length === 0) {
            console.log(`Tidak ada catatan di ${namaBerkas}.`);
            return;
        }
        console.log(`Total ${records.length} catatan di ${namaBerkas}:\n`);
        records.forEach((r, i) => {
            console.log(`Catatan ${i + 1}:`);
            console.log(`  Pola         : ${r.pattern}`);
            console.log(`  Strategi     : ${r.strategy ?? "-"}`);
            console.log(`  Koin / Chain : ${r.coin ?? "-"} / ${r.chain_name ?? "-"}`);
            console.log(`  Alamat       : ${r.address}`);
            console.log(`  Kunci privat : ${r.private_key_hex}`);
            console.log(`  Saldo        : ${r.balance ?? r.balance_wei ?? "-"}`);
            console.log("-".repeat(40));
        });
    } catch (e) {
        console.log(`Galat saat mendekripsi: ${e.message}`);
    }
}

if (require.main === module) {
    tampilkan(process.argv[2] || "hallazgos.enc");
}

module.exports = { tampilkan };
