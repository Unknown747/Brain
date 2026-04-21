const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, success: 25 };
const COLORS = {
    debug: "\x1b[90m",
    info: "\x1b[36m",
    warn: "\x1b[33m",
    error: "\x1b[31m",
    success: "\x1b[32m",
    reset: "\x1b[0m",
};

let current = LEVELS.info;

function setLevel(name) {
    const lvl = LEVELS[String(name || "").toLowerCase()];
    if (lvl) current = lvl;
}

function log(level, ...args) {
    if (LEVELS[level] < current) return;
    const ts = new Date().toISOString().replace("T", " ").replace("Z", "");
    const tag = level.toUpperCase().padEnd(7);
    const color = COLORS[level] || "";
    process.stdout.write(`${color}[${ts}] ${tag}${COLORS.reset} ${args.join(" ")}\n`);
}

module.exports = {
    setLevel,
    debug: (...a) => log("debug", ...a),
    info: (...a) => log("info", ...a),
    warn: (...a) => log("warn", ...a),
    error: (...a) => log("error", ...a),
    success: (...a) => log("success", ...a),
};
