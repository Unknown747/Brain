/**
 * Scraper teks dari URL.
 * - HTML dibersihkan dari nav/footer/sidebar/script/style + elemen sampah lain.
 * - Mengekstrak DUA jenis kandidat:
 *     1. words    → token tunggal yang sudah difilter stop-words & sampah.
 *     2. phrases  → kalimat utuh (3–8 kata) + n-gram 3/4/5 dari teks asli,
 *                   stop-words DIPERTAHANKAN karena banyak brainwallet
 *                   berisi frasa lengkap seperti "to be or not to be".
 * - Multi-bahasa stop-words (EN + ID + ES).
 * - Tidak ada cache yang ditulis ke disk.
 */

const logger = require("./logger");

// ---------------- Stop-words multi-bahasa ----------------
// Hanya dipakai untuk daftar `words` (bukan untuk frasa).
const STOP_WORDS = new Set([
    // English
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
    "used","both","some",
    // Indonesia
    "yang","dan","di","ke","dari","untuk","dengan","ini","itu","adalah",
    "atau","juga","tidak","akan","ada","pada","sebagai","oleh","karena",
    "bisa","dapat","saya","kamu","kami","kita","mereka","dia","sudah",
    "belum","masih","tapi","tetapi","jadi","sehingga","agar","supaya",
    "lebih","saja","hanya","seperti","jika","kalau","ketika","saat",
    "telah","akan","harus","perlu","bagi","tentang","setelah","sebelum",
    // Español
    "el","la","los","las","un","una","unos","unas","y","o","pero",
    "de","del","en","con","por","para","sin","sobre","entre","hacia",
    "que","como","cuando","donde","porque","si","no","es","son","fue",
    "ser","estar","esta","este","esto","ese","esa","eso","aquel","aquella",
    "yo","tu","el","ella","nosotros","vosotros","ellos","ellas",
    "muy","mas","menos","tambien","solo","ya","todo","todos","cada",
]);

// ---------------- Pembersihan HTML ----------------
const JUNK_CONTAINER = /(?:nav|menu|footer|sidebar|header|cookie|advert|banner|related|comment|share|social|breadcrumb|pagination|widget|modal|popup|toolbar|subscribe|newsletter)/i;

