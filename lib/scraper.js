/**
 * Scraper teks dari URL: ambil HTML, bersihkan tag, hasilkan daftar kata unik.
 */

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

async function scrapeUrls(urls, opts = {}) {
    const all = new Set();
    for (const u of urls) {
        try {
            const { words } = await scrapeUrl(u, opts);
            for (const w of words) all.add(w);
        } catch (e) {
            console.warn(`[scraper] Gagal ${u}: ${e.message}`);
        }
    }
    return Array.from(all);
}

module.exports = { scrapeUrl, scrapeUrls, stripHtml, tokenize };
