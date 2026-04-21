/**
 * auditor_brainwallet.js — orkestrator audit brainwallet.
 *
 * Alur:
 *  1. Scrape kata-kata dari URL (stop-words difilter otomatis).
 *  2. Hasilkan kandidat + bigram (varian huruf besar/kecil, suffix, kombinasi 2 kata).
 *  3. Derivasi private key dengan 6 strategi (sha256, doubleSha256, keccak256,
 *     sha256NoSpace, sha256Lower, md5).
 *  4. Cek saldo di 10 jaringan secara paralel (ETH/BSC/Polygon/Arbitrum + BTC/LTC/DOGE/TRX/SOL).
 *  5. Retry otomatis saat API gagal (exponential backoff, maks 3x).
 *  6. Checkpoint otomatis — bisa dilanjutkan jika proses dihentikan di tengah jalan.
 *  7. Simpan temuan terenkripsi (hallazgos.enc) + plain text (found.txt).
 *  8. Tampilkan ringkasan per koin di akhir sesi.
 *
 * Cache alamat hanya di memori — tidak ada file cache yang ditulis ke disk.
 */

const fs     = require("fs");
const logger = require("./lib/logger");
const { createRateLimiter, runWithConcurrency, formatDuration, chunkArray } = require("./lib/util");
const { balanceMulti, chainName } = require("./lib/etherscan");
const { deriveAll } = require("./lib/derive");
const { generateVariants } = require("./lib/candidates");
const { appendEncryptedFrame, appendFoundTxt, parseAesKey, AddressCache } = require("./lib/storage");
const { scrapeUrls } = require("./lib/scraper");
const { COINS, getLimiter } = require("./lib/multicoin");

const CHECKPOINT_FILE = "progress.json";

const DEFAULTS = {
    chunkSize:   1000,
    concurrency: 5,
    rateLimit:   5,
    batchSize:   20,
    chains:      [1, 56, 137, 42161],
    coins:       ["eth", "btc", "ltc", "doge", "trx", "sol"],
    strategies:  ["sha256", "doubleSha256", "keccak256", "sha256NoSpace", "sha256Lower", "md5"],
    logLevel:    "info",
    outFile:     "hallazgos.enc",
    foundFile:   "found.txt",
};

function buildOptions(overrides = {}) {
    const merged = { ...DEFAULTS, ...overrides };
    if (typeof merged.chains === "string") {
        merged.chains = merged.chains.split(",").map((s) => parseInt(s.trim(), 10)).filter(Boolean);
    }
    if (typeof merged.strategies === "string") {
        merged.strategies = merged.strategies.split(",").map((s) => s.trim()).filter(Boolean);
    }
    if (typeof merged.coins === "string") {
        merged.coins = merged.coins.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    }
    if (typeof merged.chunkSize   === "string") merged.chunkSize   = parseInt(merged.chunkSize, 10);
    if (typeof merged.concurrency === "string") merged.concurrency = parseInt(merged.concurrency, 10);
    if (typeof merged.rateLimit   === "string") merged.rateLimit   = parseInt(merged.rateLimit, 10);
    if (typeof merged.batchSize   === "string") merged.batchSize   = parseInt(merged.batchSize, 10);
    return merged;
}

// ---------- checkpoint ----------
function saveCheckpoint(data) {
    try { fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(data)); } catch {}
}

function clearCheckpoint() {
    try { fs.unlinkSync(CHECKPOINT_FILE); } catch {}
}

