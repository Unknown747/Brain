/**
 * auditor_brainwallet.js — orkestrator audit brainwallet.
 *
 * Alur:
 *  1. Scrape teks dari URL → ekstrak frasa prioritas (title/heading/blockquote/
 *     teks dalam tanda kutip), frasa biasa (kalimat 4–10 kata + n-gram 3/4/5),
 *     kata tunggal, dan tahun-konteks. Token yang sudah pernah di-scrape
 *     disaring via cache.
 *  2. Hasilkan varian mutasi: case, suffix, prefix, tahun, leetspeak,
 *     camelCase/PascalCase/no-space/snake_case/kebab-case + inisial frasa
 *     + kombinasi `phrase × year-konteks` (intensitas: light/medium/heavy).
 *  3. Derivasi private key dengan banyak strategi (sha256, doubleSha256,
 *     keccak256, sha256NoSpace, sha256Lower, md5, pbkdf2, scrypt,
 *     hmacBitcoinSeed, bip39Seed; opsional: argon2).
 *  4. Cek saldo native di banyak chain EVM + non-EVM (BTC legacy + bech32,
 *     LTC/DOGE/BCH/DASH/ZEC/SOL/ADA) secara paralel.
 *  5. Kalau opsi `checkContracts` aktif, deteksi alamat yang berupa contract
 *     (eth_getCode != "0x") dan tandai khusus.
 *  6. Kalau opsi `checkTokens` aktif, cek juga saldo ERC-20 utama per chain
 *     (USDT, USDC, DAI, WETH, dll).
 *  7. Auto-discovery RPC publik dari chainlist.org (kalau opsi aktif) untuk
 *     menambah ketahanan endpoint.
 *  8. Notifikasi temuan ke Telegram bot dan/atau Discord webhook (opt-in).
 *  9. Retry otomatis saat API gagal (exponential backoff, maks 3x).
 * 10. Checkpoint otomatis (termasuk AddressCache) — bisa dilanjutkan kalau
 *     proses dihentikan di tengah, dan tidak akan mengulang pengecekan
 *     alamat yang sudah pernah dicek (resume cerdas per-coin).
 * 11. Simpan temuan terenkripsi (hallazgos.enc) + plain text (found.txt).
 * 12. Tampilkan ringkasan per koin + kesehatan RPC di akhir sesi.
 */

const fs     = require("fs");
const logger = require("./lib/logger");
const { createRateLimiter, runWithConcurrency, formatDuration, chunkArray } = require("./lib/util");
const {
    balanceMulti, codeOfMulti, tokenBalancesMulti,
    chainName, chainBatchSize, addRpcs, rpcChainStatus, reorderByHealth,
} = require("./lib/etherscan");
const rpcHealthCache             = require("./lib/rpcHealthCache");
const { deriveAll }              = require("./lib/derive");
const { generateVariants }       = require("./lib/candidates");
const { appendEncryptedFrame, appendFoundTxt, parseAesKey, AddressCache } = require("./lib/storage");
const { scrapeUrls }             = require("./lib/scraper");
const { COINS, getLimiter }      = require("./lib/multicoin");
const { tokensForChain, chainHasTokens } = require("./lib/tokens");
const { discoverRpcs }           = require("./lib/chainlist");
const notify                     = require("./lib/notify");
const scrapeCache                = require("./lib/scrapeCache");
const rpcStats                   = require("./lib/rpcStats");

const CHECKPOINT_FILE = "progress.json";

