/**
 * Daftar URL preset dengan teks berkualitas tinggi untuk audit brainwallet.
 *
 * Sumber-sumber ini dipilih karena banyak orang dulu memakai kutipan,
 * lirik, ayat, nama tokoh, atau pepatah dari sini sebagai brainwallet.
 *
 * Pakai dari CLI:  node index.js --urls=<nama-preset>
 *                  contoh: --urls=einstein  atau  --urls=crypto-pioneers,proverbs
 */

const PRESETS = {
    // ── Tokoh ──
    einstein:    ["https://en.wikiquote.org/wiki/Albert_Einstein"],
    shakespeare: ["https://en.wikiquote.org/wiki/William_Shakespeare"],
    twain:       ["https://en.wikiquote.org/wiki/Mark_Twain"],

    // ── Pepatah / kutipan umum ──
    proverbs:    ["https://en.wikiquote.org/wiki/English_proverbs"],
    movies:      ["https://en.wikiquote.org/wiki/List_of_films"],

    // ── Karya keagamaan / klasik ──
    bible:       ["https://www.gutenberg.org/cache/epub/10/pg10.txt"],
    taoteching:  ["https://www.gutenberg.org/cache/epub/216/pg216.txt"],
    quran:       ["https://www.gutenberg.org/cache/epub/2800/pg2800.txt"],
    iliad:       ["https://www.gutenberg.org/cache/epub/6130/pg6130.txt"],
    odyssey:     ["https://www.gutenberg.org/cache/epub/1727/pg1727.txt"],

    // ── Bitcoin / kripto ──
    bitcoin:     ["https://bitcoin.org/bitcoin.pdf", "https://en.wikipedia.org/wiki/Bitcoin"],

    // ── Set gabungan ──
    quotes: [
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

    // ── BARU: Pelopor kripto (target tinggi untuk brainwallet awal) ──
    "crypto-pioneers": [
        "https://en.wikipedia.org/wiki/Satoshi_Nakamoto",
        "https://en.wikipedia.org/wiki/Hal_Finney_(computer_scientist)",
        "https://en.wikipedia.org/wiki/Vitalik_Buterin",
        "https://en.wikipedia.org/wiki/Nick_Szabo",
        "https://en.wikipedia.org/wiki/Adam_Back",
        "https://en.wikipedia.org/wiki/David_Chaum",
        "https://en.wikipedia.org/wiki/Wei_Dai",
        "https://en.wikipedia.org/wiki/Cypherpunk",
    ],

    // ── BARU: Nama bayi populer (sumber kata/nama yang sangat sering dipakai) ──
    babynames: [
        "https://en.wikipedia.org/wiki/List_of_most_popular_given_names",
        "https://en.wikipedia.org/wiki/Lists_of_most_common_surnames",
    ],

    // ── BARU: Motto, semboyan, slogan ──
    mottos: [
        "https://en.wikipedia.org/wiki/List_of_state_and_territory_mottos_of_the_United_States",
        "https://en.wikipedia.org/wiki/List_of_country-name_etymologies",
        "https://en.wikipedia.org/wiki/List_of_school_mottos",
    ],

    // ── BARU: Pop culture (film & musik all-time) ──
    "pop-culture": [
        "https://en.wikipedia.org/wiki/List_of_highest-grossing_films",
        "https://en.wikipedia.org/wiki/List_of_best-selling_music_artists",
        "https://en.wikipedia.org/wiki/List_of_best-selling_albums",
    ],

    // ── BARU: Lagu & lirik populer (judul lagu sering jadi brainwallet) ──
    songs: [
        "https://en.wikipedia.org/wiki/List_of_Billboard_Hot_100_number_ones_of_the_2010s",
        "https://en.wikipedia.org/wiki/List_of_Billboard_Hot_100_number_ones_of_the_2000s",
        "https://en.wikipedia.org/wiki/List_of_Billboard_Hot_100_number_ones_of_the_1990s",
    ],

    // ── BARU: Game & karakter populer ──
    games: [
        "https://en.wikipedia.org/wiki/List_of_best-selling_video_games",
        "https://en.wikipedia.org/wiki/List_of_video_game_franchises",
    ],
};

function isPreset(s) {
    return Object.prototype.hasOwnProperty.call(PRESETS, s.toLowerCase());
}

function allPresetUrls() {
    const seen = new Set();
    const out  = [];
    for (const urls of Object.values(PRESETS)) {
        for (const u of urls) if (!seen.has(u)) { seen.add(u); out.push(u); }
    }
    return out;
}

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
