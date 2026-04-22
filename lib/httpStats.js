/**
 * Pelacak retry HTTP per host & alasan.
 * Diisi otomatis oleh `httpRequest()` di lib/util.js setiap kali sebuah
 * percobaan transient gagal dan harus di-retry.
 *
 * Tujuan: di akhir sesi user bisa lihat endpoint mana yang paling sering
 * bermasalah (rate-limit, server error, network) supaya bisa dipertimbangkan
 * untuk diganti/dihapus.
 */

const stats = new Map(); // host → { retries, by429, by5xx, byNet }

function _hostOf(url) {
    try { return new URL(url).host; } catch { return String(url).slice(0, 60); }
}

function _bucket(err) {
    const s = err && typeof err.status === "number" ? err.status : 0;
    if (s === 429) return "by429";
    if (s >= 500)  return "by5xx";
    return "byNet";
}

function recordRetry(url, err) {
    const host = _hostOf(url);
    let row = stats.get(host);
    if (!row) {
        row = { host, retries: 0, by429: 0, by5xx: 0, byNet: 0 };
        stats.set(host, row);
    }
    row.retries++;
    row[_bucket(err)]++;
}

function snapshot() { return Array.from(stats.values()); }

module.exports = { recordRetry, snapshot };
