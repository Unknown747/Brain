#!/usr/bin/env node
/**
 * index.js — titik masuk CLI.
 *
 * Penggunaan:
 *   node index.js                  Tanya URL, lalu cek semua koin default.
 *   node index.js --coins=eth,btc  Batasi koin yang dicek.
 *   node index.js --help           Tampilkan bantuan.
 *
 * Koin yang didukung: eth, btc, ltc, doge, trx, sol
 */

const readline = require("readline");
const logger   = require("./lib/logger");
const { runAudit } = require("./auditor_brainwallet");

function parseArgs(argv) {
    const out = {};
    for (const arg of argv.slice(2)) {
        if (!arg.startsWith("--")) continue;
        const [k, v] = arg.slice(2).split("=");
        out[k.trim()] = v === undefined ? true : v;
    }
    return out;
}

function showHelp() {
    const src = require("fs").readFileSync(__filename, "utf8").split("\n");
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

async function askUrls() {
    if (!process.stdin.isTTY) {
        logger.error("Tidak bisa minta URL (stdin bukan TTY).");
        process.exit(1);
    }

    logger.banner();

    const C = {
        reset:  "\x1b[0m",
        cyan:   "\x1b[36m",
        gray:   "\x1b[90m",
        bold:   "\x1b[1m",
        white:  "\x1b[97m",
        yellow: "\x1b[33m",
    };

    process.stdout.write(`  ${C.gray}Masukkan satu atau lebih URL untuk di-scrape.${C.reset}\n`);
    process.stdout.write(`  ${C.gray}Pisahkan dengan koma jika lebih dari satu.${C.reset}\n`);
    process.stdout.write(`  ${C.gray}Contoh:${C.reset} ${C.cyan}https://en.wikipedia.org/wiki/Bitcoin${C.reset}\n\n`);
    process.stdout.write(`  ${C.yellow}Catatan:${C.reset} ${C.gray}Cache alamat tidak disimpan — setiap sesi dimulai dari awal.${C.reset}\n\n`);

    const answer = (await prompt(`  \x1b[36m\x1b[1mURL\x1b[0m > `)).trim();
    if (!answer) {
        logger.error("URL kosong, keluar.");
        process.exit(1);
    }
    return answer.split(",").map((s) => s.trim()).filter(Boolean);
}

async function main() {
    const args = parseArgs(process.argv);
    if (args.help) { showHelp(); process.exit(0); }

    const opts = {};
    if (args.coins) opts.coins = String(args.coins);
    opts.urls = await askUrls();

    await runAudit(opts);
}

main().catch((err) => {
    logger.error("Galat fatal:", err.message);
    process.exit(1);
});
