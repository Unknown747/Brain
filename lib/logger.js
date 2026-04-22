const C = {
    reset:   "\x1b[0m",
    bold:    "\x1b[1m",
    cyan:    "\x1b[36m",
    green:   "\x1b[32m",
    yellow:  "\x1b[33m",
    red:     "\x1b[31m",
    magenta: "\x1b[35m",
    blue:    "\x1b[34m",
    white:   "\x1b[97m",
    gray:    "\x1b[90m",
    bgGreen: "\x1b[42m",
};

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, success: 25 };
let current = LEVELS.info;

function setLevel(name) {
    const lvl = LEVELS[String(name || "").toLowerCase()];
    if (lvl) current = lvl;
}

function ts() {
    const d  = new Date();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
}

function log(level, ...args) {
    if (LEVELS[level] < current) return;
    const msg  = args.join(" ");
    const time = `${C.gray}${ts()}${C.reset}`;
    let badge  = "";
    let text   = "";

    switch (level) {
        case "debug":
            badge = `${C.gray}[DBG]${C.reset}`;
            text  = `${C.gray}${msg}${C.reset}`;
            break;
        case "info":
            badge = `${C.cyan}[INF]${C.reset}`;
            text  = `${C.white}${msg}${C.reset}`;
            break;
        case "warn":
            badge = `${C.yellow}[WRN]${C.reset}`;
            text  = `${C.yellow}${msg}${C.reset}`;
            break;
        case "error":
            badge = `${C.red}[ERR]${C.reset}`;
            text  = `${C.red}${msg}${C.reset}`;
            break;
        case "success":
            badge = `${C.green}[WIN]${C.reset}`;
            text  = `${C.bold}${C.green}${msg}${C.reset}`;
            break;
    }
    process.stdout.write(`${time} ${badge} ${text}\n`);
}

function banner() {
    const line = `${C.cyan}${"═".repeat(58)}${C.reset}`;
    const time = new Date().toLocaleString("id-ID", { hour12: false });
    process.stdout.write("\n" + line + "\n");
    process.stdout.write(`${C.bold}${C.cyan}  ⛓  BRAINWALLET AUDITOR${C.reset}   ${C.gray}security research tool${C.reset}\n`);
    process.stdout.write(`${C.gray}  ${time}${C.reset}\n`);
    process.stdout.write(line + "\n\n");
}

function section(title) {
    process.stdout.write(`\n${C.bold}${C.blue}▶ ${title}${C.reset}\n`);
    process.stdout.write(`${C.gray}${"─".repeat(58)}${C.reset}\n`);
}

/** Tampilkan notifikasi temuan dengan bell terminal. */
function found(record) {
    process.stdout.write("\x07");
    const border = `${C.green}${"─".repeat(54)}${C.reset}`;
    process.stdout.write("\n" + border + "\n");
    process.stdout.write(`${C.bgGreen}${C.bold} !! WALLET DITEMUKAN !! ${C.reset}\n`);
    process.stdout.write(border + "\n");
    process.stdout.write(`  ${C.gray}Alamat :${C.reset} ${C.bold}${C.green}${record.address}${C.reset}\n`);
    process.stdout.write(`  ${C.gray}Chain  :${C.reset} ${C.white}${record.chain_name}${C.reset}\n`);
    process.stdout.write(`  ${C.gray}Koin   :${C.reset} ${C.white}${record.coin.toUpperCase()}${C.reset}\n`);
    process.stdout.write(`  ${C.gray}Saldo  :${C.reset} ${C.bold}${C.yellow}${record.balance}${C.reset}\n`);
    process.stdout.write(`  ${C.gray}Frasa  :${C.reset} ${C.white}"${record.pattern}"${C.reset} ${C.gray}(${record.strategy})${C.reset}\n`);
    process.stdout.write(`  ${C.gray}PrivKey:${C.reset} ${C.gray}${record.private_key_hex}${C.reset}\n`);
    process.stdout.write(border + "\n\n");
}

/** Log waktu pengecekan per koin (ringkasan akhir koin). */
function coinCheck(coin, count, elapsed) {
    process.stdout.write(
        `${C.gray}[${ts()}]${C.reset} ${C.magenta}[CHK]${C.reset} ` +
        `${C.bold}${C.white}${coin.padEnd(4)}${C.reset} ` +
        `${C.gray}│ alamat:${C.reset}${C.white}${count}${C.reset} ` +
        `${C.gray}│ waktu: ${C.reset}${C.cyan}${elapsed}s${C.reset}\n`
    );
}

/**
 * Log progres batch per koin — tampil setelah tiap batch selesai dikirim ke API.
 * @param {string} coin   - Nama koin (misalnya "BTC")
 * @param {number} done   - Batch yang sudah selesai
 * @param {number} total  - Total batch
 * @param {number} size   - Jumlah alamat dalam batch ini
 */
