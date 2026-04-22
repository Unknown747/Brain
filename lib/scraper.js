/**
 * Scraper teks dari URL.
 *
 * Mengekstrak EMPAT jenis output (urutan = urutan prioritas audit):
 *   1. priority → judul halaman, heading h1-h3, isi blockquote, dan teks
 *                 di dalam tanda kutip ("..." / '...'). Sumber-sumber ini
 *                 paling sering jadi brainwallet dan diaudit duluan.
 *   2. phrases  → kalimat utuh (4–10 kata) + n-gram 3/4/5 dari teks asli.
 *                 Stop-words DIPERTAHANKAN karena banyak brainwallet berisi
 *                 frasa lengkap seperti "to be or not to be".
 *   3. words    → token tunggal yang sudah difilter stop-words & sampah.
 *   4. years    → tahun 4-digit (1900–2030) yang ditemukan di halaman,
 *                 dipakai untuk kombinasi `phrase × year` di candidates.
 *
 * - HTML dibersihkan dari nav/footer/sidebar/script/style + elemen sampah lain.
 * - Multi-bahasa stop-words: EN, ID, ES, JP, KR, ZH, AR, RU.
 * - Tidak ada cache yang ditulis ke disk dari modul ini (lihat scrapeCache.js).
 */

const logger = require("./logger");
const { httpRequest, runWithConcurrency } = require("./util");

// Batas keras untuk mencegah regex catastrophic backtracking di halaman besar.
// 8 MB cukup untuk semua wiki/Gutenberg yang dipakai preset.
const MAX_HTML_BYTES = 8 * 1024 * 1024;
// Banyak URL yang di-fetch paralel. 5 cukup ramah ke server publik.
const FETCH_CONCURRENCY = 5;

// ───────── Stop-words multi-bahasa ─────────
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
    "telah","harus","perlu","bagi","tentang","setelah","sebelum",
    // Español
    "el","la","los","las","un","una","unos","unas","y","o","pero",
    "de","del","en","con","por","para","sin","sobre","entre","hacia",
    "que","como","cuando","donde","porque","si","es","son","fue",
    "ser","estar","esta","este","esto","ese","esa","eso","aquel","aquella",
    "yo","tu","ella","nosotros","vosotros","ellos","ellas",
    "muy","mas","menos","tambien","solo","ya","todo","todos","cada",
    // Русский (Russian)
    "и","в","во","не","что","он","на","я","с","со","как","а","то","все",
    "она","так","его","но","да","ты","к","у","же","вы","за","бы","по",
    "только","ее","мне","было","вот","от","меня","еще","нет","о","из",
    "ему","теперь","когда","даже","ну","вдруг","ли","если","уже","или",
    "ни","быть","был","него","до","вас","нибудь","опять","уж","вам",
    // العربية (Arabic)
    "في","من","على","إلى","عن","مع","هذا","هذه","ذلك","التي","الذي","ما",
    "لا","لم","لن","قد","كان","كانت","يكون","هو","هي","هم","نحن","أنت",
    "أن","إن","أو","ثم","حتى","كل","بعض","كما","حيث","عند","بين","تحت",
    // 日本語 (Japanese)
    "の","に","は","を","が","と","で","から","まで","へ","や","も","か",
    "な","ね","よ","だ","です","ます","する","した","ある","いる","この",
    "その","あの","これ","それ","あれ","ここ","そこ","あそこ","だが","しかし",
    // 한국어 (Korean)
    "이","가","을","를","은","는","에","에서","로","으로","와","과","도",
    "만","의","하다","있다","없다","것","수","때","그","저","이것","그것",
    "저것","여기","거기","저기","그리고","그러나","하지만","또한","그래서",
    // 中文 (Chinese)
    "的","了","是","在","我","有","和","就","不","都","也","他","这","那",
    "你","个","以","上","下","会","可","对","到","得","与","或","但","为",
    "之","中","从","向","被","所","人","年","月","日","时","分","秒",
]);

