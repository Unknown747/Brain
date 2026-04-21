/**
 * auditor_brainwallet.js — orkestrator audit brainwallet.
 *
 * Alur:
 *  1. Scrape kata-kata dari URL.
 *  2. Hasilkan kandidat (varian huruf besar/kecil, suffix, dll).
 *  3. Derivasi private key dengan beberapa strategi.
 *  4. Cek saldo di banyak koin secara paralel (EVM + BTC/LTC/DOGE/TRX/SOL).
 *  5. Simpan temuan terenkripsi (hallazgos.enc) + plain text (found.txt).
 *
 * Cache alamat hanya disimpan di memori selama sesi berjalan.
 * Tidak ada file cache yang dibaca atau ditulis.
 */

const logger = require("./lib/logger");
const { createRateLimiter, runWithConcurrency, formatDuration, chunkArray } = require("./lib/util");
const { balanceMulti, chainName } = require("./lib/etherscan");
const { deriveAll } = require("./lib/derive");
const { generateVariants } = require("./lib/candidates");
const { appendEncryptedFrame, appendFoundTxt, parseAesKey, AddressCache } = require("./lib/storage");
const { scrapeUrls } = require("./lib/scraper");
const { COINS, getLimiter } = require("./lib/multicoin");

const DEFAULTS = {
    chunkSize:   1000,
    concurrency: 5,
    rateLimit:   5,
    batchSize:   20,
    chains:      [1],
    coins:       ["eth", "btc", "ltc", "doge", "trx", "sol"],
    strategies:  ["sha256"],
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
    return merged;
}

/**
 * Memproses satu blok kandidat: derive → cek saldo per koin (paralel) → simpan temuan.
 */
async function processBlock(candidates, opts, ctx) {
    const derived = [];
    for (const phrase of candidates) {
        for (const d of deriveAll(phrase, opts.strategies)) derived.push(d);
    }
    if (derived.length === 0) return { derived: 0, fresh: 0, found: 0 };

    const enabledCoins = opts.coins.filter((c) => c === "eth" || COINS[c]);

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
            const byAddr = new Map(list.map((x) => [x.address.toLowerCase(), x]));
            const batches = chunkArray(list.map((x) => x.address), opts.batchSize);
            for (const chainId of opts.chains) {
                const tasks = batches.map((batch) => async () => {
                    try { return await balanceMulti(chainId, batch, ctx.limiter); }
                    catch (e) { logger.warn(`evm ${chainName(chainId)}: ${e.message}`); return new Map(); }
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
                const balances = await COINS[coin].balance(list.map((x) => x.address), getLimiter(coin));
                const byAddr = new Map(list.map((x) => [x.address, x]));
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

    return { derived: derived.length, fresh: totalChecked, found: allFound.length };
}

async function runAudit(overrides = {}) {
    const opts = buildOptions(overrides);
    logger.setLevel(opts.logLevel);

    if (!opts.urls || opts.urls.length === 0) {
        throw new Error("Tidak ada URL untuk di-scrape.");
    }

    const aesKey = parseAesKey();

    logger.section("Konfigurasi Sesi");
    logger.info(`Strategi  : ${opts.strategies.join(", ")}`);
    logger.info(`Koin      : ${opts.coins.join(", ")}`);

    const ctx = {
        aesKey,
        limiter: createRateLimiter(opts.rateLimit),
        cache:   new AddressCache(),
    };

    const startTime = Date.now();
    const stats = { blocks: 0, fresh: 0, found: 0, candidates: 0 };

    try {
        logger.section("Scraping URL");
        logger.info(`Mengambil teks dari ${opts.urls.length} URL...`);
        const words = await scrapeUrls(opts.urls);
        logger.info(`Total kata baru dari URL: ${words.length}`);
        if (words.length === 0) {
            logger.warn("Tidak ada kata baru. Berhenti.");
            return finalize(stats, startTime);
        }

        logger.section("Proses Audit");
        const chunks = chunkArray(words, opts.chunkSize);
        for (let i = 0; i < chunks.length; i++) {
            const candidates = generateVariants(chunks[i]);
            const t0 = Date.now();
            const r  = await processBlock(candidates, opts, ctx);
            const dt = ((Date.now() - t0) / 1000).toFixed(1);
            stats.blocks++;
            stats.fresh      += r.fresh;
            stats.found      += r.found;
            stats.candidates += candidates.length;
            logger.progress(i + 1, chunks.length, candidates.length, r.fresh, r.found, dt);
        }
    } finally {
        ctx.cache.close();
    }

    return finalize(stats, startTime);
}

function finalize(stats, startTime) {
    logger.summary(stats, formatDuration(Date.now() - startTime));
    return stats;
}

module.exports = { runAudit };
