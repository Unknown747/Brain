/** Hasilkan varian frasa dari daftar kata mentah (untuk dijadikan brainwallet). */

function generateVariants(words) {
    const seen = new Set();
    const out = [];

    const push = (w) => {
        const t = String(w).trim();
        if (!t || seen.has(t)) return;
        seen.add(t);
        out.push(t);
    };

    for (let i = 0; i < words.length; i++) {
        const w = String(words[i]).trim();
        if (!w) continue;

        // Varian kata tunggal
        push(w);
        push(w.toLowerCase());
        push(w.toUpperCase());
        push(w[0].toUpperCase() + w.slice(1).toLowerCase());
        push(w + "!");
        push(w + "123");
        push(w + "1");
        push(w + "2024");
        push("the " + w);
        push(w + " wallet");

        // Bigram: gabungkan dengan kata berikutnya
        if (i + 1 < words.length) {
            const w2 = String(words[i + 1]).trim();
            if (w2) {
                const wl  = w.toLowerCase();
                const w2l = w2.toLowerCase();
                push(wl + " " + w2l);
                push(wl + w2l);
                push(w + " " + w2);
                push(w[0].toUpperCase() + w.slice(1).toLowerCase() + " " +
                     w2[0].toUpperCase() + w2.slice(1).toLowerCase());
            }
        }
    }

    return out;
}

module.exports = { generateVariants };
