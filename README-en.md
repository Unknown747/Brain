<p align="center"><a href="./README.md">Bahasa Indonesia</a> | English</p>

# Brainwallet Auditor

[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Purpose](https://img.shields.io/badge/Purpose-Security_Research-red.svg)](#security)
[![EVM](https://img.shields.io/badge/EVM-ETH_BSC_Polygon_Arbitrum-purple.svg)](#default-configuration)
[![Coins](https://img.shields.io/badge/Coins-BTC_LTC_DOGE_TRX_SOL-orange.svg)](#default-configuration)

---

## Description

**Brainwallet Auditor** is a security research tool for detecting cryptocurrency wallets created from weak phrases (*brainwallets*). It:

1. Fetches text from URLs → extracts **words + real phrases** (4–10 word sentences, 4/5-grams).
2. Generates thousands of **mutation variants** (case, suffix, prefix, year, leetspeak, camelCase/PascalCase/no-space).
3. Derives private keys using **6 different hashing strategies**.
4. Checks balances across **10 blockchain networks** in parallel.
5. Auto-retries with exponential backoff on API failure.
6. Saves checkpoints — can resume if the process is interrupted.
7. Stores findings encrypted with AES-256-GCM.
8. Displays per-coin summary + RPC health table at the end of each session.

> ⚠️ This tool is built solely for educational and security research purposes.

---

## Features

| Feature | Detail |
|---|---|
| **Smart scraper** | HTML cleaned of nav/footer/sidebar/script + junk-token filter |
| **Real phrases** | Extracts whole 4–10 word sentences + 4/5-grams from original word order |
| **Multi-language stop-words** | EN + ID + ES (single words filtered; phrases keep stop-words) |
| **Persistent scrape cache** | Tokens already scraped are auto-skipped across sessions (auto-prune) |
| **Built-in URL presets** | 10 ready sources: einstein, shakespeare, bible, quran, taoteching, … |
| **Password mutations** | case, suffix (!, 123, 2024…), prefix (the, my…), years (1990–2026), leetspeak, reverse, camelCase/PascalCase |
| **Intensity levels** | `light` (~5/item) · `medium` (~25/item, default) · `heavy` (~80/item) |
| **6 hashing strategies** | SHA-256, Double-SHA-256, Keccak-256, SHA-256 (no space), SHA-256 (lower), MD5→SHA-256 |
| **Multi-chain EVM** | Ethereum, BNB Chain, Polygon, Arbitrum (configurable) |
| **Multi-coin** | BTC, LTC, DOGE, TRX, SOL |
| **JSON-RPC batch (EVM)** | Many addresses per request — much faster |
| **Multi-RPC fallback** | Auto-switches endpoint if one RPC fails/times out |
| **RPC health table** | See which endpoint was used & how often it failed at session end |
| **Auto-retry** | Exponential backoff on API failure (max 3×) |
| **Parallel checks** | All coins & chains checked simultaneously |
| **Speed & ETA** | Displayed live in the terminal |
| **Checkpoint & resume** | Press Ctrl+C anytime — progress is saved and can be resumed |
| **In-memory address cache** | No address cache file — each session starts clean |
| **Encrypted findings** | Results stored with AES-256-GCM |
| **Bell notification** | Terminal rings when a funded wallet is found |
| **Per-coin summary** | Table of addresses checked & found per coin at audit end |
| **config.json** | Save defaults so you don't have to retype flags |

---

## Project Structure

```
brainwallet-auditor/
├── index.js                  # CLI entry point
├── auditor_brainwallet.js    # Main orchestrator
├── decrypt.js                # Decrypt hallazgos.enc
├── config.example.json       # Config template (copy to config.json)
├── lib/
│   ├── candidates.js         # Mutation variant generator (light/medium/heavy)
│   ├── derive.js             # 6 private key derivation strategies
│   ├── etherscan.js          # Multi-chain EVM RPC + JSON-RPC batch + fallback
│   ├── logger.js             # Colored terminal + progress bar + ETA + summary
│   ├── multicoin.js          # BTC/LTC/DOGE/TRX/SOL derivation & balance
│   ├── rpcStats.js           # Per-endpoint RPC health tracker
│   ├── scrapeCache.js        # Persistent word/phrase cache across sessions
│   ├── scraper.js            # URL scraping + word/phrase extraction + stop-word filter
│   ├── sources.js            # Built-in URL preset list
│   ├── storage.js            # AES-GCM encryption & findings storage
│   └── util.js               # Rate limiter, concurrency, retry, time formatting
├── package.json
├── README.md
└── README-en.md
```

---

## Installation

```bash
# 1. Clone the repository
git clone https://github.com/Unknown747/Brain.git
cd Brain

# 2. Make sure Node.js 20+ is installed
node --version

# 3. Install dependencies (only ethers)
npm install
```

The AES key is auto-generated at `aes.key` on first run.
**Back up this file** — it is required to decrypt `hallazgos.enc`.

---

## Usage

```bash
node index.js
# or
npm start
```

### Interactive mode

When run with no flags, the script asks for a URL or preset name. You can enter:

- a preset name: `einstein`
- multiple presets/URLs: `einstein,bitcoin,https://my-site.com/data`
- `all` to audit every built-in preset at once

### Non-interactive mode (CLI)

```bash
node index.js --urls=einstein                  # Use a built-in preset directly
node index.js --urls=einstein,bitcoin          # Combine multiple presets/URLs
node index.js --urls=all                       # Audit every built-in preset
node index.js --sources                        # Show available presets
node index.js --coins=eth,btc,sol              # Limit coins
node index.js --chains=1,56                    # Limit EVM chains
node index.js --strategies=sha256,md5          # Limit hashing strategies
node index.js --intensity=heavy                # Mutation level: light | medium | heavy
node index.js --help                           # Full help
```

> CLI arguments always override `config.json`.

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
| `all` | All of the above (10 unique URLs) |

### Default configuration (config.json)

Copy `config.example.json` to `config.json` and adjust:

```json
{
  "coins":       "eth,btc,ltc,doge,trx,sol",
  "chains":      "1,56,137,42161",
  "strategies":  "sha256,doubleSha256,keccak256,sha256NoSpace,sha256Lower,md5",
  "chunkSize":   1000,
  "concurrency": 5,
  "rateLimit":   5,
  "batchSize":   100,
  "intensity":   "medium"
}
```

`config.json` is in `.gitignore` — it will never be committed.

### Checkpoint & resume

If the process is interrupted (Ctrl+C or crash), progress is automatically saved to `progress.json`.
On the next run, the tool offers to resume:

```
▶ Checkpoint Found
──────────────────────────────────────────────────────
[INF] URL       : https://en.wikipedia.org/wiki/Bitcoin
[INF] Progress  : block 2/5 done
[INF] Checked   : 4200 addresses, found: 0

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
Scraping & extraction of words + real phrases
   │  (stop-word filter, skip tokens already in persistent cache)
   ▼
Generate mutation variants
   │  (case, suffix, prefix, year, leetspeak, camel/PascalCase, no-space)
   ▼
Private key derivation  ── 6 hashing strategies
   │
   ▼
Parallel balance checks (per coin & chain)
   ├── ETH  → Ethereum, BNB Chain, Polygon, Arbitrum  (JSON-RPC batch + fallback)
   ├── BTC  → blockchain.info  (+ mempool.space fallback)
   ├── LTC  → Blockchair
   ├── DOGE → Blockchair
   ├── TRX  → TronGrid
   └── SOL  → Solana public RPC (multi-endpoint fallback)
   │
   ▼
Findings → hallazgos.enc (AES-256-GCM) + found.txt
           + bell + per-coin summary + RPC health table
```

---

## Default configuration

| Parameter | Value | Description |
|---|---|---|
| `chains` | 1, 56, 137, 42161 | ETH · BNB Chain · Polygon · Arbitrum |
| `coins` | eth, btc, ltc, doge, trx, sol | All coins |
| `strategies` | sha256, doubleSha256, keccak256, sha256NoSpace, sha256Lower, md5 | All strategies |
| `intensity` | medium | Mutation level (light / medium / heavy) |
| `chunkSize` | 1000 | Words per block |
| `concurrency` | 5 | Parallel requests per EVM chain |
| `rateLimit` | 5 | Requests/second (EVM) |
| `batchSize` | 100 | Addresses per EVM RPC batch |

---

## Files generated at runtime

| File | Contents | Git |
|---|---|---|
| `aes.key` | AES-256 key (auto-generated) | gitignored |
| `hallazgos.enc` | Findings encrypted (AES-GCM) | gitignored |
| `found.txt` | Findings as plain text, tab-separated | gitignored |
| `.scrape_cache.json` | Words & phrases already scraped (persistent across sessions, auto-prune) | gitignored |
| `progress.json` | Session checkpoint (auto-deleted on completion) | gitignored |

> Persistent scrape cache — tokens already scraped are auto-skipped on subsequent sessions. Delete `.scrape_cache.json` to reset.

---

## Theory

A brainwallet generates a private key from a memorized phrase. The weakness: if the phrase is predictable, the key can be found.

- Ethereum private key space: **2²⁵⁶** possibilities (~10⁷⁷)
- Truly random key: success probability ≈ 0
- Brainwallet from common phrase: probability > 0 — that is what this tool audits

---

## Requirements

- **Node.js 20+**
- Internet connection (for public blockchain APIs)
- `aes.key` (auto-created if missing)

---

## Security

- Found private keys stored **locally encrypted** (AES-256-GCM)
- No sensitive data sent to third-party servers
- Address cache is in-memory only — nothing written to disk
- `aes.key`, `config.json`, `hallazgos.enc`, `found.txt`, `.scrape_cache.json`, `progress.json` are all in `.gitignore`
- Use only in controlled environments and with appropriate authorization

---

## License

MIT — see [LICENSE](./LICENSE).
