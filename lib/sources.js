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
    "wikiquote-mix": [
        // Filsuf
        "https://en.wikiquote.org/wiki/Friedrich_Nietzsche",
        "https://en.wikiquote.org/wiki/Confucius",
        "https://en.wikiquote.org/wiki/Laozi",
        "https://en.wikiquote.org/wiki/Aristotle",
        "https://en.wikiquote.org/wiki/Plato",
        "https://en.wikiquote.org/wiki/Socrates",
        // Ilmuwan
        "https://en.wikiquote.org/wiki/Albert_Einstein",
        "https://en.wikiquote.org/wiki/Isaac_Newton",
        "https://en.wikiquote.org/wiki/Nikola_Tesla",
        "https://en.wikiquote.org/wiki/Richard_Feynman",
        "https://en.wikiquote.org/wiki/Stephen_Hawking",
        // Penulis
        "https://en.wikiquote.org/wiki/Mark_Twain",
        "https://en.wikiquote.org/wiki/William_Shakespeare",
        "https://en.wikiquote.org/wiki/Oscar_Wilde",
        "https://en.wikiquote.org/wiki/J._R._R._Tolkien",
        // Tokoh
        "https://en.wikiquote.org/wiki/Mahatma_Gandhi",
        "https://en.wikiquote.org/wiki/Abraham_Lincoln",
        "https://en.wikiquote.org/wiki/Martin_Luther_King_Jr.",
        "https://en.wikiquote.org/wiki/Winston_Churchill",
    ],
};

/** Cek apakah string adalah nama preset (bukan URL). */
function isPreset(s) {
    return Object.prototype.hasOwnProperty.call(PRESETS, s.toLowerCase());
}

/** Semua URL unik dari semua preset (dipakai oleh keyword "all"). */
function allPresetUrls() {
    const seen = new Set();
    const out  = [];
    for (const urls of Object.values(PRESETS)) {
        for (const u of urls) if (!seen.has(u)) { seen.add(u); out.push(u); }
    }
    return out;
}

/** Resolusi: "all" → semua preset, nama preset → array URL, URL → tetap URL. */
function resolveSources(items) {
    const out  = [];
    const seen = new Set();
    for (const raw of items) {
        const t = raw.trim();
        if (!t) continue;
        const lower = t.toLowerCase();
        let expanded;
        if (lower === "all")     expanded = allPresetUrls();
        else if (isPreset(t))    expanded = PRESETS[lower];
        else                     expanded = [t];
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
