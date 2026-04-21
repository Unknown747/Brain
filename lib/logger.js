const C = {
    reset:   "\x1b[0m",
    bold:    "\x1b[1m",
    dim:     "\x1b[2m",
    cyan:    "\x1b[36m",
    green:   "\x1b[32m",
    yellow:  "\x1b[33m",
    red:     "\x1b[31m",
    magenta: "\x1b[35m",
    blue:    "\x1b[34m",
    white:   "\x1b[97m",
    gray:    "\x1b[90m",
    bgGreen: "\x1b[42m",
    bgRed:   "\x1b[41m",
};

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, success: 25 };
let current = LEVELS.info;

function setLevel(name) {
    const lvl = LEVELS[String(name || "").toLowerCase()];
    if (lvl) current = lvl;
}

function ts() {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
}

function log(level, ...args) {
    if (LEVELS[level] < current) return;
    const msg = args.join(" ");
    const time = `${C.gray}${ts()}${C.reset}`;

    let badge = "";
    let text = "";

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
    const line = `${C.cyan}${"═".repeat(54)}${C.reset}`;
    process.stdout.write("\n" + line + "\n");
    process.stdout.write(`${C.bold}${C.cyan}   BRAINWALLET AUDITOR${C.reset}   ${C.gray}security research tool${C.reset}\n`);
    process.stdout.write(line + "\n\n");
}

function section(title) {
    process.stdout.write(`\n${C.bold}${C.blue}▶ ${title}${C.reset}\n`);
    process.stdout.write(`${C.gray}${"─".repeat(54)}${C.reset}\n`);
}

function found(record) {
    const line = `${C.bgGreen}${C.bold} FOUND ${C.reset}`;
    process.stdout.write(`\n${line} ${C.bold}${C.green}${record.address}${C.reset}\n`);
    process.stdout.write(`  ${C.gray}Chain  :${C.reset} ${C.white}${record.chain_name}${C.reset}\n`);
    process.stdout.write(`  ${C.gray}Coin   :${C.reset} ${C.white}${record.coin.toUpperCase()}${C.reset}\n`);
    process.stdout.write(`  ${C.gray}Balance:${C.reset} ${C.bold}${C.yellow}${record.balance}${C.reset}\n`);
    process.stdout.write(`  ${C.gray}Phrase :${C.reset} ${C.white}"${record.pattern}"${C.reset} ${C.gray}(${record.strategy})${C.reset}\n`);
    process.stdout.write(`  ${C.gray}PrivKey:${C.reset} ${C.gray}${record.private_key_hex}${C.reset}\n\n`);
}

function progress(block, total, candidates, fresh, foundCount, elapsed) {
    const pct = total > 0 ? Math.round((block / total) * 100) : 0;
    const bar = buildBar(pct, 20);
    process.stdout.write(
        `${C.gray}[${ts()}]${C.reset} ${C.blue}Blok${C.reset} ` +
        `${C.bold}${block}${C.reset}${C.gray}/${total}${C.reset} ` +
        `${bar} ${C.bold}${pct}%${C.reset} ` +
        `${C.gray}│ kandidat:${C.reset}${C.white}${candidates}${C.reset} ` +
        `${C.gray}│ diperiksa:${C.reset}${C.white}${fresh}${C.reset} ` +
        `${C.gray}│ temuan:${C.reset}${foundCount > 0 ? C.green + C.bold : C.white}${foundCount}${C.reset} ` +
        `${C.gray}│ ${elapsed}d${C.reset}\n`
    );
}

function coinCheck(coin, count, elapsed) {
    process.stdout.write(
        `${C.gray}[${ts()}]${C.reset} ${C.magenta}[CHK]${C.reset} ` +
        `${C.bold}${C.white}${coin.padEnd(4)}${C.reset} ` +
        `${C.gray}│ alamat:${C.reset}${C.white}${count}${C.reset} ` +
        `${C.gray}│ waktu: ${C.reset}${C.cyan}${elapsed}s${C.reset}\n`
    );
}

function buildBar(pct, width) {
    const filled = Math.round((pct / 100) * width);
    const empty  = width - filled;
    return `${C.green}${"█".repeat(filled)}${C.gray}${"░".repeat(empty)}${C.reset}`;
}

function summary(stats, duration) {
    const line = `${C.cyan}${"═".repeat(54)}${C.reset}`;
    process.stdout.write("\n" + line + "\n");
    process.stdout.write(`${C.bold}${C.white}  AUDIT SELESAI${C.reset}   ${C.gray}${duration}${C.reset}\n`);
    process.stdout.write(line + "\n");
    process.stdout.write(`  ${C.gray}Blok diproses :${C.reset} ${C.white}${stats.blocks}${C.reset}\n`);
    process.stdout.write(`  ${C.gray}Total kandidat:${C.reset} ${C.white}${stats.candidates}${C.reset}\n`);
    process.stdout.write(`  ${C.gray}Alamat diperiksa:${C.reset} ${C.white}${stats.fresh}${C.reset}\n`);
    if (stats.found > 0) {
        process.stdout.write(`  ${C.bgGreen}${C.bold} TEMUAN: ${stats.found} alamat berdana! ${C.reset}\n`);
    } else {
        process.stdout.write(`  ${C.gray}Temuan        :${C.reset} ${C.white}0${C.reset}\n`);
    }
    process.stdout.write(line + "\n\n");
}

module.exports = {
    setLevel,
    debug:     (...a) => log("debug",   ...a),
    info:      (...a) => log("info",    ...a),
    warn:      (...a) => log("warn",    ...a),
    error:     (...a) => log("error",   ...a),
    success:   (...a) => log("success", ...a),
    banner,
    section,
    found,
    coinCheck,
    progress,
    summary,
};