// ---------- process block ----------
async function processBlock(candidates, opts, ctx) {
    const derived = [];
    for (const phrase of candidates) {
        for (const d of deriveAll(phrase, opts.strategies)) derived.push(d);
    }
    if (derived.length === 0) return { derived: 0, fresh: 0, found: 0, coinStats: new Map() };

    const enabledCoins = opts.coins.filter((c) => c === "eth" || COINS[c]);

    // Bangun daftar alamat per koin (dedupe in-memory)
    const perCoin = {};
    for (const coin of enabledCoins) {
        perCoin[coin] = [];
        const seen = new Set();
        for (const d of derived) {
            let addr;
            try { addr = coin === "eth" ? d.address : COINS[coin].derive(d.privHex); }
            catch { continue; }
            const key = `${coin}:${addr.toLowerCase()}`;
            if (ctx.cache.has(key) || seen.has(key)) continue;
            seen.add(key);
            perCoin[coin].push({ ...d, address: addr });
        }
    }

    const allFound = [];
    await Promise.all(enabledCoins.map(async (coin) => {
        const list = perCoin[coin];
        if (list.length === 0) return;

        const t0coin = Date.now();

        if (coin === "eth") {
            const byAddr  = new Map(list.map((x) => [x.address.toLowerCase(), x]));
            const batches = chunkArray(list.map((x) => x.address), opts.batchSize);
            for (const chainId of opts.chains) {
                let evmDone = 0;
                const tasks = batches.map((batch) => async () => {
                    try {
                        const r = await balanceMulti(chainId, batch, ctx.limiter);
                        evmDone++;
                        logger.coinBatch(`ETH/${chainName(chainId)}`, evmDone, batches.length, batch.length);
                        return r;
                    } catch (e) {
                        evmDone++;
                        logger.warn(`evm ${chainName(chainId)}: ${e.message}`);
                        return new Map();
                    }
                });
                const maps = await runWithConcurrency(tasks, opts.concurrency);
                for (const m of maps) for (const [addr, bal] of m.entries()) {
                    if (bal > 0n) {
                        const o = byAddr.get(addr);
                        if (o) allFound.push({ ...o, coin: "eth", chainName: chainName(chainId), balance: bal.toString() });
                    }
                }
            }
        } else {
            try {
                const onBatch  = (done, total, size) => logger.coinBatch(coin.toUpperCase(), done, total, size);
                const balances = await COINS[coin].balance(list.map((x) => x.address), getLimiter(coin), onBatch);
                const byAddr   = new Map(list.map((x) => [x.address, x]));
                for (const [addr, bal] of balances.entries()) {
                    if (bal > 0n) {
                        const o = byAddr.get(addr);
                        if (o) allFound.push({ ...o, coin, chainName: COINS[coin].name, balance: bal.toString() });
                    }
                }
            } catch (e) { logger.warn(`${coin}: ${e.message}`); }
        }

        for (const x of list) ctx.cache.add(`${coin}:${x.address.toLowerCase()}`);

        const dtCoin = ((Date.now() - t0coin) / 1000).toFixed(2);
        logger.coinCheck(coin.toUpperCase(), list.length, dtCoin);
    }));

    const totalChecked = Object.values(perCoin).reduce((s, l) => s + l.length, 0);

    if (allFound.length > 0) {
        const records = allFound.map((f) => ({
            pattern:         f.phrase,
            strategy:        f.strategy,
            coin:            f.coin,
            chain_name:      f.chainName,
            private_key_hex: f.privHex,
            address:         f.address,
            balance:         f.balance,
            checked_at_unix: Math.floor(Date.now() / 1000),
        }));
        appendEncryptedFrame(records, opts.outFile, ctx.aesKey);
        appendFoundTxt(records, opts.foundFile);
        for (const r of records) logger.found(r);
        logger.success(`${records.length} alamat berdana disimpan ke ${opts.outFile} & ${opts.foundFile}`);
    }

    // Hitung statistik per koin untuk ringkasan akhir
    const coinFoundCount = {};
    for (const f of allFound) coinFoundCount[f.coin] = (coinFoundCount[f.coin] || 0) + 1;

    const coinStats = new Map();
    for (const coin of enabledCoins) {
        coinStats.set(coin, {
            checked: perCoin[coin].length,
            found:   coinFoundCount[coin] || 0,
        });
    }

    return { derived: derived.length, fresh: totalChecked, found: allFound.length, coinStats };
}

