/**
 * Cache kesehatan RPC antar-sesi.
 *
 * Menyimpan snapshot per (label, url) ke `.rpc_health.json`:
 *   { ok, fail, lastOk, lastFail }
 *
 * Saat audit baru dimulai:
 *  - cache di-load dan dipakai untuk meng-hidrasi rpcStats
 *  - daftar RPCS per chain di-reorder sehingga endpoint dengan skor
 *    historis terbaik dicoba duluan (lastGood otomatis menunjuk indeks 0)
 *
 * Skor sederhana: ok / (ok+fail), entry baru (<5 percobaan) diabaikan
 * (skor 0.5) supaya urutan default-nya tetap.
 */
const fs = require("fs");
const path = require("path");

const FILE = path.join(process.cwd(), ".rpc_health.json");

function load() {
    try {
        if (!fs.existsSync(FILE)) return [];
        const raw = JSON.parse(fs.readFileSync(FILE, "utf8"));
        if (!Array.isArray(raw)) return [];
        return raw.filter((e) => e && e.label && e.url);
    } catch { return []; }
}

function save(snapshot) {
    try {
        const slim = (snapshot || [])
            .filter((s) => (s.ok || 0) + (s.fail || 0) > 0)
            .map((s) => ({
                label:    s.label,
                url:      s.url,
                ok:       s.ok      || 0,
                fail:     s.fail    || 0,
                lastOk:   s.lastOk  || 0,
                lastFail: s.lastFail|| 0,
            }));
        fs.writeFileSync(FILE, JSON.stringify(slim));
    } catch {}
}

/** Skor 0..1 — makin tinggi makin baik. */
function score(entry) {
    const total = (entry.ok || 0) + (entry.fail || 0);
    if (total < 5) return 0.5;
    return (entry.ok || 0) / total;
}

module.exports = { load, save, score, FILE };
