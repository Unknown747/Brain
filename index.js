#!/usr/bin/env node
/**
 * index.js — titik masuk CLI.
 *
 * Penggunaan:
 *   node index.js [opsi]
 *
 * Opsi (mengganti nilai dari config.json):
 *   --wordlist=PATH         Berkas kamus (default: rockyou.txt)
 *   --chunk=N               Ukuran chunk pembacaan kamus (default: 1000)
 *   --concurrency=N         Jumlah worker paralel (default: 5)
 *   --rate=N                Batas laju panggilan API per detik (default: 5)
 *   --batch=N               Ukuran batch alamat per panggilan saldo (default: 20, maks 20)
 *   --chains=1,137,56,...   Daftar chain id Etherscan V2
 *   --strategies=a,b,c      Strategi derivasi: sha256, doubleSha256, keccak256, sha256NoSpace, sha256Lower
 *   --log=info|debug|warn   Level log (default: info)
 *   --dry-run               Jalankan satu blok lalu berhenti
 *   --reset-progress        Abaikan progress.json dan mulai ulang dari awal
 *   --no-eta                Lewati hitung total baris kamus untuk ETA (lebih cepat start)
 *   --help                  Tampilkan bantuan ini
 */

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
    if (args.wordlist) opts.wordlist = String(args.wordlist);
    if (args.chunk) opts.chunkSize = parseInt(args.chunk, 10);
    if (args.concurrency) opts.concurrency = parseInt(args.concurrency, 10);
    if (args.rate) opts.rateLimit = parseInt(args.rate, 10);
    if (args.batch) opts.batchSize = Math.min(20, parseInt(args.batch, 10));
    if (args.chains) opts.chains = String(args.chains);
    if (args.strategies) opts.strategies = String(args.strategies);
    if (args.log) opts.logLevel = String(args.log);
    if (args["dry-run"]) opts.dryRun = true;
    if (args["reset-progress"]) opts.resetProgress = true;
    if (args["no-eta"]) opts.estimateTotal = false;
    return opts;
}

const args = parseArgs(process.argv);
if (args.help) {
    showHelp();
    process.exit(0);
}

runAudit(mapArgs(args)).catch((err) => {
    console.error("[!] Galat fatal:", err.message);
    process.exit(1);
});