const DEFAULTS = {
    chunkSize:        500,
    concurrency:      5,
    rateLimit:        5,
    batchSize:        80,
    intensity:        "medium",
    chains:           [1, 56, 137, 42161, 10, 8453, 43114, 100, 59144, 534352, 324,
                       25, 42220, 1284, 5000, 81457, 204, 1101],
    coins:            ["eth", "btc", "btc-bech32", "ltc", "doge", "bch", "dash", "zec", "sol", "ada"],
    strategies:       ["sha256", "doubleSha256", "keccak256", "sha256NoSpace", "sha256Lower",
                       "md5", "pbkdf2", "scrypt", "hmacBitcoinSeed", "bip39Seed"],
    logLevel:         "info",
    outFile:          "hallazgos.enc",
    foundFile:        "found.txt",
    checkContracts:   true,    // #3 — deteksi smart contract
    checkTokens:      true,    // #4 — cek ERC-20 untuk chain yang tokens-nya didaftarkan
    tokenScope:       "rich",  // "rich" = hanya alamat dengan native > 0 (cepat, default)
                               // "all"  = cek SEMUA alamat (lambat, mahal RPC)
    autoDiscoverRpcs: false,   // #25 — tarik RPC tambahan dari chainlist.org
    notify:           {},      // #19 — { telegram:{...}, discord:{...} }
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
    if (typeof merged.limit       === "string") merged.limit       = parseInt(merged.limit, 10);
    // Boolean flags via CLI string ("true"/"false"/"1"/"0").
    for (const k of ["checkContracts", "checkTokens", "autoDiscoverRpcs"]) {
        const v = merged[k];
        if (typeof v === "string") merged[k] = /^(1|true|yes|on)$/i.test(v);
    }
    return merged;
}

// ───────── checkpoint ─────────
function saveCheckpoint(data) {
    try { fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(data)); } catch {}
}
function clearCheckpoint() {
    try { fs.unlinkSync(CHECKPOINT_FILE); } catch {}
}

// ───────── helper: bagi temuan ETH menjadi native + token + tandai contract ─────────
function buildEthRecords(coin, chainId, holder, balanceWei, tokens, contractsSet) {
    const records  = [];
    const isContr  = contractsSet?.has(holder.address.toLowerCase());
    const cn       = chainName(chainId);

    if (balanceWei > 0n) {
        records.push({
            coin, chainName: cn, address: holder.address, balance: balanceWei.toString(),
            phrase: holder.phrase, strategy: holder.strategy, privHex: holder.privHex,
            isContract: !!isContr,
        });
    }
    if (tokens && tokens.length > 0) {
        for (const t of tokens) {
            records.push({
                coin, chainName: cn, address: holder.address,
                balance: `${t.balance.toString()} (${t.symbol}, ${t.decimals}d)`,
                phrase: holder.phrase, strategy: holder.strategy, privHex: holder.privHex,
                isContract: !!isContr,
                tokenSymbol: t.symbol, tokenAddress: t.address,
            });
        }
    }
    return records;
}

