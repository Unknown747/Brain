/**
 * Scraper teks dari URL.
 * - Stop-words dibuang sebelum diproses.
 * - Deduplication dilakukan in-memory (tidak ada file cache yang ditulis ke disk).
 * - Setiap sesi dimulai dari awal.
 */

const logger = require("./logger");

// Kata-kata umum bahasa Inggris yang hampir tidak mungkin dipakai sebagai brainwallet
const STOP_WORDS = new Set([
    "the","a","an","and","or","but","if","so","yet","nor","as",
    "in","on","at","to","for","of","with","by","from","into",
    "through","about","between","after","before","during","without","within",
    "i","me","my","myself","we","us","our","you","your","he","him","his",
    "she","her","it","its","they","them","their","this","that","these","those",
    "who","which","what","whom","whose","how","when","where","why",
    "is","are","was","were","be","been","being","have","has","had",
    "do","does","did","will","would","could","should","may","might","can",
    "not","no","all","any","each","few","more","most","other","such",
    "than","then","also","just","even","very","too","up","out","over",
    "here","there","now","only","same","one","two","new","old","own",
    "get","got","let","put","see","say","said","make","made","know",
    "used","both","some","been","from","were",
]);

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
    const out  = [];
    for (const w of text.split(/[^\p{L}\p{N}_'-]+/u)) {
        const t = w.trim();
        if (t.length < minLen || t.length > maxLen) continue;
        const lower = t.toLowerCase();
        if (seen.has(lower)) continue;
        if (STOP_WORDS.has(lower)) continue;
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

/**
 * Scrape satu atau lebih URL. Mengembalikan daftar kata unik yang baru.
 * Tidak ada data yang ditulis ke disk.
 */
async function scrapeUrls(urls) {
    const seen  = new Set();
    const fresh = [];

    for (const u of urls) {
        try {
            const words = await fetchWords(u);
            let added = 0;
            for (const w of words) {
                const k = w.toLowerCase();
                if (seen.has(k)) continue;
                seen.add(k);
                fresh.push(w);
                added++;
            }
            logger.info(`${u} → ${added} kata baru`);
        } catch (e) {
            logger.warn(`Gagal scrape ${u}: ${e.message}`);
        }
    }

    return fresh;
}

module.exports = { scrapeUrls };
