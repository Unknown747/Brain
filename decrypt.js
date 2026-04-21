const { decryptFileToRecords, getAesKey } = require("./auditor_brainwallet");

function tampilkanCatatanTerenkripsi(namaBerkas) {
    try {
        const key = getAesKey(); // mengambil kunci AES dari variabel lingkungan atau .env
        const registros = decryptFileToRecords(namaBerkas, key);
        registros.forEach((reg, i) => {
            console.log(`Catatan ${i + 1}:`);
            console.log(`  Pola: ${reg.pattern}`);
            console.log(`  Alamat: ${reg.address}`);
            console.log(`  Saldo (wei): ${reg.balance_wei}`);
            console.log(`  Transaksi terakhir (unix): ${reg.last_tx_unix}`);
            console.log("-".repeat(30));
        });
    } catch (e) {
        console.log(`Galat saat mendekripsi atau membaca berkas: ${e.message}`);
    }
}

if (require.main === module) {
    tampilkanCatatanTerenkripsi("hallazgos.enc");
}
