/**
 * Hasilkan varian kandidat brainwallet.
 *
 * Input: array string (campuran kata tunggal & frasa multi-kata).
 * Output: array varian unik siap di-hash.
 *
 * Mutasi dibedakan untuk:
 *   - kata tunggal  → case, suffix angka/simbol, prefix umum, tahun, leetspeak
 *   - frasa         → case, no-space, camelCase, PascalCase, suffix
 *
 * Tingkat intensitas:
 *   light  → ~5 varian/item    (cepat, cakupan minimal)
 *   medium → ~25 varian/item   (default — seimbang)
 *   heavy  → ~80 varian/item   (cakupan luas, paling lambat)
 */

const LEET_MAP = { a: "4", e: "3", i: "1", o: "0", s: "5", t: "7" };

function leetify(s) {
    return [...s].map((c) => LEET_MAP[c.toLowerCase()] ?? c).join("");
}

function reverse(s) {
    return [...s].reverse().join("");
}

function capitalize(w) {
    if (!w) return w;
    return w[0].toUpperCase() + w.slice(1).toLowerCase();
}

function titleCase(phrase) {
    return phrase.split(/\s+/).map(capitalize).join(" ");
}

function camelCase(phrase) {
    const parts = phrase.toLowerCase().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "";
    return parts[0] + parts.slice(1).map(capitalize).join("");
}

function pascalCase(phrase) {
    return phrase.toLowerCase().split(/\s+/).filter(Boolean).map(capitalize).join("");
}

/** Inisial tiap kata: "to be or not to be" → "tbontb". */
function initials(phrase) {
    return phrase.toLowerCase().split(/\s+/).filter(Boolean).map((w) => w[0]).join("");
}

function joinWith(phrase, sep) {
    return phrase.toLowerCase().split(/\s+/).filter(Boolean).join(sep);
}

function isPhrase(s) {
    return /\s/.test(s);
}

// ---------------- Suffix / tahun per intensitas ----------------
const SUFFIXES = {
    light:  ["!", "123"],
    medium: ["!", "?", ".", "1", "123", "1234", "2024"],
    heavy:  ["!", "!!", "?", ".", "..", "0", "00", "1", "01", "12", "21",
             "69", "99", "100", "123", "1234", "12345", "123456", "777", "2024"],
};

const PREFIXES = {
    light:  [],
    medium: ["my", "the"],
    heavy:  ["my", "the", "a", "i", "im", "iam"],
};

function yearList(intensity) {
    if (intensity === "light")  return [];
    if (intensity === "medium") return Array.from({ length: 16 }, (_, i) => 2010 + i); // 2010–2025
    return Array.from({ length: 37 }, (_, i) => 1990 + i); // 1990–2026
}

// ---------------- Varian untuk kata tunggal ----------------
function variantsForWord(w, intensity, out) {
    const lower = w.toLowerCase();
    const upper = w.toUpperCase();
    const cap   = capitalize(w);

    out.add(w);
    out.add(lower);
    out.add(cap);
    if (intensity === "light") return;

    out.add(upper);

    // Suffix angka/simbol.
    for (const s of SUFFIXES[intensity]) {
        out.add(lower + s);
        out.add(cap + s);
    }

    // Prefix umum.
    for (const p of PREFIXES[intensity]) {
        out.add(p + lower);
        out.add(p + cap);
    }

    // Tahun.
    for (const y of yearList(intensity)) {
        out.add(lower + y);
        if (intensity === "heavy") out.add(cap + y);
    }

    if (intensity === "heavy") {
        out.add(leetify(lower));
        out.add(leetify(cap));
        out.add(reverse(lower));
    }
}

// ---------------- Varian untuk frasa ----------------
function variantsForPhrase(p, intensity, out) {
    const lower   = p.toLowerCase();
    const upper   = p.toUpperCase();
    const title   = titleCase(p);
    const noSpace = lower.replace(/\s+/g, "");
    const camel   = camelCase(p);
    const pascal  = pascalCase(p);
    const init    = initials(p);

    out.add(p);
    out.add(lower);
    out.add(noSpace);
    out.add(title);
    // Inisial — pola brainwallet sangat umum (mis. "tbontb").
    if (init.length >= 3) {
        out.add(init);
        out.add(init.toUpperCase());
    }
    if (intensity === "light") return;

    out.add(upper);
    out.add(camel);
    out.add(pascal);
    // Versi tanpa spasi dengan capitalize huruf pertama.
    out.add(noSpace[0]?.toUpperCase() + noSpace.slice(1));
    // snake_case & kebab-case.
    out.add(joinWith(p, "_"));
    out.add(joinWith(p, "-"));

    // Suffix di akhir frasa.
    for (const s of SUFFIXES[intensity]) {
        out.add(lower + s);
        out.add(noSpace + s);
    }

    // Tahun (tidak diaplikasikan ke heavy untuk semua bentuk — terlalu meledak).
    const years = intensity === "heavy"
        ? [2009, 2010, 2011, 2012, 2013, 2014, 2017, 2021, 2024]
        : [2024];
    for (const y of years) {
        out.add(noSpace + y);
        out.add(lower + " " + y);
    }

    if (intensity === "heavy") {
        out.add(leetify(noSpace));
        out.add(capitalize(init));
    }
}

/**
 * @param {string[]} items   Daftar kata & frasa hasil scrape.
 * @param {object}   [opts]
 * @param {"light"|"medium"|"heavy"} [opts.intensity="medium"]
 */
function generateVariants(items, opts = {}) {
    const intensity = ["light", "medium", "heavy"].includes(opts.intensity)
        ? opts.intensity
        : "medium";

    const seen = new Set();
    const out  = [];

    for (const item of items) {
        const t = String(item ?? "").trim();
        if (!t) continue;

        const bucket = new Set();
        if (isPhrase(t)) variantsForPhrase(t, intensity, bucket);
        else             variantsForWord(t,   intensity, bucket);

        for (const v of bucket) {
            const s = String(v ?? "").trim();
            if (!s || seen.has(s)) continue;
            seen.add(s);
            out.push(s);
        }
    }
    return out;
}

module.exports = { generateVariants };