// ---------- audit utama ----------
async function runAudit(overrides = {}) {
    const opts = buildOptions(overrides);
    logger.setLevel(opts.logLevel);

    const isResume     = opts.resume && opts.checkpoint;
    const cpData       = opts.checkpoint || {};
    const aesKey       = parseAesKey();
    const startTime    = Date.now();
    const blockTimes   = [];

    const stats = isResume
        ? { ...cpData.stats, speed: 0 }
        : { blocks: 0, fresh: 0, found: 0, candidates: 0, speed: 0 };

    const cumCoinStats = new Map();
    let   currentCp    = null;

    // SIGINT — simpan checkpoint sebelum keluar
    const sigintHandler = () => {
        if (currentCp) {
            saveCheckpoint(currentCp);
            logger.warn(`Dihentikan. Checkpoint disimpan → ${CHECKPOINT_FILE}. Jalankan ulang untuk melanjutkan.`);
        }
        process.exit(0);
    };
    process.once("SIGINT", sigintHandler);

    const ctx = {
        aesKey,
        limiter: createRateLimiter(opts.rateLimit),
        cache:   new AddressCache(),
    };

    try {
        let words;
        let startBlock = 0;

        if (isResume) {
            // ── Resume dari checkpoint ─────────────────────
            words      = cpData.words;
            startBlock = cpData.blocksDone;
            logger.section("Melanjutkan Sesi");
            logger.info(`Strategi  : ${opts.strategies.join(", ")}`);
            logger.info(`Koin      : ${opts.coins.join(", ")}`);
            logger.info(`EVM Chain : ${opts.chains.map(chainName).join(", ")}`);
            logger.info(`Mulai dari blok ke-${startBlock + 1} dari ${cpData.totalBlocks}`);
        } else {
            // ── Sesi baru ──────────────────────────────────
            if (!opts.urls || opts.urls.length === 0) {
                throw new Error("Tidak ada URL untuk di-scrape.");
            }
            logger.section("Konfigurasi Sesi");
            logger.info(`Strategi  : ${opts.strategies.join(", ")}`);
            logger.info(`Koin      : ${opts.coins.join(", ")}`);
            logger.info(`EVM Chain : ${opts.chains.map(chainName).join(", ")}`);

            logger.section("Scraping URL");
            logger.info(`Mengambil teks dari ${opts.urls.length} URL...`);
            words = await scrapeUrls(opts.urls);
            logger.info(`Total kata baru: ${words.length}`);
            if (words.length === 0) {
                logger.warn("Tidak ada kata baru. Berhenti.");
                return finalize(stats, startTime, cumCoinStats);
            }
        }

        logger.section("Proses Audit");
        const chunks     = chunkArray(words, opts.chunkSize);
        const totalBlocks = chunks.length;

        for (let i = startBlock; i < totalBlocks; i++) {
            const candidates = generateVariants(chunks[i]);
            const t0 = Date.now();
            const r  = await processBlock(candidates, opts, ctx);
            const dt = Date.now() - t0;
            blockTimes.push(dt);

            stats.blocks++;
            stats.fresh      += r.fresh;
            stats.found      += r.found;
            stats.candidates += candidates.length;

            // Gabung coinStats per blok ke kumulatif
            for (const [coin, s] of r.coinStats.entries()) {
                const prev = cumCoinStats.get(coin) || { checked: 0, found: 0 };
                cumCoinStats.set(coin, {
                    checked: prev.checked + s.checked,
                    found:   prev.found   + s.found,
                });
            }

            // Kecepatan & ETA
            const elapsedSec = (Date.now() - startTime) / 1000;
            const speed      = elapsedSec > 0 ? Math.round(stats.fresh / elapsedSec) : 0;
            const avgMs      = blockTimes.reduce((a, b) => a + b, 0) / blockTimes.length;
            const remaining  = totalBlocks - (i + 1);
            const etaStr     = remaining > 0 ? formatDuration(remaining * avgMs) : "selesai";
            stats.speed      = speed;

            logger.progress(
                i + 1, totalBlocks, candidates.length,
                r.fresh, stats.found,
                (dt / 1000).toFixed(1),
                speed, etaStr
            );

            // Simpan checkpoint setelah tiap blok
            currentCp = {
                version:     1,
                urls:        opts.urls || cpData.urls || [],
                words,
                totalBlocks,
                blocksDone:  i + 1,
                stats:       { ...stats },
            };
            saveCheckpoint(currentCp);
        }
    } finally {
        process.removeListener("SIGINT", sigintHandler);
    }

    // Audit selesai — hapus checkpoint
    clearCheckpoint();
    currentCp = null;

    return finalize(stats, startTime, cumCoinStats);
}

function finalize(stats, startTime, cumCoinStats) {
    const elapsedSec = (Date.now() - startTime) / 1000;
    stats.speed = elapsedSec > 0 ? Math.round(stats.fresh / elapsedSec) : 0;
    logger.coinSummary(cumCoinStats);
    logger.summary(stats, formatDuration(Date.now() - startTime));
    return stats;
}

module.exports = { runAudit, CHECKPOINT_FILE };
