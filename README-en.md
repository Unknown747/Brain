<p align="center"><a href="./README.md">Bahasa Indonesia</a> | English</p>

<p align="center">
  <img src="assets/runcode.gif" alt="Demo" width="640"/>
</p>

# Brainwallet Auditor

[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Purpose](https://img.shields.io/badge/Purpose-Security_Research-red.svg)](#security)
[![EVM](https://img.shields.io/badge/EVM-ETH_BSC_Polygon_Arbitrum-purple.svg)](#default-configuration)
[![Coins](https://img.shields.io/badge/Coins-BTC_LTC_DOGE_TRX_SOL-orange.svg)](#default-configuration)

---

## Description

**Brainwallet Auditor** is a security research tool for detecting cryptocurrency wallets created from weak phrases (*brainwallets*). It:

1. Fetches & filters text from URLs (stop-words removed automatically).
2. Generates thousands of phrase variants + bigrams (2-word combinations).
3. Derives private keys using **6 different hashing strategies**.
4. Checks balances across **10 blockchain networks** in parallel.
5. Auto-retries with exponential backoff on API failure.
6. Saves checkpoints — can resume if the process is interrupted.
7. Stores findings encrypted with AES-256-GCM.
8. Displays a full per-coin summary at the end of each session.

> ⚠️ This tool is built solely for educational and security research purposes.

---

## Features

| Feature | Detail |
|---|---|
| **Stop-words filter** | Common words (the, and, is, ...) removed automatically before processing |
| **Variants + bigrams** | Lowercase, uppercase, capitalize, suffixes `!` `123` `1` `2024`, 2-word combos |
| **6 hashing strategies** | SHA-256, Double-SHA-256, Keccak-256, SHA-256 (no space), SHA-256 (lower), MD5→SHA-256 |
| **Multi-chain EVM** | Ethereum, BNB Chain, Polygon, Arbitrum (configurable) |
| **Multi-coin** | BTC, LTC, DOGE, TRX, SOL |
| **Auto-retry** | Exponential backoff on API failure (max 3×) |
| **Parallel checks** | All coins & chains checked simultaneously |
| **Speed & ETA** | Displayed live in the terminal |
| **Checkpoint & resume** | Press Ctrl+C anytime — progress is saved and can be resumed |
| **In-memory cache** | No address cache file — each session starts clean |
| **Encrypted findings** | Results stored with AES-256-GCM |
| **Bell notification** | Terminal rings when a funded wallet is found |
| **Per-coin summary** | Table of addresses checked & found per coin at audit end |
| **config.json** | Save your default config so you don't have to retype flags |

---

## Project Structure

```
brainwallet-auditor/
├── index.js                 # CLI entry point
├── auditor_brainwallet.js   # Main orchestrator
├── decrypt.js               # Decrypt hallazgos.enc
├── config.example.json      # Config template (copy to config.json)
├── aes.key                  # AES-256 key (auto-generated, do not commit)
├── lib/
│   ├── candidates.js        # Phrase variant + bigram generator
│   ├── derive.js            # 6 private key derivation strategies
│   ├── etherscan.js         # Multi-chain EVM balance checks via public RPC
│   ├── logger.js            # Colored terminal + progress bar + ETA + summary
│   ├── multicoin.js         # BTC/LTC/DOGE/TRX/SOL derivation & balance
│   ├── scraper.js           # URL scraping + tokenization + stop-word filter
│   ├── storage.js           # AES-GCM encryption & findings storage
│   └── util.js              # Rate limiter, concurrency, retry, time formatting
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

The AES key is auto-generated in `aes.key` on first run.
**Back up this file** — it is required to decrypt `hallazgos.enc`.

---

## Usage

```bash
node index.js
# or
npm start
```

### CLI Options

```bash
node index.js --coins=eth,btc          # Limit coins
node index.js --chains=1,56            # Limit EVM chains
node index.js --strategies=sha256,md5  # Limit hashing strategies
node index.js --help                   # Show help
```

> CLI arguments always override `config.json`.

### Default Configuration (config.json)

Copy `config.example.json` to `config.json` and adjust:

```json
{
  "coins":       "eth,btc,ltc,doge,trx,sol",
  "chains":      "1,56,137,42161",
  "strategies":  "sha256,doubleSha256,keccak256,sha256NoSpace,sha256Lower,md5",
  "chunkSize":   1000,
  "concurrency": 5,
  "rateLimit":   5
}
```

`config.json` is in `.gitignore` — it will never be committed to your repository.

### Checkpoint & Resume

If the process is interrupted (Ctrl+C or crash), progress is automatically saved to `progress.json`.
On the next run, the tool will offer to resume:

```
▶ Checkpoint Found
──────────────────────────────────────────────────────
14:05:01 [INF] URL        : https://en.wikipedia.org/wiki/Bitcoin
14:05:01 [INF] Progress   : block 2/5 done
14:05:01 [INF] Checked    : 4200 addresses, found: 0

  Resume from checkpoint? (y/n) >
```

### Decrypt Findings

```bash
node decrypt.js
# or
npm run decrypt
```

---

## Workflow

```
URL Input
   │
   ▼
Scraping & Tokenization + Stop-Word Filter
   │
   ▼
Generate Variants + Bigrams
   │  (lowercase, uppercase, capitalize, suffixes, 2-word combos)
   ▼
Private Key Derivation ──── 6 hashing strategies
   │
   ▼
Parallel Balance Checks (per coin & chain)
   ├── ETH  → Ethereum, BNB Chain, Polygon, Arbitrum  (public RPC)
   ├── BTC  → blockchain.info
   ├── LTC  → Blockchair
   ├── DOGE → Blockchair
   ├── TRX  → TronGrid
   └── SOL  → Solana public RPC
   │
   ▼
Findings → hallazgos.enc (AES-256-GCM) + found.txt
           + terminal bell + per-coin summary
```

---

## Default Configuration

| Parameter | Value | Description |
|---|---|---|
| `chains` | 1, 56, 137, 42161 | ETH · BNB Chain · Polygon · Arbitrum |
| `coins` | eth, btc, ltc, doge, trx, sol | All coins |
| `strategies` | sha256, doubleSha256, keccak256, sha256NoSpace, sha256Lower, md5 | All strategies |
| `chunkSize` | 1000 | Words per block |
| `concurrency` | 5 | Parallel requests |
| `rateLimit` | 5 | Requests/second (EVM) |
| `batchSize` | 20 | Addresses per EVM batch |

---

## Theory

A brainwallet generates a private key from a memorized phrase. The weakness: if the phrase is predictable, the key can be found.

- Ethereum private key space: **2²⁵⁶** possibilities (~10⁷⁷)
- Fully random key: success probability ≈ 0
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
- `aes.key`, `config.json`, `hallazgos.enc`, `found.txt` are all in `.gitignore`
- Use only in controlled environments and with appropriate authorization
