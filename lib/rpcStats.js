/**
 * Pelacak kesehatan RPC: berapa kali tiap endpoint dipakai (sukses)
 * dan berapa kali gagal. Ditampilkan di akhir sesi.
 */
const stats = new Map(); // key: "label|url" → { label, url, ok, fail }

function _get(label, url) {
    const k = `${label}|${url}`;
    let s = stats.get(k);
    if (!s) {
        s = { label, url, ok: 0, fail: 0 };
        stats.set(k, s);
    }
    return s;
}

function recordOk(label, url)   { _get(label, url).ok++; }
function recordFail(label, url) { _get(label, url).fail++; }

function snapshot() {
    return Array.from(stats.values());
}

module.exports = { recordOk, recordFail, snapshot };
