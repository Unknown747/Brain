const httpStats = require("./httpStats");

function chunkArray(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

function formatDuration(ms) {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h) return `${h}j ${m}m ${sec}d`;
    if (m) return `${m}m ${sec}d`;
    return `${sec}d`;
}

function createRateLimiter(perSecond) {
    const interval = 1000 / Math.max(1, perSecond);
    let next = 0;
    return async function take() {
        const now = Date.now();
        const wait = Math.max(0, next - now);
        next = Math.max(now, next) + interval;
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    };
}

async function runWithConcurrency(tasks, concurrency) {
    const results = new Array(tasks.length);
    let i = 0;
    const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
        while (true) {
            const idx = i++;
            if (idx >= tasks.length) return;
            results[idx] = await tasks[idx]();
        }
    });
    await Promise.all(workers);
    return results;
}

/**
 * Jalankan fn dengan retry otomatis (exponential backoff).
 * @param {Function} fn       - Fungsi async yang akan dicoba ulang.
 * @param {number} maxRetries - Jumlah maksimum percobaan ulang (default 3).
 * @param {number} baseDelay  - Jeda awal dalam ms sebelum retry pertama (default 600).
 */
async function withRetry(fn, maxRetries = 3, baseDelay = 600) {
    let lastErr;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try { return await fn(); }
        catch (e) {
            lastErr = e;
            if (attempt < maxRetries) {
                await new Promise((r) => setTimeout(r, baseDelay * Math.pow(2, attempt)));
            }
        }
    }
    throw lastErr;
}

/**
 * Helper HTTP terpadu — fetch + AbortController + timeout + parsing + error
 * yang dipakai semua module (etherscan, multicoin, chainlist, notify, scraper).
 *
 * Opsi:
 *   method        - "GET" | "POST" | ... (default "GET")
 *   headers       - object header tambahan (UA & content-type ditambah otomatis)
 *   body          - object/string; kalau object akan di-JSON.stringify
 *   timeoutMs     - default 15000
 *   userAgent     - shorthand untuk header "User-Agent"
 *   parse         - "json" (default) | "text" | "raw" (return Response apa adanya)
 *   acceptJson    - default true; menambah header Accept: application/json
 *   retries       - default 1; jumlah percobaan ulang otomatis untuk error
 *                   transient (network error, HTTP 5xx, HTTP 429). Set 0 kalau
 *                   pemanggil sudah punya logika rotasi/retry sendiri.
 *   retryBackoffMs- default 300; jeda dasar antar percobaan (linear).
 *
 * Pada respons non-2xx, lempar Error dengan field `.status` (kompatibel dengan
 * deteksi payload-too-large di etherscan). Timeout (AbortError) TIDAK di-retry
 * karena memperpanjang wall-clock pemanggil; naikkan `timeoutMs` bila perlu.
 */
function isTransientError(err) {
    if (!err) return false;
    if (err.name === "AbortError") return false;          // timeout — jangan retry
    if (typeof err.status === "number") {
        return err.status >= 500 || err.status === 429;
    }
    return true;                                          // network / fetch failure
}

/**
 * Parse header `Retry-After` (RFC 7231): boleh berupa detik (mis. "30") atau
 * tanggal HTTP (mis. "Wed, 21 Oct 2026 07:28:00 GMT"). Kembalikan ms, atau
 * null kalau tidak valid. Hasil di-cap ke `maxMs` agar pemanggil tidak hang.
 */
function parseRetryAfter(value, maxMs = 30_000) {
    if (!value) return null;
    const s = String(value).trim();
    const n = Number(s);
    let ms;
    if (Number.isFinite(n)) ms = n * 1000;
    else {
        const t = Date.parse(s);
        if (!Number.isFinite(t)) return null;
        ms = t - Date.now();
    }
    if (ms <= 0) return 0;
    return Math.min(ms, maxMs);
}

async function httpRequest(url, opts = {}) {
    const {
        method         = "GET",
        headers        = {},
        body,
        timeoutMs      = 15_000,
        userAgent,
        parse          = "json",
        acceptJson     = true,
        retries        = 1,
        retryBackoffMs = 300,
        // Status non-2xx yang dianggap sukses (mis. [304] untuk conditional GET).
        // Saat status cocok, kembalikan { status, headers } tanpa parsing body.
        allowedStatus  = [],
    } = opts;

    const finalHeaders = { ...headers };
    if (userAgent && !finalHeaders["User-Agent"]) finalHeaders["User-Agent"] = userAgent;
    if (acceptJson && parse === "json" && !finalHeaders["accept"]) {
        finalHeaders["accept"] = "application/json";
    }

    let finalBody = body;
    if (body !== undefined && body !== null && typeof body !== "string") {
        finalBody = JSON.stringify(body);
        if (!finalHeaders["content-type"]) finalHeaders["content-type"] = "application/json";
    }

    const attempts = Math.max(1, retries + 1);
    let lastErr;
    for (let i = 0; i < attempts; i++) {
        const ctrl = new AbortController();
        const t    = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
            const res = await fetch(url, {
                method,
                headers:  finalHeaders,
                body:     finalBody,
                signal:   ctrl.signal,
                redirect: "follow",
            });
            if (!res.ok) {
                if (allowedStatus.includes(res.status)) {
                    return { status: res.status, headers: res.headers, _allowed: true };
                }
                const err = new Error(`HTTP ${res.status}`);
                err.status = res.status;
                if (res.status === 429 || res.status === 503) {
                    const ra = parseRetryAfter(res.headers.get("retry-after"));
                    if (ra !== null) err.retryAfterMs = ra;
                }
                throw err;
            }
            if (parse === "raw")  return res;
            if (parse === "text") return await res.text();
            return await res.json();
        } catch (err) {
            lastErr = err;
            if (i === attempts - 1 || !isTransientError(err)) throw err;
            try { httpStats.recordRetry(url, err); } catch {}
            // Patuhi Retry-After dari server bila ada (presisi, tanpa jitter).
            // Jika tidak, pakai backoff linear ±20% jitter agar request paralel
            // yang kena rate-limit bersamaan tidak re-fire di milidetik yang sama.
            let wait;
            if (typeof err.retryAfterMs === "number") {
                wait = err.retryAfterMs;
            } else {
                const base   = retryBackoffMs * (i + 1);
                const jitter = base * 0.2 * (Math.random() * 2 - 1); // ±20%
                wait = Math.max(0, Math.round(base + jitter));
            }
            await new Promise((r) => setTimeout(r, wait));
        } finally { clearTimeout(t); }
    }
    throw lastErr;
}

module.exports = {
    chunkArray, formatDuration, createRateLimiter, runWithConcurrency, withRetry,
    httpRequest,
};
