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

// Aturan prune otomatis (aman — endpoint tidak hilang dari kode, hanya raport-nya):
//  - sudah pernah dipakai >= MIN_ATTEMPTS kali
//  - tidak pernah sukses dalam STALE_OK_MS terakhir
//  - rasio gagal lebih dari MAX_FAIL_RATIO
const MIN_ATTEMPTS    = 5;
const STALE_OK_MS     = 7 * 24 * 60 * 60 * 1000; // 7 hari
const MAX_FAIL_RATIO  = 0.9;

function shouldPrune(entry, now) {
    const total = (entry.ok || 0) + (entry.fail || 0);
    if (total < MIN_ATTEMPTS) return false;
    const ratio = (entry.fail || 0) / total;
    if (ratio < MAX_FAIL_RATIO) return false;
    const lastOk = entry.lastOk || 0;
    if (now - lastOk < STALE_OK_MS) return false;
    return true;
}

function prune(entries, now = Date.now()) {
    const kept    = [];
    const pruned  = [];
    for (const e of entries) {
        if (shouldPrune(e, now)) pruned.push(e);
        else                     kept.push(e);
    }
    return { kept, pruned };
}

function load() {
    try {
        if (!fs.existsSync(FILE)) return [];
        const raw = JSON.parse(fs.readFileSync(FILE, "utf8"));
        if (!Array.isArray(raw)) return [];
        const valid = raw.filter((e) => e && e.label && e.url);
        const { kept } = prune(valid);
        return kept;
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

module.exports = { load, save, score, prune, shouldPrune, FILE };
