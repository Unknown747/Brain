/**
 * auditor_brainwallet.js
 * Orkestrator audit brainwallet:
 *  - Membaca kamus (chunked)
 *  - Membangkitkan kandidat + varian
 *  - Menurunkan kunci dengan banyak strategi
 *  - Mengkueri saldo via Etherscan API V2 secara batch & multi-chain
 *  - Hanya alamat dengan saldo > 0 yang dikueri tx terakhir
 *  - Menyimpan temuan terenkripsi (framed/append) + berkas teks
 *  - Cache alamat agar tidak mengkueri ulang
 *  - Checkpoint progres antar-blok
 */

const fs = require("fs");
const path = require("path");
const logger = require("./lib/logger");
const { createRateLimiter, runWithConcurrency, formatDuration, eta, chunkArray } = require("./lib/util");
const { balanceMulti, lastTxTimestamp, chainName } = require("./lib/etherscan");
const { deriveAll } = require("./lib/derive");
const { generateCandidatesFromWordlist, readChunks, countLines } = require("./lib/candidates");
const { appendEncryptedFrame, appendFoundTxt, parseAesKey, AddressCache } = require("./lib/storage");
const { scrapeUrls } = require("./lib/scraper");

const CONFIG_FILE = path.join(__dirname, "config.json");

const DEFAULTS = {
    wordlist: "rockyou.txt",
    chunkSize: 1000,
    concurrency: 5,
    rateLimit: 5,
    chains: [1],
    strategies: ["sha256"],
    logLevel: "info",
    outFile: "hallazgos.enc",
    foundFile: "found.txt",
    cacheFile: "cache.txt",
    progressFile: "progress.json",
    batchSize: 20,
};

const SAMPLE_WORDLIST = ["password", "123456", "admin", "qwerty", "letmein"];

// -----------------------
// Konfigurasi
// -----------------------

function loadConfig() {
    if (!fs.existsSync(CONFIG_FILE)) {
        logger.warn(`Berkas konfigurasi tidak ditemukan: ${CONFIG_FILE}. Menggunakan default.`);
        return {};
    }
    try {
        return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    } catch (e) {
        throw new Error(`Gagal membaca ${CONFIG_FILE}: ${e.message}`);
    }
}

function buildOptions(overrides = {}) {
    const cfg = loadConfig();
    const merged = { ...DEFAULTS, ...cfg, ...overrides };
    if (typeof merged.chains === "string") {
        merged.chains = merged.chains.split(",").map((s) => parseInt(s.trim(), 10)).filter(Boolean);
    }
    if (typeof merged.strategies === "string") {
        merged.strategies = merged.strategies.split(",").map((s) => s.trim()).filter(Boolean);
    }
    return merged;
}

// -----------------------
// Inti audit
// -----------------------

/**
 * Memproses satu blok kandidat:
 *  1. Derivasi (alamat + kunci) per strategi
 *  2. Filter alamat yang sudah di-cache
 *  3. Batch saldo per-chain (parallel + rate-limited)
 *  4. Untuk saldo > 0: kueri tx terakhir
 *  5. Simpan temuan terenkripsi + teks
 */
