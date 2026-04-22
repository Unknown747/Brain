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
 * Kombinasi tahun-konteks (#12):
 *   Kalau opts.years diberikan (mis. tahun yang ditemukan di halaman seperti
 *   "(born 1955)"), tahun-tahun itu akan dipasangkan dengan setiap item di
 *   intensitas medium/heavy → "stevejobs1955", "SteveJobs1955", dst.
 *
 * Tingkat intensitas:
 *   light  → ~5 varian/item    (cepat, cakupan minimal)
 *   medium → ~25 varian/item   (default — seimbang)
 *   heavy  → ~80 varian/item   (cakupan luas, paling lambat)
 */

const LEET_MAP = { a: "4", e: "3", i: "1", o: "0", s: "5", t: "7" };

function leetify(s) { return [...s].map((c) => LEET_MAP[c.toLowerCase()] ?? c).join(""); }
function reverse(s) { return [...s].reverse().join(""); }
function capitalize(w) { return w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w; }
function titleCase(p) { return p.split(/\s+/).map(capitalize).join(" "); }
function camelCase(p) {
    const parts = p.toLowerCase().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "";
    return parts[0] + parts.slice(1).map(capitalize).join("");
}
function pascalCase(p) {
    return p.toLowerCase().split(/\s+/).filter(Boolean).map(capitalize).join("");
}
function initials(p) {
    return p.toLowerCase().split(/\s+/).filter(Boolean).map((w) => w[0]).join("");
}
function joinWith(p, sep) {
    return p.toLowerCase().split(/\s+/).filter(Boolean).join(sep);
}
function isPhrase(s) { return /\s/.test(s); }

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
    if (intensity === "medium") return Array.from({ length: 16 }, (_, i) => 2010 + i);
    return Array.from({ length: 37 }, (_, i) => 1990 + i);
}

function variantsForWord(w, intensity, out, contextYears) {
    const lower = w.toLowerCase();
    const upper = w.toUpperCase();
    const cap   = capitalize(w);

    out.add(w); out.add(lower); out.add(cap);
    if (intensity === "light") return;

    out.add(upper);
    for (const s of SUFFIXES[intensity]) { out.add(lower + s); out.add(cap + s); }
    for (const p of PREFIXES[intensity]) { out.add(p + lower); out.add(p + cap); }
    for (const y of yearList(intensity)) {
        out.add(lower + y);
        if (intensity === "heavy") out.add(cap + y);
    }
    // Kombinasi dengan tahun-konteks dari halaman.
    for (const y of contextYears) {
        out.add(lower + y); out.add(cap + y);
    }
    if (intensity === "heavy") {
        out.add(leetify(lower)); out.add(leetify(cap)); out.add(reverse(lower));
    }
}

function variantsForPhrase(p, intensity, out, contextYears) {
    const lower   = p.toLowerCase();
    const upper   = p.toUpperCase();
    const title   = titleCase(p);
    const noSpace = lower.replace(/\s+/g, "");
    const camel   = camelCase(p);
    const pascal  = pascalCase(p);
    const init    = initials(p);

    out.add(p); out.add(lower); out.add(noSpace); out.add(title);
    if (init.length >= 3) { out.add(init); out.add(init.toUpperCase()); }
    if (intensity === "light") return;

    out.add(upper); out.add(camel); out.add(pascal);
    if (noSpace) out.add(noSpace[0].toUpperCase() + noSpace.slice(1));
    out.add(joinWith(p, "_"));
    out.add(joinWith(p, "-"));

    for (const s of SUFFIXES[intensity]) { out.add(lower + s); out.add(noSpace + s); }

    const years = intensity === "heavy"
        ? [2009, 2010, 2011, 2012, 2013, 2014, 2017, 2021, 2024]
        : [2024];
    for (const y of years) { out.add(noSpace + y); out.add(lower + " " + y); }

    // Kombinasi tahun-konteks: pasangan kuat untuk frasa (nama tokoh + tahun lahir).
    for (const y of contextYears) {
        out.add(noSpace + y);
        out.add(pascal + y);
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
 * @param {Set<string>} [opts.seen]      Set "sudah dilihat" antar pemanggilan.
 * @param {string[]}    [opts.years]     Tahun-konteks dari halaman. Maks 6 dipakai
 *                                       supaya jumlah varian tidak meledak.
 */
function generateVariants(items, opts = {}) {
    const intensity = ["light", "medium", "heavy"].includes(opts.intensity)
        ? opts.intensity
        : "medium";

    const seen = opts.seen instanceof Set ? opts.seen : new Set();
    const contextYears = (intensity !== "light" && Array.isArray(opts.years))
        ? opts.years.slice(0, 6)  // top-6 tahun
        : [];

    const out  = [];
    let   skipped = 0;

    for (const item of items) {
        const t = String(item ?? "").trim();
        if (!t) continue;

        const bucket = new Set();
        if (isPhrase(t)) variantsForPhrase(t, intensity, bucket, contextYears);
        else             variantsForWord(t,   intensity, bucket, contextYears);

        for (const v of bucket) {
            const s = String(v ?? "").trim();
            if (!s) continue;
            if (seen.has(s)) { skipped++; continue; }
            seen.add(s);
            out.push(s);
        }
    }
    if (opts.seen) opts.seen.__skipped = (opts.seen.__skipped || 0) + skipped;
    return out;
}

module.exports = { generateVariants };
