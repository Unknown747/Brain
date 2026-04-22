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
 * Hidrasi statistik dari snapshot lama (cache antar-sesi).
 * Tidak meng-overwrite entri yang sudah aktif di sesi ini.
 */
function hydrate(entries) {
    if (!Array.isArray(entries)) return 0;
    let n = 0;
    for (const e of entries) {
        if (!e || !e.label || !e.url) continue;
        const k = `${e.label}|${e.url}`;
        if (stats.has(k)) continue;
        stats.set(k, {
            label:    e.label,
            url:      e.url,
            ok:       e.ok       || 0,
            fail:     e.fail     || 0,
            inflight: 0,
            lastOk:   e.lastOk   || 0,
            lastFail: e.lastFail || 0,
        });
        n++;
    }
    return n;
}

/** Ambil entry untuk satu (label, url) — null kalau tidak ada. */
function getEntry(label, url) {
    return stats.get(`${label}|${url}`) || null;
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

module.exports = { recordStart, recordOk, recordFail, snapshot, byLabel, hydrate, getEntry };
