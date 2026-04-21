/**
 * Scraper teks dari URL: ambil HTML, bersihkan tag, hasilkan daftar kata unik.
 * Mendukung cache anti-pengulangan: kata yang sudah pernah di-scrape
 * (disimpan di words_cache.txt) tidak akan dihasilkan lagi.
 */
const fs = require("fs");
const path = require("path");

function stripHtml(html) {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&[a-z0-9#]+;/gi, " ");
}

function tokenize(text, { minLen = 3, maxLen = 40 } = {}) {
    const words = text.split(/[^\p{L}\p{N}_'-]+/u);
    const seen = new Set();
    const out = [];
    for (const w of words) {
        const t = w.trim();
        if (t.length < minLen || t.length > maxLen) continue;
        const lower = t.toLowerCase();
        if (seen.has(lower)) continue;
        seen.add(lower);
        out.push(t);
    }
    return out;
}

async function scrapeUrl(url, opts = {}) {
    const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 BrainwalletAuditor/1.0" },
        redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} dari ${url}`);
    const html = await res.text();
    const text = stripHtml(html);
    return { text, words: tokenize(text, opts) };
}

class WordCache {
    constructor(file) {
        this.file = file;
        this.set = new Set();
        if (file && fs.existsSync(file)) {
            for (const line of fs.readFileSync(file, "utf8").split("\n")) {
                const t = line.trim().toLowerCase();
                if (t) this.set.add(t);
            }
        }
    }
    has(word) { return this.set.has(String(word).toLowerCase()); }
    add(word) {
        const k = String(word).toLowerCase();
        if (this.set.has(k)) return false;
        this.set.add(k);
        if (this.file) fs.appendFileSync(this.file, k + "\n");
        return true;
    }
    size() { return this.set.size; }
}

async function scrapeUrls(urls, opts = {}) {
    const cacheFile = opts.cacheFile === undefined
        ? path.join(process.cwd(), "words_cache.txt")
        : opts.cacheFile;
    const cache = new WordCache(cacheFile);
    const previousSize = cache.size();

    const fresh = [];
    let totalSeen = 0;
    for (const u of urls) {
        try {
            const { words } = await scrapeUrl(u, opts);
            for (const w of words) {
                totalSeen++;
                if (cache.add(w)) fresh.push(w);
            }
        } catch (e) {
            console.warn(`[scraper] Gagal ${u}: ${e.message}`);
        }
    }

    const skipped = totalSeen - fresh.length;
    if (skipped > 0) {
        console.log(`[scraper] ${fresh.length} kata baru, ${skipped} kata dilewati (sudah ada di cache: ${previousSize}).`);
    }
    return fresh;
}

module.exports = { scrapeUrl, scrapeUrls, stripHtml, tokenize, WordCache };
