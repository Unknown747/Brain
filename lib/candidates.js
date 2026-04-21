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
    for (const raw of words) {
        const w = String(raw).trim();
        if (!w) continue;
        push(w);
        push(w.toLowerCase());
        push(w.toUpperCase());
        push(w[0].toUpperCase() + w.slice(1).toLowerCase());
        push(w + "!");
        push(w + "123");
        push("the " + w);
        push(w + " wallet");
    }
    return out;
}

module.exports = { generateVariants };
