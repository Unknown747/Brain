/**
 * Daftar URL preset dengan teks berkualitas tinggi untuk audit brainwallet.
 *
 * Sumber-sumber ini dipilih karena banyak orang dulu memakai kutipan,
 * lirik, ayat, atau pepatah dari sini sebagai brainwallet.
 *
 * Pakai dari CLI:  node index.js   → saat ditanya URL, ketik nama preset.
 *                                    misal: "einstein" atau "einstein,shakespeare"
 */

const PRESETS = {
    einstein:    ["https://en.wikiquote.org/wiki/Albert_Einstein"],
    shakespeare: ["https://en.wikiquote.org/wiki/William_Shakespeare"],
    twain:       ["https://en.wikiquote.org/wiki/Mark_Twain"],
    proverbs:    ["https://en.wikiquote.org/wiki/English_proverbs"],
    movies:      ["https://en.wikiquote.org/wiki/List_of_films"],
    bible:       ["https://www.gutenberg.org/cache/epub/10/pg10.txt"],
    taoteching:  ["https://www.gutenberg.org/cache/epub/216/pg216.txt"],
    quran:       ["https://www.gutenberg.org/cache/epub/2800/pg2800.txt"],
    bitcoin:     ["https://bitcoin.org/bitcoin.pdf", "https://en.wikipedia.org/wiki/Bitcoin"],
    quotes:      [
        "https://en.wikiquote.org/wiki/Albert_Einstein",
        "https://en.wikiquote.org/wiki/William_Shakespeare",
        "https://en.wikiquote.org/wiki/Mark_Twain",
        "https://en.wikiquote.org/wiki/English_proverbs",
    ],
};

/** Cek apakah string adalah nama preset (bukan URL). */
function isPreset(s) {
    return Object.prototype.hasOwnProperty.call(PRESETS, s.toLowerCase());
}

/** Resolusi: nama preset → array URL, URL → tetap URL. */
function resolveSources(items) {
    const out  = [];
    const seen = new Set();
    for (const raw of items) {
        const t = raw.trim();
        if (!t) continue;
        const expanded = isPreset(t) ? PRESETS[t.toLowerCase()] : [t];
        for (const url of expanded) {
            if (!seen.has(url)) { seen.add(url); out.push(url); }
        }
    }
    return out;
}

function listPresets() {
    return Object.entries(PRESETS).map(([name, urls]) => ({ name, urls }));
}

module.exports = { PRESETS, isPreset, resolveSources, listPresets };
