/**
 * Scraper teks dari URL dengan cache anti-pengulangan.
 * Kata yang sudah pernah di-scrape (di words_cache.txt) tidak akan diambil lagi.
 */

const fs = require("fs");
const path = require("path");

const CACHE_FILE = path.join(process.cwd(), "words_cache.txt");

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
    const seen = new Set();
    const out = [];
    for (const w of text.split(/[^\p{L}\p{N}_'-]+/u)) {
        const t = w.trim();
        if (t.length < minLen || t.length > maxLen) continue;
        const lower = t.toLowerCase();
        if (seen.has(lower)) continue;
        seen.add(lower);
        out.push(t);
    }
    return out;
}

async function fetchWords(url) {
    const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 BrainwalletAuditor/1.0" },
        redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return tokenize(stripHtml(await res.text()));
}

function loadCache() {
    const set = new Set();
    if (fs.existsSync(CACHE_FILE)) {
        for (const line of fs.readFileSync(CACHE_FILE, "utf8").split("\n")) {
            const t = line.trim().toLowerCase();
            if (t) set.add(t);
        }
    }
    return set;
}

async function scrapeUrls(urls) {
    const cache = loadCache();
    const previousSize = cache.size;
    const fresh = [];
    let totalSeen = 0;

    for (const u of urls) {
        try {
            const words = await fetchWords(u);
            for (const w of words) {
                totalSeen++;
                const k = w.toLowerCase();
                if (cache.has(k)) continue;
                cache.add(k);
                fresh.push(w);
            }
        } catch (e) {
            console.warn(`[scraper] Gagal ${u}: ${e.message}`);
        }
    }

    if (fresh.length > 0) fs.appendFileSync(CACHE_FILE, fresh.map((w) => w.toLowerCase()).join("\n") + "\n");
    const skipped = totalSeen - fresh.length;
    if (skipped > 0) {
        console.log(`[scraper] ${fresh.length} kata baru, ${skipped} dilewati (cache awal: ${previousSize}).`);
    }
    return fresh;
}

module.exports = { scrapeUrls };
