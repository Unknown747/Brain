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
 *
 * Pada respons non-2xx, lempar Error dengan field `.status` (kompatibel dengan
 * deteksi payload-too-large di etherscan).
 */
async function httpRequest(url, opts = {}) {
    const {
        method     = "GET",
        headers    = {},
        body,
        timeoutMs  = 15_000,
        userAgent,
        parse      = "json",
        acceptJson = true,
    } = opts;

    const ctrl = new AbortController();
    const t    = setTimeout(() => ctrl.abort(), timeoutMs);

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

    try {
        const res = await fetch(url, {
            method,
            headers:  finalHeaders,
            body:     finalBody,
            signal:   ctrl.signal,
            redirect: "follow",
        });
        if (!res.ok) {
            const err = new Error(`HTTP ${res.status}`);
            err.status = res.status;
            throw err;
        }
        if (parse === "raw")  return res;
        if (parse === "text") return await res.text();
        return await res.json();
    } finally { clearTimeout(t); }
}

module.exports = {
    chunkArray, formatDuration, createRateLimiter, runWithConcurrency, withRetry,
    httpRequest,
};
