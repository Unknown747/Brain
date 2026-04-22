#!/usr/bin/env node
/**
 * index.js — titik masuk CLI Brainwallet Auditor.
 * Lihat `node index.js --help` untuk daftar opsi lengkap.
 */

const fs       = require("fs");
const readline = require("readline");
const logger   = require("./lib/logger");
const { runAudit, CHECKPOINT_FILE } = require("./auditor_brainwallet");
const { resolveSources, listPresets } = require("./lib/sources");

// ---------- helpers ----------
function parseArgs(argv) {
    const out = {};
    for (const arg of argv.slice(2)) {
        if (!arg.startsWith("--")) continue;
        const [k, v] = arg.slice(2).split("=");
        out[k.trim()] = v === undefined ? true : v;
    }
    return out;
}

function loadConfig() {
    try {
        if (fs.existsSync("config.json")) {
            return JSON.parse(fs.readFileSync("config.json", "utf8"));
        }
    } catch (e) {
        logger.warn(`config.json tidak bisa dibaca: ${e.message}`);
    }
    return {};
}

function loadCheckpoint() {
    try {
        if (fs.existsSync(CHECKPOINT_FILE)) {
            return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, "utf8"));
        }
    } catch {}
    return null;
}

function showHelp() {
    console.log(`
Brainwallet Auditor — alat riset keamanan brainwallet

Penggunaan:
  node index.js                          Tanya URL/preset, audit semua koin default
  node index.js --urls=einstein          Pakai preset bawaan langsung (non-interaktif)
  node index.js --urls=einstein,bitcoin  Gabung beberapa preset/URL (dipisah koma)
  node index.js --urls=all               Audit semua preset bawaan sekaligus
  node index.js --sources                Tampilkan daftar preset URL bawaan
  node decrypt.js                        Tampilkan isi hallazgos.enc

Filter audit:
  --coins=eth,btc,sol                    Batasi koin (default: semua)
  --chains=1,56                          Batasi chain EVM (default: 1,56,137,42161)
  --strategies=sha256,md5                Batasi strategi hashing (default: semua 6)
  --intensity=light|medium|heavy         Tingkat mutasi (default: medium)
  --preview=20                           Cetak 20 item teratas hasil scrape lalu keluar
                                         (sanity check, tidak cek saldo)

Tuning kinerja:
  --chunkSize=1000                       Kata per blok
  --concurrency=5                        Permintaan paralel per chain EVM
  --rateLimit=5                          Request/detik (EVM)
  --batchSize=100                        Alamat per batch RPC EVM

Lain-lain:
  --logLevel=info|warn|error             Tingkat log
  --help                                 Tampilkan bantuan ini

Koin              : eth, btc, ltc, doge, sol
Chain EVM         : 1=Ethereum  56=BNB  137=Polygon  42161=Arbitrum
Strategi derivasi : sha256, doubleSha256, keccak256, sha256NoSpace, sha256Lower, md5

Konfigurasi default dapat disimpan di config.json (lihat config.example.json).
Argumen CLI selalu mengalahkan config.json.
`);
}

function prompt(question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a); }));
}

// ---------- main ----------
function showSources() {
    console.log("\n  Preset URL bawaan (ketik nama-nya saat ditanya URL):\n");
    for (const { name, urls } of listPresets()) {
        console.log(`  • ${name.padEnd(13)} → ${urls[0]}${urls.length > 1 ? `  (+${urls.length - 1})` : ""}`);
    }
    console.log();
}

async function main() {
    const args   = parseArgs(process.argv);
    if (args.help)         { showHelp();    process.exit(0); }
    if (args["sources"])   { showSources(); process.exit(0); }

    // Gabung config.json + CLI args (CLI menang)
    const config = loadConfig();
    const opts   = { ...config, ...args };

    // Cek checkpoint resume sebelum banner
    const checkpoint = loadCheckpoint();
    if (checkpoint && checkpoint.words && checkpoint.blocksDone < checkpoint.totalBlocks) {
        logger.banner();
        logger.section("Checkpoint Ditemukan");
        logger.info(`URL        : ${(checkpoint.urls || []).join(", ")}`);
        logger.info(`Progres    : blok ${checkpoint.blocksDone}/${checkpoint.totalBlocks} selesai`);
        logger.info(`Diperiksa  : ${checkpoint.stats?.fresh ?? 0} alamat, temuan: ${checkpoint.stats?.found ?? 0}`);
        process.stdout.write("\n");

        const ans = (await prompt(`  Lanjut dari checkpoint? (y/n) > `)).trim().toLowerCase();
        if (ans === "y" || ans === "ya") {
            await runAudit({ ...opts, resume: true, checkpoint });
            return;
        }
        // Tidak resume — hapus checkpoint lama, mulai baru
        try { fs.unlinkSync(CHECKPOINT_FILE); } catch {}
        logger.info("Checkpoint dihapus. Memulai sesi baru...");
    }

    // Alur normal — pakai --urls dari CLI/config kalau ada, kalau tidak tanya
    if (opts.urls) {
        const list = Array.isArray(opts.urls) ? opts.urls : String(opts.urls).split(",");
        opts.urls = resolveSources(list);
        if (opts.urls.length === 0) {
            logger.error("Tidak ada URL yang valid pada --urls.");
            process.exit(1);
        }
        await runAudit(opts);
        return;
    }

    if (!process.stdin.isTTY) {
        logger.error("Tidak bisa minta URL (stdin bukan TTY). Pakai --urls=preset_atau_url");
        process.exit(1);
    }

    logger.banner();
    process.stdout.write(`  \x1b[90mMasukkan URL atau nama preset (pisahkan dengan koma jika >1).\x1b[0m\n`);
    process.stdout.write(`  \x1b[90mPreset: einstein, shakespeare, twain, proverbs, bible, quran,\x1b[0m\n`);
    process.stdout.write(`  \x1b[90m         taoteching, bitcoin, movies, quotes, wikiquote-mix\x1b[0m\n`);
    process.stdout.write(`  \x1b[90m         (lihat semuanya: --sources)\x1b[0m\n`);
    process.stdout.write(`  \x1b[90mContoh: einstein  atau  https://en.wikipedia.org/wiki/Bitcoin\x1b[0m\n\n`);
    process.stdout.write(`  \x1b[33mCatatan:\x1b[0m \x1b[90mCache alamat tidak disimpan — setiap sesi dimulai dari awal.\x1b[0m\n\n`);

    const answer = (await prompt(`  \x1b[36m\x1b[1mURL/preset\x1b[0m > `)).trim();
    if (!answer) {
        logger.error("Input kosong, keluar.");
        process.exit(1);
    }

    opts.urls = resolveSources(answer.split(","));
    if (opts.urls.length === 0) {
        logger.error("Tidak ada URL yang valid.");
        process.exit(1);
    }
    await runAudit(opts);
}

main().catch((err) => {
    logger.error("Galat fatal:", err.message);
    process.exit(1);
});
