#!/usr/bin/env node
/**
 * index.js — titik masuk CLI Brainwallet Auditor.
 *
 * Tidak ada flag baris perintah. Semua pengaturan diambil dari `config.json`
 * (lihat `config.example.json` untuk template). Saat dijalankan:
 *   1. Kalau ada checkpoint setengah-jalan → tanya lanjut/tidak.
 *   2. Kalau `config.url` di-set → langsung audit.
 *   3. Kalau tidak → tanya URL/preset secara interaktif.
 */

const fs       = require("fs");
const readline = require("readline");
const logger   = require("./lib/logger");
const { runAudit, CHECKPOINT_FILE } = require("./auditor_brainwallet");
const { resolveSources, listPresets } = require("./lib/sources");

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

function prompt(question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a); }));
}

function presetSummary() {
    const names = listPresets().map((p) => p.name);
    return names.join(", ");
}

async function main() {
    const config = loadConfig();

    // ── Resume checkpoint ───────────────────────────────────────────────
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
            await runAudit({ ...config, resume: true, checkpoint });
            return;
        }
        try { fs.unlinkSync(CHECKPOINT_FILE); } catch {}
        logger.info("Checkpoint dihapus. Memulai sesi baru...");
    }

    // ── URL dari config (kalau ada) ─────────────────────────────────────
    if (config.url || config.urls) {
        const raw = config.url || config.urls;
        const list = Array.isArray(raw) ? raw : String(raw).split(",");
        const urls = resolveSources(list);
        if (urls.length === 0) {
            logger.error("config.url tidak berisi URL/preset yang valid.");
            process.exit(1);
        }
        await runAudit({ ...config, urls });
        return;
    }

    // ── Mode interaktif ─────────────────────────────────────────────────
    if (!process.stdin.isTTY) {
        logger.error("Tidak ada `url` di config.json dan stdin bukan TTY. Isi `url` di config.json.");
        process.exit(1);
    }

    logger.banner();
    process.stdout.write(`  \x1b[90mMasukkan URL atau nama preset (pisahkan dengan koma jika >1).\x1b[0m\n`);
    process.stdout.write(`  \x1b[90mPreset: ${presetSummary()}\x1b[0m\n`);
    process.stdout.write(`  \x1b[90mContoh: einstein  atau  https://en.wikipedia.org/wiki/Bitcoin\x1b[0m\n\n`);
    process.stdout.write(`  \x1b[33mTip:\x1b[0m \x1b[90mIsi \`url\` di config.json untuk lewati prompt ini.\x1b[0m\n\n`);

    const answer = (await prompt(`  \x1b[36m\x1b[1mURL/preset\x1b[0m > `)).trim();
    if (!answer) {
        logger.error("Input kosong, keluar.");
        process.exit(1);
    }

    const urls = resolveSources(answer.split(","));
    if (urls.length === 0) {
        logger.error("Tidak ada URL yang valid.");
        process.exit(1);
    }

    const opts = { ...config, urls };

    if (!config.intensity) {
        process.stdout.write(`\n  \x1b[90mIntensitas mutasi: light = cepat, medium = seimbang, heavy = luas\x1b[0m\n`);
        const ans = (await prompt(`  \x1b[36m\x1b[1mIntensitas\x1b[0m (light/medium/heavy) [medium] > `)).trim().toLowerCase();
        if (["light", "medium", "heavy"].includes(ans)) opts.intensity = ans;
    }

    await runAudit(opts);
}

main().catch((err) => {
    logger.error("Galat fatal:", err.message);
    process.exit(1);
});
