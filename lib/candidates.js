const fs = require("fs");
const readline = require("readline");

function generateCandidatesFromWordlist(words) {
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
        push(w[0] ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w);
        push(w + "!");
        push(w + "123");
        push("the " + w);
        push(w + " wallet");
    }
    return out;
}

async function* readChunks(filePath, chunkSize) {
    const stream = fs.createReadStream(filePath, { encoding: "utf8" });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    let buf = [];
    for await (const line of rl) {
        buf.push(line);
        if (buf.length >= chunkSize) {
            yield buf;
            buf = [];
        }
    }
    if (buf.length) yield buf;
}

async function countLines(filePath) {
    return new Promise((resolve, reject) => {
        let n = 0;
        const stream = fs.createReadStream(filePath);
        stream.on("data", (chunk) => {
            for (const b of chunk) if (b === 0x0a) n++;
        });
        stream.on("end", () => resolve(n));
        stream.on("error", reject);
    });
}

module.exports = { generateCandidatesFromWordlist, readChunks, countLines };