function stripHtml(html) {
    // 1) Buang tag block "berat" beserta isinya.
    html = html.replace(
        /<(script|style|noscript|iframe|svg|nav|footer|aside|header|form|button|select|template)\b[^>]*>[\s\S]*?<\/\1>/gi,
        " "
    );

    // 2) Best-effort: buang container yang class/id-nya mengandung kata sampah.
    html = html.replace(
        /<(div|section|article|ul|aside|span)\b[^>]*\b(?:class|id)\s*=\s*["'][^"']*?(nav|menu|footer|sidebar|cookie|advert|banner|related|comment|share|social|breadcrumb|pagination|widget|modal|popup|toolbar|subscribe|newsletter)[^"']*?["'][^>]*>[\s\S]*?<\/\1>/gi,
        " "
    );

    // 3) Komentar HTML.
    html = html.replace(/<!--[\s\S]*?-->/g, " ");

    // 4) Konversi penutup blok ke newline → membantu pemecah kalimat nanti.
    html = html.replace(/<\/(p|div|li|h[1-6]|tr|td|br|article|section|blockquote)\s*\/?>/gi, "\n");

    // 5) Strip semua tag tersisa.
    html = html.replace(/<[^>]+>/g, " ");

    // 6) Decode entitas umum.
    html = html
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&[a-z0-9#]+;/gi, " ");

    return html;
}

// ---------------- Normalisasi Unicode ----------------
function normalize(text) {
    return text
        // Smart quotes & dash → ASCII.
        .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")
        .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
        .replace(/[\u2013\u2014\u2015]/g, "-")
        .replace(/[\u2026]/g, "...")
        // Hapus karakter zero-width.
        .replace(/[\u200B-\u200F\uFEFF]/g, "")
        // Strip diakritik (NFKD lalu buang combining marks).
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "");
}

// ---------------- Filter token sampah ----------------
function isGoodToken(t) {
    if (t.length < 3 || t.length > 30) return false;
    // Lebih dari separuh angka → kemungkinan kode/ID.
    let digits = 0;
    for (const c of t) if (c >= "0" && c <= "9") digits++;
    if (digits / t.length > 0.5) return false;
    // ALL-CAPS panjang → kemungkinan menu/tombol.
    if (t.length > 6 && /^[A-Z]+$/.test(t)) return false;
    // Fragmen URL/protokol.
    if (/^(https?|www|com|org|net|html|php|asp|jsp)$/i.test(t)) return false;
    // Ada @ atau // → email/URL.
    if (/[@\/]/.test(t)) return false;
    return true;
}

// ---------------- Tokenisasi ----------------
function tokenizeWord(s) {
    // Split pada apa pun yang bukan huruf/angka/apostrof/hyphen.
    return s.split(/[^\p{L}\p{N}'-]+/u).map((w) => w.trim()).filter(Boolean);
}

function splitSentences(text) {
    return text
        .split(/[.!?…\n\r]+/)
        .map((s) => s.replace(/\s+/g, " ").trim())
        .filter(Boolean);
}

// ---------------- Ekstraksi ----------------
const PHRASE_MAX_CHARS = 80;
const PHRASE_MIN_WORDS = 4;
const PHRASE_MAX_WORDS = 10;
const NGRAM_PER_SENTENCE = 3;          // batas sliding window per ukuran per kalimat
const NAV_BLACKLIST = /^(jump to|go to|skip to|click here|read more|sign in|sign up|log in|log out|see also|external links|references|home|contact|about us|search|menu|navigation|categories|share this|print this|toggle)/i;

function cleanToken(w) {
    // Buang tanda hubung di tepi & token yang cuma simbol.
    return w.replace(/^[-']+|[-']+$/g, "");
}

function isContentToken(w) {
    if (w.length === 0) return false;
    return /\p{L}/u.test(w);  // harus mengandung minimal 1 huruf
}

function pushNgrams(raw, n, pushPhrase) {
    if (raw.length < n) return;
    const total = raw.length - n + 1;
    // Ambil window awal, tengah, akhir (atau sampai NGRAM_PER_SENTENCE buah).
    const indices = total <= NGRAM_PER_SENTENCE
        ? Array.from({ length: total }, (_, i) => i)
        : [0, Math.floor((total - 1) / 2), total - 1];
    for (const i of indices) pushPhrase(raw.slice(i, i + n).join(" "));
}

function extractFromText(text) {
    const sentences = splitSentences(text);
    const seenWord   = new Set();
    const seenPhrase = new Set();
    const words      = [];
    const phrases    = [];

    const pushPhrase = (raw) => {
        const p = raw.replace(/\s+/g, " ").trim();
        if (!p || p.length > PHRASE_MAX_CHARS) return;
        const lower = p.toLowerCase();
        // Buang frasa yang mayoritas stop-words atau cuma punya 1 kata isi.
        const toks    = lower.split(" ");
        const content = toks.filter((t) => !STOP_WORDS.has(t));
        if (content.length < 2 || content.length / toks.length < 0.3) return;
        if (seenPhrase.has(lower)) return;
        seenPhrase.add(lower);
        phrases.push(p);
    };

    const collectWords = (raw) => {
        for (const w of raw) {
            if (!isGoodToken(w)) continue;
            const lower = w.toLowerCase();
            if (STOP_WORDS.has(lower) || seenWord.has(lower)) continue;
            seenWord.add(lower);
            words.push(w);
        }
    };

    for (const sentence of sentences) {
        // Token mentah (stop-words DIPERTAHANKAN, simbol-tepi dibersihkan).
        const raw = tokenizeWord(sentence)
            .map(cleanToken)
            .filter((w) => isContentToken(w) && w.length <= 25);
        if (raw.length === 0) continue;

        // Skip frasa kalau awal kalimat terdeteksi pola navigasi.
        // Kata tunggalnya tetap diambil — siapa tahu masih berguna.
        const isNav = NAV_BLACKLIST.test(raw.slice(0, 4).join(" ").toLowerCase());
        if (!isNav) {
            // (a) Kalimat utuh 4–10 kata.
            if (raw.length >= PHRASE_MIN_WORDS && raw.length <= PHRASE_MAX_WORDS) {
                pushPhrase(raw.join(" "));
            }
            // (b) N-gram 4 & 5 — sample window, bukan semua sliding.
            if (raw.length >= 6) {
                pushNgrams(raw, 4, pushPhrase);
                pushNgrams(raw, 5, pushPhrase);
            }
        }
        collectWords(raw);
    }
    return { words, phrases };
}

// ---------------- Fetch ----------------
async function fetchHtml(url, timeoutMs = 20000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 BrainwalletAuditor/1.0",
                "accept": "text/html,application/xhtml+xml",
                "accept-language": "en;q=0.9,id;q=0.8",
            },
            redirect: "follow",
            signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.text();
    } finally {
        clearTimeout(t);
    }
}

/**
 * Scrape satu atau lebih URL.
 * @param {string[]} urls
 * @param {{words:Set<string>, phrases:Set<string>}} [cache] — kalau diberikan,
 *   token yang sudah ada di cache di-skip, dan token baru dimasukkan ke cache.
 * @returns {string[]} frasa-baru-dulu, lalu kata-baru. Hanya item yang BELUM
 *   pernah dilihat (per sesi atau dari cache persisten).
 */
async function scrapeUrls(urls, cache) {
    const seenWord   = new Set(cache?.words   || []);
    const seenPhrase = new Set(cache?.phrases || []);
    const allWords   = [];
    const allPhrases = [];
    let   skipWord   = 0;
    let   skipPhrase = 0;

    for (const u of urls) {
        try {
            const html = await fetchHtml(u);
            const text = normalize(stripHtml(html));
            const { words, phrases } = extractFromText(text);

            let wAdded = 0, wSkip = 0;
            for (const w of words) {
                const k = w.toLowerCase();
                if (seenWord.has(k)) { wSkip++; continue; }
                seenWord.add(k);
                if (cache) cache.words.add(k);
                allWords.push(w);
                wAdded++;
            }
            let pAdded = 0, pSkip = 0;
            for (const p of phrases) {
                const k = p.toLowerCase();
                if (seenPhrase.has(k)) { pSkip++; continue; }
                seenPhrase.add(k);
                if (cache) cache.phrases.add(k);
                allPhrases.push(p);
                pAdded++;
            }
            skipWord   += wSkip;
            skipPhrase += pSkip;
            logger.info(`${u} → ${wAdded} kata, ${pAdded} frasa baru (skip ${wSkip}+${pSkip} dari cache)`);
        } catch (e) {
            logger.warn(`Gagal scrape ${u}: ${e.message}`);
        }
    }

    if (cache && (skipWord || skipPhrase)) {
        logger.info(`Total dari cache (di-skip): ${skipWord} kata + ${skipPhrase} frasa`);
    }

    // Frasa duluan (dampak tertinggi), lalu kata tunggal.
    return [...allPhrases, ...allWords];
}

module.exports = { scrapeUrls };
