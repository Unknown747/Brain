#!/usr/bin/env node
/**
 * index.js — titik masuk CLI.
 *
 * Saat dijalankan tanpa argumen, script akan menanyakan URL
 * (misal halaman Wikipedia). Teks dari URL akan diambil otomatis,
 * kata-katanya dijadikan brainwallet, lalu saldo dicek di beberapa
 * jaringan EVM (gratis tanpa API key, lewat RPC publik).
 *
 * Penggunaan:
 *   node index.js                       (interaktif, akan minta URL)
 *   node index.js --url=https://...     (langsung dari satu URL)
 *   node index.js --url=URL1,URL2       (beberapa URL)
 *   node index.js --wordlist=file.txt   (mode kamus klasik)
 *
 * Opsi:
 *   --url=URL[,URL2,...]    URL yang akan di-scrape jadi sumber kata
 *   --wordlist=PATH         Berkas kamus (alternatif ke --url)
 *   --chunk=N               Ukuran chunk (default 1000)
 *   --concurrency=N         Jumlah worker paralel (default 5)
 *   --rate=N                Batas laju panggilan RPC per detik (default 5)
 *   --batch=N               Ukuran batch alamat (default 20)
 *   --chains=1,137,56,...   Daftar chain id (default: 1,10,56,137,8453,42161)
 *   --coins=eth,btc,ltc,... Koin yang dicek (default: eth,btc,ltc,doge,trx,sol)
 *   --strategies=a,b,c      Strategi derivasi (default: sha256,keccak256,doubleSha256)
 *   --log=info|debug|warn   Level log
 *   --dry-run               Jalankan satu blok lalu berhenti
 *   --reset-progress        Mulai dari awal
 *   --no-eta                Lewati hitung total baris kamus
 *   --help                  Tampilkan bantuan ini
 */

const readline = require("readline");
const { runAudit } = require("./auditor_brainwallet");

function parseArgs(argv) {
    const out = {};
    for (const arg of argv.slice(2)) {
        if (!arg.startsWith("--")) continue;
        const [rawKey, rawVal] = arg.slice(2).split("=");
        const key = rawKey.trim();
        const val = rawVal === undefined ? true : rawVal;
        out[key] = val;
    }
    return out;
}

function showHelp() {
    const lines = require("fs").readFileSync(__filename, "utf8").split("\n");
    for (const line of lines) {
        if (line.startsWith(" *") || line.startsWith("/**") || line.startsWith(" */")) {
            console.log(line.replace(/^ \* ?/, "").replace(/^\/\*\*$/, "").replace(/^ \*\/$/, ""));
        }
    }
}

function mapArgs(args) {
    const opts = {};
    if (args.url) {
        opts.urls = String(args.url).split(",").map((s) => s.trim()).filter(Boolean);
    }
    if (args.wordlist) opts.wordlist = String(args.wordlist);
    if (args.chunk) opts.chunkSize = parseInt(args.chunk, 10);
    if (args.concurrency) opts.concurrency = parseInt(args.concurrency, 10);
    if (args.rate) opts.rateLimit = parseInt(args.rate, 10);
    if (args.batch) opts.batchSize = Math.min(20, parseInt(args.batch, 10));
    if (args.chains) opts.chains = String(args.chains);
    if (args.coins) opts.coins = String(args.coins);
    if (args.strategies) opts.strategies = String(args.strategies);
    if (args.log) opts.logLevel = String(args.log);
    if (args["dry-run"]) opts.dryRun = true;
    if (args["reset-progress"]) opts.resetProgress = true;
    if (args["no-eta"]) opts.estimateTotal = false;
    return opts;
}

function prompt(question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
}

async function main() {
    const args = parseArgs(process.argv);
    if (args.help) {
        showHelp();
        process.exit(0);
    }

    const opts = mapArgs(args);

    // Selalu tanya URL di awal (kecuali --wordlist dipakai)
    if (!opts.urls && !args.wordlist) {
        if (!process.stdin.isTTY) {
            console.error("[!] Tidak ada URL dan stdin bukan TTY.");
            console.error("    Jalankan langsung: node index.js  (lalu masukkan URL saat diminta)");
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
        opts.urls = answer.split(",").map((s) => s.trim()).filter(Boolean);
    }

    await runAudit(opts);
}

main().catch((err) => {
    console.error("[!] Galat fatal:", err.message);
    process.exit(1);
});
