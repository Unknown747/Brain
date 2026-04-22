<p align="center"><a href="./README.md">Bahasa Indonesia</a> | English</p>

# Brainwallet Auditor

[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Purpose](https://img.shields.io/badge/Purpose-Security_Research-red.svg)](#security)
[![EVM](https://img.shields.io/badge/EVM-11_chains-purple.svg)](#default-configuration)
[![Coins](https://img.shields.io/badge/Coins-BTC_LTC_DOGE_SOL-orange.svg)](#default-configuration)

---

## Description

**Brainwallet Auditor** is a security research tool for detecting cryptocurrency wallets created from weak phrases (*brainwallets*). It:

1. Fetches text from URLs → extracts **priority phrases** (title, headings, blockquotes, quoted strings), **regular phrases** (4–10 word sentences + 3/4/5-grams), and **single words**.
2. Generates thousands of **mutation variants** (case, suffix, prefix, year, leetspeak, camelCase/PascalCase/snake_case/kebab-case/phrase-initials).
3. Derives private keys using **6 different hashing strategies**.
4. Checks balances across **15 blockchain networks** in parallel (11 EVM + BTC, LTC, DOGE, SOL).
5. Auto-retries with exponential backoff on API failure.
6. **Three-layer dedup** — tokens, mutation variants, and addresses are each processed only once.
7. Saves checkpoints — can resume if the process is interrupted (Ctrl+C).
8. Stores findings encrypted with AES-256-GCM.
9. Displays per-coin summary + RPC health + ETA with estimated finish time.

> ⚠️ This tool is built solely for educational and security research purposes.

---

## Quick Start

```bash
git clone https://github.com/Unknown747/Brain.git
cd Brain
npm install
node index.js
```

When run without flags, the tool asks for a URL/preset, then the mutation intensity. That's all.

---

## Features

| Feature | Detail |
|---|---|
| **Smart scraper** | HTML cleaned of nav/footer/sidebar/script + junk-token filter |
| **3-layer extraction** | (1) priority: title/h1-h3/blockquote/quoted strings · (2) phrases: 4–10 word sentences + 3/4/5-grams · (3) single words |
| **Multi-language stop-words** | EN + ID + ES (single words filtered; phrases keep stop-words) |
| **Persistent scrape cache** | Tokens already scraped are auto-skipped across sessions (auto-prune at 500k entries) |
| **Built-in URL presets** | 11 ready-to-use presets including `wikiquote-mix` (19 famous-people pages) |
| **Word mutations** | case, suffix (!, 123, 2024…), prefix (the, my…), years (1990–2026), leetspeak, reverse |
| **Phrase mutations** | no-space, camelCase, PascalCase, snake_case, kebab-case, **initials** (e.g. "to be or not to be" → `tbontb`) |
| **Intensity levels** | `light` (~5/item) · `medium` (~25/item, default) · `heavy` (~80/item) |
| **Cross-block variant dedup** | Variants seen in any earlier block are **not re-processed** |
| **6 hashing strategies** | SHA-256, Double-SHA-256, Keccak-256, SHA-256 (no space), SHA-256 (lower), MD5→SHA-256 |
| **Multi-chain EVM (11 chains)** | Ethereum, BNB, Polygon, Arbitrum, Optimism, Base, Avalanche, Gnosis, Linea, Scroll, zkSync Era (Fantom 250 optional) |
| **Per-chain batch & timeout** | Rate-limit-sensitive chains (Arbitrum/Linea/Scroll/zkSync) use smaller batches & longer timeouts |
| **"Race" mode for Arbitrum** | 2 healthy endpoints fired in parallel — winner wins, the rest are aborted |
| **Multi-RPC fallback + circuit breaker** | 7–12 public endpoints per chain (drpc, llamarpc, publicnode, ankr, 1rpc, blast, onfinality, omniatech); failed endpoints auto-cooldown 60s, sticky to last-good endpoint |
| **Wikipedia-aware scraper** | Strips wiki artifacts (`[edit]`, `[citation needed]`, ISBN/DOI/arXiv, navbox, hatnote, IPA, birth-death dates) + extracts proper-nouns and explodes them into sub-phrases & singletons (e.g. "Kobe Bean Bryant" → "Kobe", "Bryant", "Kobe Bean", "Bean Bryant") |
| **Italics/bold extraction** | `<i>`/`<em>`/`<b>`/`<strong>`/`<cite>` tags also harvested (work titles & key terms) |
| **Non-EVM coins** | BTC, LTC, DOGE, SOL |
| **JSON-RPC batch (EVM)** | Many addresses per request — much faster |
| **RPC health table** | See which endpoint was used & how often it failed at session end |
| **Auto-retry** | Exponential backoff on API failure (max 3×) |
| **Parallel checks** | All coins & chains checked simultaneously |
| **Speed & ETA** | Displayed live in the terminal with estimated finish time |
| **Checkpoint & resume** | Press Ctrl+C anytime — progress is saved and can be resumed |
| **In-memory address cache** | No on-disk address cache — every session starts clean |
| **Encrypted findings** | Saved with AES-256-GCM (frame-based, append-only) |
| **Bell notification** | Terminal beeps when a funded wallet is found |
| **Per-coin summary** | Table of addresses checked & finds per coin at session end |
| **Preview mode** | `--preview=N` shows top-N scraped items without auditing balances |
| **config.json** | Save default configuration to avoid retyping flags |

---

## Project Structure

```
brainwallet-auditor/
├── index.js                  # CLI entry point (interactive & non-interactive)
├── auditor_brainwallet.js    # Main audit orchestrator
├── decrypt.js                # Decrypts hallazgos.enc
├── config.example.json       # Configuration template (copy to config.json)
├── lib/
│   ├── candidates.js         # Mutation variant generator (light/medium/heavy)
│   ├── derive.js             # 6 private-key derivation strategies
│   ├── etherscan.js          # Public multi-chain EVM RPC + JSON-RPC batch + fallback
│   ├── logger.js             # Colored terminal + progress bar + ETA + summaries
│   ├── multicoin.js          # BTC/LTC/DOGE/SOL derivation & balance
│   ├── rpcStats.js           # Per-endpoint RPC health tracker
│   ├── scrapeCache.js        # Persistent word/phrase cache across sessions
│   ├── scraper.js            # URL scrape + 3-layer extraction (priority/phrases/words)
│   ├── sources.js            # Built-in URL presets
│   ├── storage.js            # AES-GCM encryption & in-memory address cache
│   └── util.js               # Rate limiter, concurrency, retry, time formatting
├── package.json
├── README.md
└── README-en.md
```

---

## Installation

```bash
git clone https://github.com/Unknown747/Brain.git
cd Brain

# Make sure Node.js 20+ is installed
node --version

# Install dependencies (only ethers)
npm install
```

The AES key is auto-generated at `aes.key` on first run.
**Back this file up** — required to decrypt `hallazgos.enc`.

---

## Usage

### Interactive mode (easiest)

```bash
node index.js
```

The tool will ask:
1. **URL/preset** — type a preset name (`einstein`) or any URL
2. **Intensity** — `light` / `medium` / `heavy` (default `medium`)

### Non-interactive (CLI)

```bash
node index.js --urls=einstein                  # Use a preset directly
node index.js --urls=einstein,bitcoin          # Combine multiple presets/URLs
node index.js --urls=all                       # Audit all built-in presets
node index.js --urls=einstein --preview=20     # Show top-20 items, skip balance audit
node index.js --urls=einstein --intensity=heavy
node index.js --urls=https://en.wikipedia.org/wiki/Kobe --limit=1000  # Cap to 1000 tokens (smoke test)
node index.js --sources                        # List built-in presets
node index.js --help                           # Help
```

> CLI arguments always override `config.json`. Advanced settings (coins, chains, strategies, performance tuning) live in `config.json`.

### Built-in URL presets

| Preset | Source |
|---|---|
| `einstein` | Wikiquote — Albert Einstein |
| `shakespeare` | Wikiquote — William Shakespeare |
| `twain` | Wikiquote — Mark Twain |
| `proverbs` | Wikiquote — English proverbs |
| `movies` | Wikiquote — List of films |
| `bible` | Project Gutenberg — King James Bible |
| `taoteching` | Project Gutenberg — Tao Te Ching |
| `quran` | Project Gutenberg — Quran (translation) |
| `bitcoin` | Bitcoin whitepaper + Wikipedia |
| `quotes` | Combined: Einstein + Shakespeare + Twain + Proverbs |
| `wikiquote-mix` | 19 pages: philosophers + scientists + writers + historical figures |
| `all` | All presets above merged & deduped |

### Advanced configuration (config.json)

Copy `config.example.json` to `config.json` and tweak as needed:

```json
{
  "coins":       "eth,btc,ltc,doge,sol",
  "chains":      "1,56,137,42161,10,8453,43114,100,59144,534352,324",
  "strategies":  "sha256,doubleSha256,keccak256,sha256NoSpace,sha256Lower,md5",
  "intensity":   "medium",
  "chunkSize":   1000,
  "concurrency": 5,
  "rateLimit":   5,
  "batchSize":   80,
  "logLevel":    "info"
}
```

`config.json` is in `.gitignore` — it won't be committed.

### Checkpoint & resume

If the process is stopped (Ctrl+C or crash), progress is auto-saved to `progress.json`.
On the next run, the program will offer to resume:

```
▶ Checkpoint Found
──────────────────────────────────────────────────────
[INF] URL        : https://en.wikipedia.org/wiki/Bitcoin
[INF] Progress   : block 2/5 done
[INF] Checked    : 4200 addresses, found: 0

  Resume from checkpoint? (y/n) >
```

### Decrypt findings

```bash
node decrypt.js
# or
npm run decrypt
```

---

## Workflow

```
URL / preset
   │
   ▼
Scraping & 3-layer extraction
   │  - priority: title/h1-h3/blockquote/quoted strings
   │  - phrases : 4–10 word sentences + 3/4/5-grams
   │  - words   : single tokens (stop-words filtered)
   │  (tokens already in persistent cache are auto-skipped)
   ▼
Generate mutation variants       ← cross-block dedup
   │  - words : case/suffix/prefix/year/leetspeak/reverse
   │  - phrase: no-space/camelCase/PascalCase/snake_case/
   │            kebab-case/phrase-initials (e.g. "tbontb")
   ▼
Derive private key  ── 6 hashing strategies
   │
   ▼
Parallel balance checks (per coin & chain)   ← in-memory address dedup
   ├── ETH  → Ethereum, BNB, Polygon, Arbitrum, Optimism, Base, Avalanche, Gnosis, Linea, Scroll, zkSync Era  (JSON-RPC batch + race + circuit breaker)
   ├── BTC  → blockchain.info  (+ mempool.space fallback)
   ├── LTC  → Blockchair
   ├── DOGE → Blockchair
   └── SOL  → Public Solana RPC (multi-endpoint fallback)
   │
   ▼
Findings → hallazgos.enc (AES-256-GCM) + found.txt
           + bell + per-coin summary + RPC health table
```

---

## Default Configuration

| Parameter | Value | Description |
|---|---|---|
| `chains` | 1, 56, 137, 42161, 10, 8453, 43114, 100, 59144, 534352, 324 | ETH · BNB · Polygon · Arbitrum · Optimism · Base · Avalanche · Gnosis · Linea · Scroll · zkSync Era |
| `coins` | eth, btc, ltc, doge, sol | All supported coins |
| `strategies` | sha256, doubleSha256, keccak256, sha256NoSpace, sha256Lower, md5 | All strategies |
| `intensity` | medium | Mutation level (light / medium / heavy) |
| `chunkSize` | 1000 | Words per block |
| `concurrency` | 5 | Parallel requests per EVM chain |
| `rateLimit` | 5 | Requests/second (EVM) |
| `batchSize` | 80 | Addresses per EVM JSON-RPC batch (auto-split if too large) |
| `logLevel` | info | debug / info / warn / error |

---

## Terminal Display

**Session banner:**
```
══════════════════════════════════════════════════════════
  ⛓  BRAINWALLET AUDITOR   security research tool
  22/4/2026, 04.21.49
══════════════════════════════════════════════════════════
```

**Per-block progress (live):**
```
[BLK] 12/200 ████░░░░░░░░░░░░ 6% │ candidates:24800 │ checked:24800 │ found:0 │ 845/s │ ETA: 22m (~16:43)
```

**Final summary:**
```
══════════════════════════════════════════════════════════
  ✓ AUDIT COMPLETE   duration: 18m 22s
══════════════════════════════════════════════════════════
  Blocks processed   : 200
  Total candidates   : 4,960,000
  Variants skipped   : 412,301 (duplicates)
  Addresses checked  : 4,547,699
  Average speed      : 4,128 addr/sec
  Found              : 0
══════════════════════════════════════════════════════════
```

---

## Runtime files

| File | Contents | Git |
|---|---|---|
| `aes.key` | AES-256 key (auto-generated) | gitignored |
| `hallazgos.enc` | Encrypted findings (AES-GCM, frame-based) | gitignored |
| `found.txt` | Plain-text findings, tab-separated | gitignored |
| `.scrape_cache.json` | Words & phrases already scraped (auto-prune at 500k) | gitignored |
| `progress.json` | Session checkpoint (auto-deleted on completion) | gitignored |
| `config.json` | Local default configuration (optional) | gitignored |

> Delete `.scrape_cache.json` to reset the scrape cache.

---

## Theory

Brainwallets generate a private key from a memorized phrase. The weakness: if the phrase is guessable, so is the private key.

- Ethereum private-key space: **2²⁵⁶** possibilities (~10⁷⁷)
- Pure random private key: success probability ≈ 0
- Brainwallet from common words: probability > 0 — that's what this tool audits

---

## Requirements

- **Node.js 20+** (uses built-in `fetch` & `crypto.createPrivateKey`)
- Internet connection (for public blockchain APIs)
- `aes.key` (auto-generated if missing)

Single runtime dependency: **ethers v6** (for EVM pubkey & address derivation).

---

## Security

- Private keys are stored **encrypted locally** (AES-256-GCM)
- No sensitive data is sent to third-party servers
- Address cache is in-memory only — never written to disk
- `aes.key`, `config.json`, `hallazgos.enc`, `found.txt`, `.scrape_cache.json`, `progress.json` are all in `.gitignore`
- Use only in controlled environments and with proper authorization

---

## License

MIT — see [LICENSE](./LICENSE).