// ───────── proses 1 blok ─────────
async function processBlock(candidates, opts, ctx) {
    const derived = [];
    for (const phrase of candidates) {
        for (const d of deriveAll(phrase, opts.strategies)) derived.push(d);
    }
    if (derived.length === 0) return { derived: 0, fresh: 0, found: 0, coinStats: new Map() };

    const enabledCoins = opts.coins.filter((c) => c === "eth" || COINS[c]);

    // Bangun daftar alamat per koin (dedupe in-memory + skip yang sudah pernah dicek).
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
            const allAddr = list.map((x) => x.address);

            // Snapshot kesehatan RPC sekali per blok (per koin ETH).
            const rpcByChain = new Map(rpcChainStatus().map((s) => [s.chainId, s]));

            for (const chainId of opts.chains) {
                // Auto-skip chain kalau RPC-nya sebagian besar sedang cooldown.
                // Default: skip kalau healthy < 30% dari total dan total > 2.
                // Chain akan dicoba lagi di blok berikutnya saat cooldown sudah habis.
                const health = rpcByChain.get(chainId);
                if (health && health.totalUrls > 2) {
                    const ratio = health.healthyCount / health.totalUrls;
                    if (health.healthyCount === 0 || ratio < 0.3) {
                        logger.warn(
                            `Skip ${chainName(chainId)} blok ini — ` +
                            `${health.healthyCount}/${health.totalUrls} RPC sehat ` +
                            `(cooldown habis dalam ~${Math.ceil(health.nextFreeInMs / 1000)}s)`
                        );
                        continue;
                    }
                }

                const sz       = chainBatchSize(chainId, opts.batchSize);
                const batches  = chunkArray(allAddr, sz);
                let evmDone    = 0;

                // Concurrency adaptif: jangan menumpuk request lebih banyak dari endpoint sehat,
                // supaya 1 endpoint tidak digempur paralel dan trigger rate-limit.
                const chainConc = health
                    ? Math.max(1, Math.min(opts.concurrency, health.healthyCount))
                    : opts.concurrency;

                // Kumpulan saldo native + alamat non-zero (untuk lanjutan: token + contract).
                const tasks = batches.map((batch) => async () => {
                    try {
                        const r = await balanceMulti(chainId, batch, ctx.limiter);
                        evmDone++;
                        logger.coinBatch(`ETH/${chainName(chainId)}`, evmDone, batches.length, batch.length);
                        return { batch, balances: r };
                    } catch (e) {
                        evmDone++;
                        logger.warn(`evm ${chainName(chainId)}: ${e.message}`);
                        return { batch, balances: new Map() };
                    }
                });
                const results = await runWithConcurrency(tasks, chainConc);

                // Pilih alamat yang akan ikut tahap "kaya" (token-check + contract-check).
                // Native > 0 selalu wajib. Untuk token-check kita cek SEMUA alamat (banyak
                // brainwallet hanya punya stable, tanpa native untuk gas).
                const richAddrs = new Set();      // native > 0
                for (const { balances } of results) {
                    for (const [addr, bal] of balances.entries()) if (bal > 0n) richAddrs.add(addr);
                }

                // (a) Token-check ERC-20 (kalau diaktifkan & chain punya daftar token).
                // Default scope = "rich": hanya alamat dengan native > 0 (cepat).
                // Scope "all": cek SEMUA alamat (mahal — ratusan ribu eth_call).
                let tokenMap = new Map();
                if (opts.checkTokens && chainHasTokens(chainId)) {
                    const tokenList = Object.entries(tokensForChain(chainId))
                        .map(([symbol, info]) => ({ symbol, ...info }));

                    let tokenTargets;
                    if (opts.tokenScope === "all") {
                        tokenTargets = batches; // semua batch alamat
                    } else {
                        // Hanya alamat dengan native > 0, dipotong ulang ke batch kecil.
                        const richList = [...richAddrs];
                        tokenTargets = chunkArray(richList, sz);
                    }

                    if (tokenTargets.length > 0) {
                        let tokDone = 0;
                        const tokTasks = tokenTargets.map((batch) => async () => {
                            try {
                                const tm = await tokenBalancesMulti(chainId, batch, tokenList, ctx.limiter);
                                tokDone++;
                                logger.coinBatch(`TOK/${chainName(chainId)}`, tokDone, tokenTargets.length, batch.length);
                                return tm;
                            } catch (e) {
                                tokDone++;
                                logger.warn(`token ${chainName(chainId)}: ${e.message}`);
                                return new Map();
                            }
                        });
                        const tokResults = await runWithConcurrency(tokTasks, chainConc);
                        for (const tm of tokResults) {
                            for (const [addr, toks] of tm.entries()) {
                                tokenMap.set(addr, toks);
                                richAddrs.add(addr);
                            }
                        }
                    }
                }

                // (b) Contract-check (kalau diaktifkan & ada alamat berdana).
                let contractsSet = new Set();
                if (opts.checkContracts && richAddrs.size > 0) {
                    try {
                        contractsSet = await codeOfMulti(chainId, [...richAddrs], ctx.limiter);
                    } catch {}
                }

                // (c) Bangun record per alamat.
                for (const { balances } of results) {
                    for (const [addr, bal] of balances.entries()) {
                        const tokens = tokenMap.get(addr) || [];
                        if (bal === 0n && tokens.length === 0) continue;
                        const holder = byAddr.get(addr);
                        if (!holder) continue;
                        const recs = buildEthRecords("eth", chainId, holder, bal, tokens, contractsSet);
                        for (const r of recs) allFound.push(r);
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
            is_contract:     !!f.isContract,
            token_symbol:    f.tokenSymbol || null,
            token_address:   f.tokenAddress || null,
            checked_at_unix: Math.floor(Date.now() / 1000),
        }));
        appendEncryptedFrame(records, opts.outFile, ctx.aesKey);
        appendFoundTxt(records, opts.foundFile);
        for (const r of records) logger.found(r);
        // Notifikasi (Telegram/Discord) — async, tidak menahan audit.
        if (notify.isEnabled()) {
            for (const r of records) notify.notifyFinding(r).catch(() => {});
        }
        logger.success(`${records.length} alamat berdana disimpan ke ${opts.outFile} & ${opts.foundFile}`);
    }

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