// ───────── Pembersihan HTML ─────────
function stripHtml(html) {
    html = html.replace(
        /<(script|style|noscript|iframe|svg|nav|footer|aside|header|form|button|select|template)\b[^>]*>[\s\S]*?<\/\1>/gi,
        " "
    );
    html = html.replace(
        /<(div|section|article|ul|aside|span)\b[^>]*\b(?:class|id)\s*=\s*["'][^"']*?(nav|menu|footer|sidebar|cookie|advert|banner|related|comment|share|social|breadcrumb|pagination|widget|modal|popup|toolbar|subscribe|newsletter)[^"']*?["'][^>]*>[\s\S]*?<\/\1>/gi,
        " "
    );
    html = html.replace(/<!--[\s\S]*?-->/g, " ");
    html = html.replace(/<\/(p|div|li|h[1-6]|tr|td|br|article|section|blockquote)\s*\/?>/gi, "\n");
    html = html.replace(/<[^>]+>/g, " ");
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

// ───────── Normalisasi Unicode ─────────
function normalize(text) {
    return text
        .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")
        .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
        .replace(/[\u2013\u2014\u2015]/g, "-")
        .replace(/[\u2026]/g, "...")
        .replace(/[\u200B-\u200F\uFEFF]/g, "")
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "");
}

// ───────── Ekstraksi tahun ─────────
// Regex dibuat lokal per panggilan agar `lastIndex` tidak ber-state lintas
// pemanggilan (bug halus saat regex /g dipakai modul-level).
const YEAR_PATTERN = "\\b(1[89]\\d{2}|20[0-2]\\d|2030)\\b";

/** Tarik tahun 1900–2030 dari teks. Returns deduped array urut frekuensi-desc. */
function extractYears(text) {
    const re = new RegExp(YEAR_PATTERN, "g");
    const counts = new Map();
    let m;
    while ((m = re.exec(text)) !== null) {
        const y = m[1];
        counts.set(y, (counts.get(y) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([y]) => y);
}

// ───────── Pembersihan khusus Wikipedia / Wikiquote ─────────
function cleanWikiText(text) {
    return text
        .replace(/\[(?:\d{1,3}|[a-z]|edit|citation needed|note \d+|verification needed|when\?|who\?|clarification needed|update|dead link|sic|page needed)\]/gi, " ")
        .replace(/From Wikipedia,\s*the free encyclopedia/gi, " ")
        .replace(/Jump to (?:navigation|search|content)/gi, " ")
        .replace(/\b(?:Retrieved from|Categories?:|Hidden categor(?:y|ies):|Namespaces?:|Views?:|Personal tools|Variants|Languages?|Page tools|Toggle the table of contents|Main page|Contents|Current events|Random article|About Wikipedia|Contact us|Donate|What links here|Related changes|Upload file|Special pages|Permanent link|Page information|Cite this page|Get shortened URL|Download QR code|Wikidata item)\b[^\n]*/gi, " ")
        .replace(/\b(?:ISBN|ISSN|DOI|doi|arXiv|PMID|PMC|OCLC|LCCN)\s*:?\s*[\w./-]+/gi, " ")
        .replace(/\bv\s*[·•]?\s*t\s*[·•]?\s*e\b/gi, " ")
        .replace(/\b(?:Not to be confused with|For other uses,? see|This article is about|Main article|See also)\b[^.\n]*[.\n]/gi, " ")
        .replace(/\([^()]*[ˈˌːɪʊəɛɔʌθð][^()]*\)/g, " ")
        .replace(/\((?:born|died|c\.|circa|fl\.|r\.)?\s*\d{1,4}[^()]{0,40}\)/gi, " ");
}

// ───────── Filter token sampah ─────────
function isGoodToken(t) {
    if (t.length < 3 || t.length > 30) return false;
    let digits = 0;
    for (const c of t) if (c >= "0" && c <= "9") digits++;
    if (digits / t.length > 0.5) return false;
    if (t.length > 6 && /^[A-Z]+$/.test(t)) return false;
    if (/^(https?|www|com|org|net|html|php|asp|jsp|wikipedia|wikimedia|wikiquote)$/i.test(t)) return false;
    if (/[@\/]/.test(t)) return false;
    if (/^[\d-]+$/.test(t)) return false;
    return true;
}

function tokenizeWord(s) {
    return s.split(/[^\p{L}\p{N}'-]+/u).map((w) => w.trim()).filter(Boolean);
}
function splitSentences(text) {
    return text
        .split(/[.!?…\n\r]+/)
        .map((s) => s.replace(/\s+/g, " ").trim())
        .filter(Boolean);
}

const PHRASE_MAX_CHARS  = 80;
const PHRASE_MIN_WORDS  = 4;
const PHRASE_MAX_WORDS  = 10;
const NGRAM_SIZES       = [3, 4, 5];
const NGRAM_PER_SIZE    = 3;
const NAV_BLACKLIST     = /^(jump to|go to|skip to|click here|read more|sign in|sign up|log in|log out|see also|external links|references|home|contact|about us|search|menu|navigation|categories|share this|print this|toggle)/i;

function cleanToken(w) { return w.replace(/^[-']+|[-']+$/g, ""); }
function isContentToken(w) { return w.length > 0 && /\p{L}/u.test(w); }

function pushNgrams(raw, n, pushPhrase) {
    if (raw.length < n) return;
    const total = raw.length - n + 1;
    const indices = total <= NGRAM_PER_SIZE
        ? Array.from({ length: total }, (_, i) => i)
        : [0, Math.floor((total - 1) / 2), total - 1];
    for (const i of indices) pushPhrase(raw.slice(i, i + n).join(" "));
}

function extractProperNouns(text) {
    const out  = [];
    const seen = new Set();
    const re = /\b([A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]{1,20}){1,3})\b/g;
    let m;
    while ((m = re.exec(text)) !== null) {
        const name = m[1];
        const lower = name.toLowerCase();
        if (/^(The|This|That|These|Those|There|Their|It|He|She|We|You|I|A|An|In|On|At|Of|For|And|Or|But|If|So|As|By|To|From|With|Wikipedia|Retrieved|See|Main|External|References|Categories|Citation|Article)\s/i.test(name)) continue;
        if (seen.has(lower)) continue;
        seen.add(lower);
        out.push(name);
    }
    return out;
}

function explodeProperNouns(names) {
    const out  = [];
    const seen = new Set();
    const push = (s) => {
        const k = s.toLowerCase();
        if (seen.has(k)) return;
        seen.add(k);
        out.push(s);
    };
    for (const name of names) {
        push(name);
        const parts = name.split(/\s+/);
        if (parts.length >= 3) {
            for (let i = 0; i + 2 <= parts.length; i++) push(parts.slice(i, i + 2).join(" "));
        }
        for (const p of parts) {
            if (p.length >= 4 && !/^(The|This|That|And|For|With|From)$/i.test(p)) push(p);
        }
    }
    return out;
}

function extractPriorityHtml(html) {
    const out = [];
    const grab = (re, contentGroup = 1) => {
        let m;
        while ((m = re.exec(html)) !== null) {
            const text = stripHtml(m[contentGroup]).replace(/\s+/g, " ").trim();
            if (text) out.push(text);
        }
    };
    grab(/<title\b[^>]*>([\s\S]*?)<\/title>/gi);
    grab(/<(h[1-3])\b[^>]*>([\s\S]*?)<\/\1>/gi, 2);
    grab(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi);
    grab(/<(i|em|b|strong|cite|dfn)\b[^>]*>([\s\S]*?)<\/\1>/gi, 2);
    return out;
}

function extractQuotedStrings(text) {
    const out = [];
    const re = /["']([^"'\n]{8,80})["']/g;
    let m;
    while ((m = re.exec(text)) !== null) {
        const inner = m[1].trim();
        const words = inner.split(/\s+/).filter(Boolean);
        if (words.length >= 2 && words.length <= PHRASE_MAX_WORDS) out.push(inner);
    }
    return out;
}

function refinePriority(rawPhrases) {
    const seen = new Set();
    const out  = [];
    for (const raw of rawPhrases) {
        const parts = raw.length > PHRASE_MAX_CHARS ? splitSentences(raw) : [raw];
        for (const p of parts) {
            const clean = p.replace(/\s+/g, " ").trim();
            if (!clean || clean.length > PHRASE_MAX_CHARS) continue;
            const words = clean.split(/\s+/).filter(Boolean);
            if (words.length < 2 || words.length > PHRASE_MAX_WORDS) continue;
            const lower = clean.toLowerCase();
            if (seen.has(lower)) continue;
            seen.add(lower);
            out.push(clean);
        }
    }
    return out;
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
        const raw = tokenizeWord(sentence)
            .map(cleanToken)
            .filter((w) => isContentToken(w) && w.length <= 25);
        if (raw.length === 0) continue;

        const isNav = NAV_BLACKLIST.test(raw.slice(0, 4).join(" ").toLowerCase());
        if (!isNav) {
            if (raw.length >= PHRASE_MIN_WORDS && raw.length <= PHRASE_MAX_WORDS) {
                pushPhrase(raw.join(" "));
            }
            for (const n of NGRAM_SIZES) {
                if (raw.length >= n + 1) pushNgrams(raw, n, pushPhrase);
            }
        }
        collectWords(raw);
    }
    return { words, phrases };
}

async function fetchHtml(url, timeoutMs = 20_000) {
    const html = await httpRequest(url, {
        timeoutMs,
        parse: "text",
        acceptJson: false,
        userAgent: "Mozilla/5.0 BrainwalletAuditor/1.0",
        headers: {
            "accept": "text/html,application/xhtml+xml",
            "accept-language": "en;q=0.9,id;q=0.8",
            "accept-encoding": "gzip, deflate, br",
        },
    });
    if (typeof html === "string" && html.length > MAX_HTML_BYTES) {
        logger.warn(`${url} → HTML ${(html.length / 1048576).toFixed(1)} MB, dipangkas ke ${MAX_HTML_BYTES / 1048576} MB`);
        return html.slice(0, MAX_HTML_BYTES);
    }
    return html;
}

/**
 * Pra-bersihkan HTML: buang script/style/noscript/iframe/svg sebelum semua
 * regex lain berjalan. Sangat mengurangi ukuran string yang harus dipindai
 * `extractPriorityHtml` dan `stripHtml`, dan mengeliminasi sumber backtracking
 * paling berbahaya (CSS/JS yang mengandung kutipan & kurung).
 */
function preStripNoise(html) {
    return html.replace(
        /<(script|style|noscript|iframe|svg|template)\b[^>]*>[\s\S]*?<\/\1>/gi,
        " "
    );
}

/**
 * Scrape satu atau lebih URL.
 * @param {string[]} urls
 * @param {{words:Set<string>, phrases:Set<string>}} [cache]
 * @returns {{ items: string[], years: string[] }}
 *   items: priority-baru-dulu, lalu frasa-baru, lalu kata-baru.
 *   years: tahun unik yang ditemukan (urut frekuensi-desc, top 20).
 */
async function scrapeUrls(urls, cache) {
    const seenWord    = new Set(cache?.words   || []);
    const seenPhrase  = new Set(cache?.phrases || []);
    const allPriority = [];
    const allPhrases  = [];
    const allWords    = [];
    const yearCounts  = new Map();
    let   skipWord    = 0;
    let   skipPhrase  = 0;

    // Tahap 1: fetch + parsing CPU paralel (tidak menyentuh shared state).
    // Hasil per-URL dikumpulkan dulu, lalu dedup-merge di tahap 2 (serial).
    const tasks = urls.map((u) => async () => {
        try {
            const t0 = Date.now();
            const rawHtml = await fetchHtml(u);
            const html    = preStripNoise(rawHtml);

            const priorityRaw = extractPriorityHtml(html);
            const text        = cleanWikiText(normalize(stripHtml(html)));
            const years       = extractYears(text);
            const quoted      = extractQuotedStrings(text);
            const propers     = explodeProperNouns(extractProperNouns(text));
            const priority    = refinePriority([...priorityRaw, ...quoted, ...propers]);
            const { words, phrases } = extractFromText(text);
            return { url: u, priority, phrases, words, years, ms: Date.now() - t0 };
        } catch (e) {
            return { url: u, error: e.message };
        }
    });
    const results = await runWithConcurrency(tasks, FETCH_CONCURRENCY);

    // Tahap 2: dedup serial agar urutan log deterministik & cache konsisten.
    for (const r of results) {
        if (r.error) { logger.warn(`Gagal scrape ${r.url}: ${r.error}`); continue; }
        for (const y of r.years) yearCounts.set(y, (yearCounts.get(y) || 0) + 1);

        let prAdded = 0, prSkip = 0;
        for (const p of r.priority) {
            const k = p.toLowerCase();
            if (seenPhrase.has(k)) { prSkip++; continue; }
            seenPhrase.add(k);
            if (cache) cache.phrases.add(k);
            allPriority.push(p);
            prAdded++;
        }
        let pAdded = 0, pSkip = 0;
        for (const p of r.phrases) {
            const k = p.toLowerCase();
            if (seenPhrase.has(k)) { pSkip++; continue; }
            seenPhrase.add(k);
            if (cache) cache.phrases.add(k);
            allPhrases.push(p);
            pAdded++;
        }
        let wAdded = 0, wSkip = 0;
        for (const w of r.words) {
            const k = w.toLowerCase();
            if (seenWord.has(k)) { wSkip++; continue; }
            seenWord.add(k);
            if (cache) cache.words.add(k);
            allWords.push(w);
            wAdded++;
        }
        skipWord   += wSkip;
        skipPhrase += pSkip + prSkip;
        logger.info(
            `${r.url} → ${prAdded} prioritas, ${pAdded} frasa, ${wAdded} kata baru ` +
            `(skip ${wSkip + pSkip + prSkip} dari cache, ${r.ms}ms)`
        );
    }

    if (cache && (skipWord || skipPhrase)) {
        logger.info(`Total dari cache (di-skip): ${skipWord} kata + ${skipPhrase} frasa`);
    }

    const years = [...yearCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([y]) => y);

    return {
        items: [...allPriority, ...allPhrases, ...allWords],
        years,
    };
}

module.exports = { scrapeUrls, _internals: { extractYears, STOP_WORDS } };
