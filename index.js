#!/usr/bin/env node
/**
 * index.js — titik masuk CLI.
 *
 * Penggunaan:
 *   node index.js                  Tanya URL, lalu cek semua koin default.
 *   node index.js --coins=eth,btc  Batasi koin yang dicek.
 *   node index.js --chains=1,56    Batasi chain EVM (chain ID).
 *   node index.js --intensity=heavy Tingkat mutasi: light | medium | heavy
 *   node index.js --help           Tampilkan bantuan.
 *
 * Koin yang didukung  : eth, btc, ltc, doge, trx, sol
 * Chain EVM           : 1=Ethereum  56=BNB Chain  137=Polygon  42161=Arbitrum
 * Strategi derivasi   : sha256, doubleSha256, keccak256, sha256NoSpace, sha256Lower, md5
 *
 * Konfigurasi default dapat disimpan di config.json (lihat config.example.json).
 * Argumen CLI selalu mengalahkan config.json.
 */

const fs       = require("fs");
const readline = require("readline");
const logger   = require("./lib/logger");
const { runAudit, CHECKPOINT_FILE } = require("./auditor_brainwallet");

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
    const src = fs.readFileSync(__filename, "utf8").split("\n");
    for (const line of src) {
        if (line.startsWith(" *") || line.startsWith("/**") || line.startsWith(" */")) {
            console.log(line.replace(/^ \* ?/, "").replace(/^\/\*\*$/, "").replace(/^ \*\/$/, ""));
        }
    }
}

function prompt(question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a); }));
}

// ---------- main ----------
async function main() {
    const args   = parseArgs(process.argv);
    if (args.help) { showHelp(); process.exit(0); }

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

    // Alur normal — tanya URL
    if (!process.stdin.isTTY) {
        logger.error("Tidak bisa minta URL (stdin bukan TTY).");
        process.exit(1);
    }

    logger.banner();
    process.stdout.write(`  \x1b[90mMasukkan satu atau lebih URL untuk di-scrape.\x1b[0m\n`);
    process.stdout.write(`  \x1b[90mPisahkan dengan koma jika lebih dari satu.\x1b[0m\n`);
    process.stdout.write(`  \x1b[90mContoh: https://en.wikipedia.org/wiki/Bitcoin\x1b[0m\n\n`);
    process.stdout.write(`  \x1b[33mCatatan:\x1b[0m \x1b[90mCache alamat tidak disimpan — setiap sesi dimulai dari awal.\x1b[0m\n\n`);

    const answer = (await prompt(`  \x1b[36m\x1b[1mURL\x1b[0m > `)).trim();
    if (!answer) {
        logger.error("URL kosong, keluar.");
        process.exit(1);
    }

    opts.urls = answer.split(",").map((s) => s.trim()).filter(Boolean);
    await runAudit(opts);
}

main().catch((err) => {
    logger.error("Galat fatal:", err.message);
    process.exit(1);
});
