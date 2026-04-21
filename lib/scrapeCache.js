/**
 * Cache persisten kata & frasa yang sudah pernah di-scrape.
 *
 * Tujuan: menghindari memproses ulang token yang sama antar sesi.
 * Setiap sesi memuat cache, scraping menambahkan token baru saja,
 * lalu cache disimpan kembali di akhir sesi.
 *
 * File: .scrape_cache.json (di root project, gitignored).
 * Untuk reset: hapus file-nya secara manual.
 */

const fs   = require("fs");
const path = require("path");

const CACHE_FILE = path.join(process.cwd(), ".scrape_cache.json");

function load() {
    try {
        const data = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
        return {
            words:   new Set(data.words   || []),
            phrases: new Set(data.phrases || []),
        };
    } catch {
        return { words: new Set(), phrases: new Set() };
    }
}

function save(cache) {
    try {
        fs.writeFileSync(CACHE_FILE, JSON.stringify({
            words:   [...cache.words],
            phrases: [...cache.phrases],
        }));
    } catch {}
}

module.exports = { load, save, CACHE_FILE };
