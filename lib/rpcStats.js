/**
 * Pelacak kesehatan RPC: berapa kali tiap endpoint dipakai (sukses)
 * dan berapa kali gagal. Selain itu juga melacak in-flight (request yang
 * sedang berjalan) dan timestamp terakhir, supaya bisa menampilkan
 * dashboard live per chain di antara blok.
 */
const stats = new Map(); // key: "label|url" → { label, url, ok, fail, inflight, lastOk, lastFail }

function _get(label, url) {
    const k = `${label}|${url}`;
    let s = stats.get(k);
    if (!s) {
        s = { label, url, ok: 0, fail: 0, inflight: 0, lastOk: 0, lastFail: 0 };
        stats.set(k, s);
    }
    return s;
}

function recordStart(label, url) { _get(label, url).inflight++; }
function recordOk(label, url)    {
    const s = _get(label, url);
    s.ok++; s.lastOk = Date.now();
    if (s.inflight > 0) s.inflight--;
}
function recordFail(label, url)  {
    const s = _get(label, url);
    s.fail++; s.lastFail = Date.now();
    if (s.inflight > 0) s.inflight--;
}

function snapshot() {
    return Array.from(stats.values());
}

/**
 * Snapshot dikelompokkan per label (mis. "EVM/Ethereum"), berisi ringkasan
 * agregat — dipakai oleh dashboard live antar-blok.
 */
function byLabel() {
    const map = new Map();
    for (const s of stats.values()) {
        let g = map.get(s.label);
        if (!g) {
            g = { label: s.label, ok: 0, fail: 0, inflight: 0, urls: [] };
            map.set(s.label, g);
        }
        g.ok       += s.ok;
        g.fail     += s.fail;
        g.inflight += s.inflight;
        g.urls.push(s);
    }
    return map;
}

module.exports = { recordStart, recordOk, recordFail, snapshot, byLabel };