function coinBatch(coin, done, total, size) {
    const pct = total > 0 ? Math.round((done / total) * 100) : 100;
    const bar = buildBar(pct, 10);
    const label = size === 1 ? `${done}/${total} alamat` : `batch ${done}/${total} (${size} alamat)`;
    process.stdout.write(
        `${C.gray}[${ts()}]${C.reset} ${C.magenta}[CHK]${C.reset} ` +
        `${C.bold}${C.white}${coin.padEnd(4)}${C.reset} ` +
        `${C.gray}│${C.reset} ${bar} ${C.bold}${pct}%${C.reset} ` +
        `${C.gray}│${C.reset} ${C.white}${label}${C.reset}\n`
    );
}

/** Progress bar blok dengan kecepatan dan ETA. */
function progress(block, total, candidates, fresh, foundCount, elapsed, speed, eta) {
    const pct      = total > 0 ? Math.round((block / total) * 100) : 0;
    const bar      = buildBar(pct, 16);
    const speedStr = speed > 0 ? `${speed}/s` : "-";
    const etaStr   = eta || "-";

    process.stdout.write(
        `${C.gray}[${ts()}]${C.reset} ${C.blue}[BLK]${C.reset} ` +
        `${C.bold}${block}${C.reset}${C.gray}/${total}${C.reset} ` +
        `${bar} ${C.bold}${pct}%${C.reset} ` +
        `${C.gray}│ kandidat:${C.reset}${C.white}${candidates}${C.reset} ` +
        `${C.gray}│ cek:${C.reset}${C.white}${fresh}${C.reset} ` +
        `${C.gray}│ temuan:${C.reset}${foundCount > 0 ? C.green + C.bold : C.white}${foundCount}${C.reset} ` +
        `${C.gray}│${C.reset} ${C.cyan}${speedStr}${C.reset} ` +
        `${C.gray}│ ETA:${C.reset}${C.white}${etaStr}${C.reset} ` +
        `${C.gray}(${elapsed}d)${C.reset}\n`
    );
}

function buildBar(pct, width) {
    const filled = Math.round((pct / 100) * width);
    const empty  = width - filled;
    return `${C.green}${"█".repeat(filled)}${C.gray}${"░".repeat(empty)}${C.reset}`;
}

/** Ringkasan per koin di akhir audit. */
function coinSummary(coinStats) {
    if (!coinStats || coinStats.size === 0) return;
    const line = `${C.gray}${"─".repeat(40)}${C.reset}`;
    process.stdout.write(`\n${C.bold}${C.white}  Ringkasan per Koin${C.reset}\n`);
    process.stdout.write(line + "\n");
    process.stdout.write(
        `  ${C.gray}${"Koin".padEnd(6)}│ ${"Diperiksa".padStart(10)} │ ${"Temuan".padStart(7)}${C.reset}\n`
    );
    process.stdout.write(line + "\n");
    for (const [coin, stat] of coinStats.entries()) {
        const foundColor = stat.found > 0 ? C.green + C.bold : C.gray;
        process.stdout.write(
            `  ${C.white}${coin.toUpperCase().padEnd(6)}${C.reset}` +
            `${C.gray}│${C.reset} ` +
            `${C.white}${String(stat.checked).padStart(10)}${C.reset} ` +
            `${C.gray}│${C.reset} ` +
            `${foundColor}${String(stat.found).padStart(7)}${C.reset}\n`
        );
    }
    process.stdout.write(line + "\n");
}

/**
 * Dashboard RPC live — tampilkan status per chain di antara blok.
 * @param {Array} chainStatus  - keluaran rpcChainStatus()
 * @param {Map}   labelStats   - keluaran rpcStats.byLabel()
 */
