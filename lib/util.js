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

function eta(done, total, startTime) {
    if (!done || !total) return "?";
    const elapsed = Date.now() - startTime;
    const remaining = (elapsed / done) * (total - done);
    return formatDuration(remaining);
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

module.exports = { chunkArray, formatDuration, eta, createRateLimiter, runWithConcurrency };
