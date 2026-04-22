/**
 * Auto-discovery RPC endpoint dari chainlist.org.
 *
 * Ambil daftar publik RPC terbaru, gabungkan dengan RPC yang sudah hard-coded
 * di lib/etherscan.js. Hasil di-cache di .chainlist_cache.json (TTL 7 hari).
 *
 * Hanya endpoint HTTPS yang TIDAK mengandung placeholder (${...}, "API_KEY",
 * "infura", "alchemy", dst) yang dipakai — supaya tetap "no API key".
 */

const fs   = require("fs");
const path = require("path");

const CACHE_FILE   = path.join(process.cwd(), ".chainlist_cache.json");
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 hari
const SOURCE_URL   = "https://chainid.network/chains.json";

const FORBIDDEN_RE = /\$\{|API[_-]?KEY|infura|alchemy|quicknode|getblock|moralis|tatum|nodereal\.io/i;

function loadCache() {
    try {
        const data = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
        if (data && typeof data.savedAt === "number" && Date.now() - data.savedAt < CACHE_TTL_MS) {
            return data.byId || {};
        }
    } catch {}
    return null;
}

function saveCache(byId) {
    try {
        fs.writeFileSync(CACHE_FILE, JSON.stringify({ savedAt: Date.now(), byId }));
    } catch {}
}

async function fetchJson(url, timeoutMs = 15_000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(url, { signal: ctrl.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } finally { clearTimeout(t); }
}

function cleanRpcList(list) {
    if (!Array.isArray(list)) return [];
    const out = [];
    const seen = new Set();
    for (const u of list) {
        if (typeof u !== "string") continue;
        if (!u.startsWith("https://")) continue;
        if (FORBIDDEN_RE.test(u)) continue;
        const trimmed = u.replace(/\/+$/, "");
        if (seen.has(trimmed)) continue;
        seen.add(trimmed);
        out.push(trimmed);
    }
    return out;
}

/**
 * Tarik RPC publik untuk chainId yang diminta.
 * @param {number[]} chainIds
 * @returns {Promise<Map<number, string[]>>} chainId → daftar RPC
 */
async function discoverRpcs(chainIds) {
    const wanted = new Set(chainIds.map((n) => Number(n)));
    let byId = loadCache();
    if (!byId) {
        let list;
        try { list = await fetchJson(SOURCE_URL); }
        catch { return new Map(); }
        byId = {};
        for (const c of list) {
            if (!c?.chainId || !Array.isArray(c.rpc)) continue;
            const rpc = cleanRpcList(c.rpc);
            if (rpc.length > 0) byId[c.chainId] = rpc;
        }
        saveCache(byId);
    }
    const out = new Map();
    for (const id of wanted) {
        if (byId[id]) out.set(id, byId[id]);
    }
    return out;
}

module.exports = { discoverRpcs };