function rpcPulse(chainStatus, labelStats) {
    if (!chainStatus || chainStatus.length === 0) return;

    // Hanya tampilkan chain yang sudah pernah dipakai (punya label EVM/<name>).
    const rows = chainStatus
        .map((c) => {
            const lbl = `EVM/${c.name}`;
            const tok = `TOK/${c.name}`;
            const e = labelStats.get(lbl);
            const t = labelStats.get(tok);
            return { c, e, t };
        })
        .filter(({ e, t }) => (e && (e.ok + e.fail + e.inflight) > 0) || (t && (t.ok + t.fail + t.inflight) > 0));

    if (rows.length === 0) return;

    const line = `${C.gray}${"─".repeat(72)}${C.reset}`;
    process.stdout.write(`\n${C.bold}${C.white}  ⚡ RPC Pulse${C.reset}  ${C.gray}(snapshot per chain)${C.reset}\n`);
    process.stdout.write(line + "\n");
    process.stdout.write(
        `  ${C.gray}${"Chain".padEnd(14)}│ ${"Endpoint (sehat/total)".padEnd(22)}│ ${"Aktif".padStart(5)} │ ${"OK".padStart(6)} │ ${"Gagal".padStart(5)}${C.reset}\n`
    );
    process.stdout.write(line + "\n");

    for (const { c, e, t } of rows) {
        const ok    = (e?.ok    || 0) + (t?.ok    || 0);
        const fail  = (e?.fail  || 0) + (t?.fail  || 0);
        const inflt = (e?.inflight || 0) + (t?.inflight || 0);

        const healthStr = `${c.healthyCount}/${c.totalUrls}`;
        const healthCol = c.healthyCount === 0 ? C.red
                       : c.cooldownCount > 0    ? C.yellow
                       : C.green;
        const cooldownNote = c.cooldownCount > 0
            ? ` ${C.gray}(${c.cooldownCount} cooldown, next ${Math.ceil(c.nextFreeInMs / 1000)}s)${C.reset}`
            : "";
        const failCol = fail > 0 ? (ok === 0 ? C.red : C.yellow) : C.gray;
        const inFltCol = inflt > 0 ? C.cyan + C.bold : C.gray;

        process.stdout.write(
            `  ${C.white}${c.name.padEnd(14)}${C.reset}` +
            `${C.gray}│${C.reset} ` +
            `${healthCol}${healthStr.padEnd(8)}${C.reset}${cooldownNote.padEnd(14)} ` +
            `${C.gray}│${C.reset} ` +
            `${inFltCol}${String(inflt).padStart(5)}${C.reset} ` +
            `${C.gray}│${C.reset} ` +
            `${C.green}${String(ok).padStart(6)}${C.reset} ` +
            `${C.gray}│${C.reset} ` +
            `${failCol}${String(fail).padStart(5)}${C.reset}\n`
        );
    }
    process.stdout.write(line + "\n");
}

/** Ringkasan kesehatan RPC di akhir audit. */
function rpcSummary(entries) {
    if (!entries || entries.length === 0) return;
    // Urutkan: label asc, lalu fail desc
    const rows = [...entries].sort((a, b) =>
        a.label.localeCompare(b.label) || b.fail - a.fail
    );
    const line = `${C.gray}${"─".repeat(72)}${C.reset}`;
    process.stdout.write(`\n${C.bold}${C.white}  Kesehatan RPC${C.reset}\n`);
    process.stdout.write(line + "\n");
    process.stdout.write(
        `  ${C.gray}${"Jaringan".padEnd(14)}│ ${"Endpoint".padEnd(40)}│ ${"OK".padStart(5)} │ ${"Gagal".padStart(5)}${C.reset}\n`
    );
    process.stdout.write(line + "\n");
    for (const e of rows) {
        const host = e.url.replace(/^https?:\/\//, "").slice(0, 40);
        const failColor = e.fail > 0 ? (e.ok === 0 ? C.red : C.yellow) : C.gray;
        process.stdout.write(
            `  ${C.white}${e.label.padEnd(14)}${C.reset}` +
            `${C.gray}│${C.reset} ` +
            `${C.white}${host.padEnd(40)}${C.reset}` +
            `${C.gray}│${C.reset} ` +
            `${C.green}${String(e.ok).padStart(5)}${C.reset} ` +
            `${C.gray}│${C.reset} ` +
            `${failColor}${String(e.fail).padStart(5)}${C.reset}\n`
        );
    }
    process.stdout.write(line + "\n");
}

function summary(stats, duration) {
    const line = `${C.cyan}${"═".repeat(58)}${C.reset}`;
    const fmt  = (n) => Number(n || 0).toLocaleString("id-ID");
    const row  = (label, value, color = C.white) =>
        process.stdout.write(`  ${C.gray}${label.padEnd(18)}:${C.reset} ${color}${value}${C.reset}\n`);

    process.stdout.write("\n" + line + "\n");
    process.stdout.write(`  ${C.bold}${C.white}✓ AUDIT SELESAI${C.reset}   ${C.gray}durasi: ${duration}${C.reset}\n`);
    process.stdout.write(line + "\n");
    row("Blok diproses",    fmt(stats.blocks));
    row("Total kandidat",   fmt(stats.candidates));
    row("Varian dilewati",  fmt(stats.skipped) + ` ${C.gray}(duplikat)${C.reset}`, C.yellow);
    row("Alamat diperiksa", fmt(stats.fresh));
    row("Kecepatan rata²",  `${fmt(stats.speed)} alamat/detik`, C.cyan);
    if (stats.found > 0) {
        process.stdout.write(`\n  ${C.bgGreen}${C.bold} ✦ TEMUAN: ${fmt(stats.found)} alamat berdana! ${C.reset}\n`);
    } else {
        row("Temuan", "0");
    }
    process.stdout.write(line + "\n\n");
}

module.exports = {
    setLevel,
    debug:       (...a) => log("debug",   ...a),
    info:        (...a) => log("info",    ...a),
    warn:        (...a) => log("warn",    ...a),
    error:       (...a) => log("error",   ...a),
    success:     (...a) => log("success", ...a),
    banner,
    section,
    found,
    coinCheck,
    coinBatch,
    progress,
    coinSummary,
    rpcSummary,
    rpcPulse,
    summary,
};