async function processBlock(candidates, opts, ctx) {
    // 1. Derivasi
    const derived = [];
    for (const phrase of candidates) {
        for (const d of deriveAll(phrase, opts.strategies)) {
            derived.push(d);
        }
    }

    // 2. Filter cache (dedupe per address)
    const seen = new Set();
    const fresh = [];
    let cached = 0;
    for (const d of derived) {
        const a = d.address.toLowerCase();
        if (ctx.cache.has(a) || seen.has(a)) {
            cached++;
            continue;
        }
        seen.add(a);
        fresh.push(d);
    }

    if (fresh.length === 0) {
        logger.debug(`Blok diproses, semua alamat sudah ada di cache (${cached}).`);
        return { derived: derived.length, fresh: 0, found: 0 };
    }

    // 3. Batch & kueri per chain
    const byAddress = new Map();
    for (const d of fresh) byAddress.set(d.address.toLowerCase(), d);

    const batches = chunkArray(fresh.map((d) => d.address), opts.batchSize);
    const allFound = [];

    for (const chainId of opts.chains) {
        const tasks = batches.map((batch) => async () => {
            try {
                return await balanceMulti(chainId, batch, opts.apiKey, ctx.limiter);
            } catch (e) {
                logger.warn(`balancemulti ${chainName(chainId)}: ${e.message}`);
                return new Map();
            }
        });
        const maps = await runWithConcurrency(tasks, opts.concurrency);

        for (const m of maps) {
            for (const [addr, balance] of m.entries()) {
                if (balance > 0n) {
                    const orig = byAddress.get(addr);
                    if (orig) {
                        allFound.push({ ...orig, chainId, balance: balance.toString() });
                    }
                }
            }
        }
    }

    // 4. Untuk temuan, ambil tx terakhir
    if (allFound.length > 0) {
        const txTasks = allFound.map((f) => async () => {
            f.lastTx = await lastTxTimestamp(f.chainId, f.address, opts.apiKey, ctx.limiter);
        });
        await runWithConcurrency(txTasks, opts.concurrency);

        // 5. Simpan
        const records = allFound.map((f) => ({
            pattern: f.phrase,
            strategy: f.strategy,
            chain_id: f.chainId,
            chain_name: chainName(f.chainId),
            private_key_hex: f.privHex,
            address: f.address,
            balance_wei: f.balance,
            last_tx_unix: f.lastTx ?? null,
            checked_at_unix: Math.floor(Date.now() / 1000),
        }));

        appendEncryptedFrame(records, opts.outFile, ctx.aesKey);
        appendFoundTxt(records, opts.foundFile);
        logger.success(`DITEMUKAN ${records.length} alamat berdana! Disimpan ke ${opts.outFile} & ${opts.foundFile}`);
        for (const r of records) {
            logger.success(`  ${r.address} [${r.chain_name}] saldo=${r.balance_wei} wei  pola="${r.pattern}" (${r.strategy})`);
        }
    }

    // Tandai semua alamat sebagai sudah dicek (di cache)
    for (const d of fresh) ctx.cache.add(d.address);

    return { derived: derived.length, fresh: fresh.length, found: allFound.length };
}

// -----------------------
// Loop utama
// -----------------------

