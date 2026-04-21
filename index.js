/**
 * index.js
 * Titik masuk utama aplikasi. Menjalankan audit brainwallet.
 */

const { main } = require("./auditor_brainwallet");

main().catch((err) => {
    console.error("[!] Galat fatal:", err);
    process.exit(1);
});
