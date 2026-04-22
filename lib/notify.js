/**
 * Notifikasi temuan ke Telegram bot dan/atau Discord webhook.
 *
 * Hanya mengirim alamat + chain + saldo + frasa + strategi.
 * TIDAK PERNAH mengirim private key (ini sengaja — biar aman kalau channel bocor).
 *
 * Konfigurasi (di config.json):
 *   "notify": {
 *     "telegram": { "botToken": "...", "chatId": "..." },
 *     "discord":  { "webhookUrl": "https://discord.com/api/webhooks/..." },
 *     "notifyStart":  true,    // kirim notif saat sesi mulai
 *     "notifyFinish": true,    // kirim notif saat sesi selesai
 *     "includePrivKey": false  // default false — JANGAN diubah kecuali kamu paham risikonya
 *   }
 */

let cfg = {
    telegram: null,
    discord:  null,
    notifyStart:    true,
    notifyFinish:   true,
    includePrivKey: false,
};
let enabled = false;

function configure(opts = {}) {
    cfg = {
        telegram:       null,
        discord:        null,
        notifyStart:    opts.notifyStart  !== false,
        notifyFinish:   opts.notifyFinish !== false,
        includePrivKey: opts.includePrivKey === true,
    };
    if (opts.telegram?.botToken && opts.telegram?.chatId) {
        cfg.telegram = { botToken: String(opts.telegram.botToken), chatId: String(opts.telegram.chatId) };
    }
    if (opts.discord?.webhookUrl) {
        cfg.discord = { webhookUrl: String(opts.discord.webhookUrl) };
    }
    enabled = !!(cfg.telegram || cfg.discord);
    return enabled;
}

function isEnabled() { return enabled; }

async function postJson(url, body, timeoutMs = 10_000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
            signal: ctrl.signal,
        });
        // Sengaja diam saja kalau gagal — notifikasi tidak boleh menggagalkan audit.
        return res.ok;
    } catch { return false; }
    finally { clearTimeout(t); }
}

async function sendTelegram(textMd) {
    if (!cfg.telegram) return;
    const url = `https://api.telegram.org/bot${cfg.telegram.botToken}/sendMessage`;
    await postJson(url, { chat_id: cfg.telegram.chatId, text: textMd, parse_mode: "Markdown", disable_web_page_preview: true });
}

async function sendDiscord(textPlain) {
    if (!cfg.discord) return;
    // Discord max 2000 chars per message
    const truncated = textPlain.length > 1900 ? textPlain.slice(0, 1900) + "..." : textPlain;
    await postJson(cfg.discord.webhookUrl, { content: truncated });
}

function escapeMd(s) {
    return String(s ?? "").replace(/([_*`\[\]()~>#+\-=|{}.!\\])/g, "\\$1");
}

async function notifyFinding(record) {
    if (!enabled) return;
    const lines = [
        "*🔔 Brainwallet Auditor — TEMUAN BARU*",
        `Koin    : \`${escapeMd(record.coin?.toUpperCase())}\``,
        `Chain   : \`${escapeMd(record.chain_name)}\``,
        `Alamat  : \`${escapeMd(record.address)}\``,
        `Saldo   : \`${escapeMd(record.balance)}\``,
        `Frasa   : "${escapeMd(record.pattern)}"`,
        `Strategi: \`${escapeMd(record.strategy)}\``,
    ];
    if (cfg.includePrivKey) lines.push(`PrivKey : \`${escapeMd(record.private_key_hex)}\``);
    if (record.is_contract) lines.push("⚠️ _Alamat ini adalah smart contract, bukan EOA_");
    if (record.token_symbol) lines.push(`Token   : \`${escapeMd(record.token_symbol)}\``);

    const md    = lines.join("\n");
    const plain = lines.join("\n").replace(/[*`\\]/g, "");
    await Promise.all([sendTelegram(md), sendDiscord(plain)]);
}

async function notifyStart(meta) {
    if (!enabled || !cfg.notifyStart) return;
    const md = [
        "*▶️ Brainwallet Auditor — sesi dimulai*",
        `Intensitas: \`${escapeMd(meta.intensity)}\``,
        `Koin      : \`${escapeMd((meta.coins || []).join(", "))}\``,
        `EVM Chain : \`${escapeMd((meta.chains || []).join(", "))}\``,
        `URL       : ${escapeMd((meta.urls || []).join(", "))}`,
    ].join("\n");
    const plain = md.replace(/[*`\\]/g, "");
    await Promise.all([sendTelegram(md), sendDiscord(plain)]);
}

async function notifyFinish(stats, durationStr) {
    if (!enabled || !cfg.notifyFinish) return;
    const md = [
        "*✅ Brainwallet Auditor — sesi selesai*",
        `Durasi      : ${escapeMd(durationStr)}`,
        `Diperiksa   : \`${stats.fresh ?? 0}\``,
        `Temuan      : \`${stats.found ?? 0}\``,
        `Total kand. : \`${stats.candidates ?? 0}\``,
    ].join("\n");
    const plain = md.replace(/[*`\\]/g, "");
    await Promise.all([sendTelegram(md), sendDiscord(plain)]);
}

module.exports = { configure, isEnabled, notifyFinding, notifyStart, notifyFinish };