async function runAudit(overrides = {}) {
    const opts = buildOptions(overrides);
    logger.setLevel(opts.logLevel);

    // Validasi
    const aesKey = parseAesKey(opts.AUDITOR_AES_KEY);
    opts.apiKey = null; // backend RPC publik tidak butuh API key

    logger.info(`Strategi derivasi : ${opts.strategies.join(", ")}`);
    logger.info(`Chain dipantau    : ${opts.chains.map(chainName).join(", ")}`);
    logger.info(`Konkurensi/Laju   : ${opts.concurrency} worker, ${opts.rateLimit} req/det`);
    logger.info(`Ukuran batch saldo: ${opts.batchSize} alamat per panggilan`);
    logger.info(`Berkas keluaran   : ${opts.outFile}, ${opts.foundFile}`);

    const ctx = {
        aesKey,
        limiter: createRateLimiter(opts.rateLimit),
        cache: new AddressCache(opts.cacheFile),
    };

    // Muat progres
    let startBlock = 0;
    if (fs.existsSync(opts.progressFile) && !opts.resetProgress) {
        try {
            const p = JSON.parse(fs.readFileSync(opts.progressFile, "utf8"));
            startBlock = p.nextBlock || 0;
            if (startBlock > 0) logger.info(`Melanjutkan dari blok #${startBlock}`);
        } catch {}
    }

    const startTime = Date.now();
    const stats = { blocks: 0, derived: 0, fresh: 0, found: 0, candidates: 0 };

    try {
        // Mode scraping URL: ambil kata-kata dari URL, jadikan brainwallet langsung
        if (opts.urls && opts.urls.length > 0) {
            logger.info(`Mengambil teks dari ${opts.urls.length} URL...`);
            const words = await scrapeUrls(opts.urls);
            logger.info(`Total kata unik dari URL: ${words.length}`);
            if (words.length === 0) {
                logger.warn("Tidak ada kata yang bisa di-scrape. Berhenti.");
                return finalize(stats, startTime, ctx);
            }
            const chunks = chunkArray(words, opts.chunkSize);
            for (let i = 0; i < chunks.length; i++) {
                const candidates = generateCandidatesFromWordlist(chunks[i]);
                const t0 = Date.now();
                const r = await processBlock(candidates, opts, ctx);
                const dt = (Date.now() - t0) / 1000;
                stats.blocks++; stats.derived += r.derived; stats.fresh += r.fresh; stats.found += r.found;
                stats.candidates += candidates.length;
                logger.info(`Blok #${i + 1}/${chunks.length}: ${candidates.length} kandidat, ${r.fresh} baru, ${r.found} temuan (${dt.toFixed(1)}d)`);
                if (opts.dryRun) break;
            }
            return finalize(stats, startTime, ctx);
        }

        if (!fs.existsSync(opts.wordlist)) {
            logger.warn(`Kamus '${opts.wordlist}' tidak ditemukan, memakai daftar kecil bawaan.`);
            const candidates = generateCandidatesFromWordlist(SAMPLE_WORDLIST);
            logger.info(`Kandidat dihasilkan: ${candidates.length}`);
            const r = await processBlock(candidates, opts, ctx);
            stats.blocks++; stats.derived += r.derived; stats.fresh += r.fresh; stats.found += r.found;
            stats.candidates += candidates.length;
            return finalize(stats, startTime, ctx);
        }

        // Estimasi total baris untuk ETA (dilakukan sekali, asynchronous tidak berat)
        let totalLines = null;
        if (opts.estimateTotal !== false) {
            logger.info("Menghitung total baris kamus untuk estimasi ETA...");
            totalLines = await countLines(opts.wordlist);
            logger.info(`Total baris kamus: ${totalLines.toLocaleString()}`);
        }

        let blockIndex = 0;
        for await (const batch of readChunks(opts.wordlist, opts.chunkSize)) {
            blockIndex++;
            if (blockIndex < startBlock) continue;

            const candidates = generateCandidatesFromWordlist(batch);
            const t0 = Date.now();
            const r = await processBlock(candidates, opts, ctx);
            const dt = (Date.now() - t0) / 1000;

            stats.blocks++;
            stats.derived += r.derived;
            stats.fresh += r.fresh;
            stats.found += r.found;
            stats.candidates += candidates.length;

            const wordsDone = blockIndex * opts.chunkSize;
            const etaStr = totalLines ? eta(wordsDone, totalLines, startTime) : "?";
            const rate = (stats.candidates / ((Date.now() - startTime) / 1000)).toFixed(0);
            logger.info(
                `Blok #${blockIndex}: ${candidates.length} kandidat, ${r.fresh} baru, ${r.found} temuan ` +
                `(${dt.toFixed(1)}d) | total kandidat=${stats.candidates}, temuan=${stats.found}, ` +
                `kecepatan=${rate}/d, ETA=${etaStr}`
            );

            // Simpan checkpoint
            fs.writeFileSync(
                opts.progressFile,
                JSON.stringify({ nextBlock: blockIndex + 1, updatedAt: new Date().toISOString() }, null, 2)
            );

            if (opts.dryRun) {
                logger.info("Mode --dry-run aktif, berhenti setelah satu blok.");
                break;
            }
        }
    } finally {
        ctx.cache.close();
    }

    return finalize(stats, startTime, ctx);
}

function finalize(stats, startTime, ctx) {
    const elapsed = formatDuration(Date.now() - startTime);
    logger.success(
        `Audit selesai dalam ${elapsed}. Blok=${stats.blocks}, kandidat=${stats.candidates}, ` +
        `alamat baru=${stats.fresh}, temuan=${stats.found}.`
    );
    return stats;
}

// -----------------------
// Ekspor
// -----------------------

module.exports = {
    runAudit,
    loadConfig,
    buildOptions,
};
