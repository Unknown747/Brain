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
        console.error("[!] Tidak bisa minta URL (stdin bukan TTY).");
        process.exit(1);
    }
    console.log("==================================================");
    console.log(" Brainwallet Auditor");
    console.log("==================================================");
    console.log(" Masukkan URL untuk diambil teksnya & dijadikan brainwallet.");
    console.log(" Bisa lebih dari satu, pisahkan dengan koma.");
    console.log(" Contoh: https://en.wikipedia.org/wiki/Bitcoin");
    console.log("");
    const answer = (await prompt("URL > ")).trim();
    if (!answer) {
        console.error("[!] URL kosong, keluar.");
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
    console.error("[!] Galat fatal:", err.message);
    process.exit(1);
});