// ───────── audit utama ─────────
async function runAudit(overrides = {}) {
    const opts = buildOptions(overrides);
    logger.setLevel(opts.logLevel);

    // Notifikasi (#19).
    if (opts.notify && (opts.notify.telegram || opts.notify.discord)) {
        if (notify.configure(opts.notify)) {
            logger.info(`Notifikasi aktif: ${[
                opts.notify.telegram && "Telegram",
                opts.notify.discord  && "Discord",
            ].filter(Boolean).join(" + ")}`);
        }
    }

    // Hidrasi cache kesehatan RPC antar-sesi (otomatis, tanpa flag).
    // Endpoint dengan skor historis terbaik diletakkan paling depan, sehingga
    // sesi baru langsung memilih RPC yang terbukti sehat dari sesi sebelumnya.
    // Saat load, entri basi (gagal terus selama 7 hari, fail-rate >90%) dibuang
    // otomatis — endpoint-nya tetap di kode dan akan diuji ulang & masuk cache
    // lagi kalau sudah pulih.
    try {
        const fs2 = require("fs");
        let rawCount = 0;
        if (fs2.existsSync(rpcHealthCache.FILE)) {
            try {
                const raw = JSON.parse(fs2.readFileSync(rpcHealthCache.FILE, "utf8"));
                if (Array.isArray(raw)) rawCount = raw.length;
            } catch {}
        }
        const cached = rpcHealthCache.load();
        const pruned = rawCount - cached.length;
        if (cached.length > 0) {
            const n = rpcStats.hydrate(cached);
            const touched = reorderByHealth(rpcHealthCache.score) || 0;
            if (n > 0) {
                let msg = `Cache RPC dimuat: ${n} entri, ${touched} chain di-reorder berdasar histori`;
                if (pruned > 0) msg += ` (${pruned} entri basi dibuang otomatis)`;
                logger.info(msg);
            }
        } else if (pruned > 0) {
            logger.info(`Cache RPC dibersihkan: ${pruned} entri basi dibuang otomatis`);
        }
    } catch {}

    // Auto-discovery RPC (#25).
    if (opts.autoDiscoverRpcs) {
        try {
            const map = await discoverRpcs(opts.chains);
            let totalAdded = 0;
            for (const [chainId, urls] of map.entries()) {
                totalAdded += addRpcs(chainId, urls);
            }
            if (totalAdded > 0) logger.info(`Auto-discovery: +${totalAdded} RPC publik dari chainlist.org`);
        } catch (e) {
            logger.warn(`Auto-discovery RPC gagal: ${e.message}`);
        }
    }

    const isResume   = opts.resume && opts.checkpoint;
    const cpData     = opts.checkpoint || {};
    const aesKey     = parseAesKey();
    const startTime  = Date.now();
    const blockTimes = [];

    const stats = isResume
        ? { ...cpData.stats, speed: 0, skipped: cpData.stats?.skipped || 0 }
        : { blocks: 0, fresh: 0, found: 0, candidates: 0, skipped: 0, speed: 0 };

    const cumCoinStats = new Map();
    let   currentCp    = null;

    // Resume: pulihkan AddressCache & seenVariants dari checkpoint (#23).
    const restoredCache    = isResume ? AddressCache.deserialize(cpData.addressCache || []) : new AddressCache();
    const restoredSeen     = new Set(isResume ? (cpData.seenVariants || []) : []);

    const ctx = {
        aesKey,
        limiter:      createRateLimiter(opts.rateLimit),
        cache:        restoredCache,
        seenVariants: restoredSeen,
    };

    const sigintHandler = () => {
        if (currentCp) {
            saveCheckpoint(currentCp);
            logger.warn(`Dihentikan. Checkpoint disimpan → ${CHECKPOINT_FILE}. Jalankan ulang untuk melanjutkan.`);
        }
        try { rpcHealthCache.save(rpcStats.snapshot()); } catch {}
        process.exit(0);
    };
    process.once("SIGINT", sigintHandler);

    try {
        let words;
        let years      = [];
        let startBlock = 0;

        if (isResume) {
            words      = cpData.words;
            years      = cpData.years || [];
            startBlock = cpData.blocksDone;
            logger.section("Melanjutkan Sesi");
            logger.info(`Strategi  : ${opts.strategies.join(", ")}`);
            logger.info(`Koin      : ${opts.coins.join(", ")}`);
            logger.info(`EVM Chain : ${opts.chains.map(chainName).join(", ")}`);
            logger.info(`Mulai dari blok ke-${startBlock + 1} dari ${cpData.totalBlocks}`);
            if (ctx.cache.size > 0) {
                logger.info(`Cache alamat dipulihkan: ${ctx.cache.size} entri (akan di-skip)`);
            }
        } else {
            if (!opts.urls || opts.urls.length === 0) {
                throw new Error("Tidak ada URL untuk di-scrape.");
            }
            logger.section("Konfigurasi Sesi");
            logger.info(`Strategi  : ${opts.strategies.join(", ")}`);
            logger.info(`Koin      : ${opts.coins.join(", ")}`);
            logger.info(`EVM Chain : ${opts.chains.map(chainName).join(", ")}`);
            logger.info(`Intensitas: ${opts.intensity}`);
            if (opts.checkContracts) logger.info(`Deteksi contract: AKTIF`);
            if (opts.checkTokens)    logger.info(`Cek ERC-20 token : AKTIF`);

            logger.section("Scraping URL");
            const cache = scrapeCache.load();
            const cacheSize = cache.words.size + cache.phrases.size;
            if (cacheSize > 0) {
                logger.info(`Cache scrape: ${cache.words.size} kata + ${cache.phrases.size} frasa (akan di-skip)`);
            }
            logger.info(`Mengambil teks dari ${opts.urls.length} URL...`);
            const result = await scrapeUrls(opts.urls, cache);
            words = result.items;
            years = result.years;
            scrapeCache.save(cache);
            if (years.length > 0) {
                logger.info(`Tahun-konteks ditemukan: ${years.slice(0, 8).join(", ")}${years.length > 8 ? "..." : ""}`);
            }
            if (opts.limit && opts.limit > 0 && words.length > opts.limit) {
                logger.info(`Membatasi hasil scrape ke ${opts.limit} token teratas (--limit).`);
                words = words.slice(0, opts.limit);
            }
            logger.info(`Total token baru untuk diaudit: ${words.length}`);
            if (words.length === 0) {
                logger.warn("Tidak ada token baru (semua sudah pernah di-scrape). Berhenti.");
                return finalize(stats, startTime, cumCoinStats, ctx);
            }
            if (opts.preview) {
                const n = Math.max(1, parseInt(opts.preview, 10) || 20);
                logger.section(`Pratinjau (${Math.min(n, words.length)} item teratas)`);
                for (const item of words.slice(0, n)) logger.info(`  ${item}`);
                logger.info(`(${words.length} total — jalankan tanpa --preview untuk audit penuh)`);
                return finalize(stats, startTime, cumCoinStats, ctx);
            }

            // Notifikasi mulai sesi.
            notify.notifyStart({
                intensity: opts.intensity, coins: opts.coins,
                chains: opts.chains.map(chainName), urls: opts.urls,
            }).catch(() => {});
        }

        logger.section("Proses Audit");
        const chunks      = chunkArray(words, opts.chunkSize);
        const totalBlocks = chunks.length;

        for (let i = startBlock; i < totalBlocks; i++) {
            const candidates = generateVariants(chunks[i], {
                intensity: opts.intensity,
                seen:      ctx.seenVariants,
                years,
            });
            const t0 = Date.now();
            const r  = await processBlock(candidates, opts, ctx);
            const dt = Date.now() - t0;
            blockTimes.push(dt);

            stats.blocks++;
            stats.fresh      += r.fresh;
            stats.found      += r.found;
            stats.candidates += candidates.length;

            for (const [coin, s] of r.coinStats.entries()) {
                const prev = cumCoinStats.get(coin) || { checked: 0, found: 0 };
                cumCoinStats.set(coin, {
                    checked: prev.checked + s.checked,
                    found:   prev.found   + s.found,
                });
            }

            const elapsedSec = (Date.now() - startTime) / 1000;
            const speed      = elapsedSec > 0 ? Math.round(stats.fresh / elapsedSec) : 0;
            const recent     = blockTimes.slice(-5);
            const avgMs      = recent.reduce((a, b) => a + b, 0) / recent.length;
            const remaining  = totalBlocks - (i + 1);
            let   etaStr     = "selesai";
            if (remaining > 0) {
                const remMs   = remaining * avgMs;
                const finish  = new Date(Date.now() + remMs)
                    .toLocaleTimeString("id-ID", { hour12: false, hour: "2-digit", minute: "2-digit" });
                etaStr = `${formatDuration(remMs)} (~${finish})`;
            }
            stats.speed = speed;

            logger.progress(
                i + 1, totalBlocks, candidates.length,
                r.fresh, stats.found,
                (dt / 1000).toFixed(1),
                speed, etaStr
            );

            // Dashboard RPC live — snapshot per chain di antara blok.
            try {
                logger.rpcPulse(rpcChainStatus(), rpcStats.byLabel());
            } catch {}

            // Persistensi cache kesehatan RPC antar-sesi (auto, tiap blok).
            try { rpcHealthCache.save(rpcStats.snapshot()); } catch {}

            // Checkpoint: simpan progres + AddressCache + seenVariants.
            // seenVariants dibatasi 500K entri supaya checkpoint tidak meledak.
            const seenSer = [...ctx.seenVariants].slice(-500_000);
            currentCp = {
                version:      2,
                urls:         opts.urls || cpData.urls || [],
                words,
                years,
                totalBlocks,
                blocksDone:   i + 1,
                stats:        { ...stats },
                addressCache: ctx.cache.serialize(200_000),
                seenVariants: seenSer,
            };
            saveCheckpoint(currentCp);
        }
    } finally {
        process.removeListener("SIGINT", sigintHandler);
    }

    clearCheckpoint();
    currentCp = null;

    const result = finalize(stats, startTime, cumCoinStats, ctx);
    notify.notifyFinish(stats, formatDuration(Date.now() - startTime)).catch(() => {});
    return result;
}

function finalize(stats, startTime, cumCoinStats, ctx) {
    const elapsedSec = (Date.now() - startTime) / 1000;
    stats.speed = elapsedSec > 0 ? Math.round(stats.fresh / elapsedSec) : 0;
    if (ctx?.seenVariants?.__skipped != null) {
        stats.skipped = ctx.seenVariants.__skipped;
    }
    logger.coinSummary(cumCoinStats);
    logger.rpcSummary(rpcStats.snapshot());
    logger.summary(stats, formatDuration(Date.now() - startTime));
    try { rpcHealthCache.save(rpcStats.snapshot()); } catch {}
    return stats;
}

module.exports = { runAudit, CHECKPOINT_FILE };
