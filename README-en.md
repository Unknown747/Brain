<p align="center"><a href="./README.md">Bahasa Indonesia</a> | English</p>

# Brainwallet Auditor

[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Purpose](https://img.shields.io/badge/Purpose-Security_Research-red.svg)](#security)
[![EVM](https://img.shields.io/badge/EVM-19_chains-purple.svg)](#default-configuration)
[![Coins](https://img.shields.io/badge/Coins-BTC_LTC_DOGE_BCH_DASH_ZEC_SOL_ADA-orange.svg)](#default-configuration)

---

## Description

**Brainwallet Auditor** is a security research tool for detecting cryptocurrency wallets created from weak phrases (*brainwallets*). It:

1. Fetches text from URLs → extracts **priority phrases** (title, headings, blockquotes, quoted strings), **regular phrases** (4–10 word sentences + 3/4/5-grams), and **single words**.
2. Generates thousands of **mutation variants** (case, suffix, prefix, year, leetspeak, camelCase/PascalCase/snake_case/kebab-case/phrase-initials).
3. Derives private keys using **15 derivation strategies** (10 default + 5 opt-in).
4. Checks balances across **27 blockchain networks** in parallel (19 EVM + BTC/LTC/DOGE/BCH/DASH/ZEC/SOL/ADA).
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

### Scraper
| Feature | Detail |
|---|---|
| **Parallel fetch** | URLs fetched concurrently (concurrency 5) — 19-URL preset ~3-5× faster |
| **HTTP 304 caching** | ETag & Last-Modified stored per URL; unchanged pages aren't re-downloaded |
| **Persistent token cache** | Words & phrases already produced are skipped across sessions (auto-prune at 500k) |
| **Pre-strip noise** | `<script>/<style>/<svg>/<iframe>` removed once upfront — priority regex runs on much smaller string |
| **HTML cap 8 MB** | Pathological pages truncated automatically to prevent catastrophic backtracking |
| **3-layer extraction** | (1) priority: title/h1-h3/blockquote/quoted strings · (2) phrases: 4–10 word sentences + 3/4/5-grams · (3) single words |
| **Multi-language stop-words** | EN, ID, ES, RU, AR, JP, KR, ZH (single-words filtered; phrases keep stop-words) |
| **Wikipedia-aware** | Strips wiki artifacts (`[edit]`, `[citation needed]`, ISBN/DOI/arXiv, navbox, hatnote, IPA, birth-death dates) + multi-word proper-noun explosion |
| **Italics/bold extraction** | `<i>/<em>/<b>/<strong>/<cite>` tags also harvested |
| **Built-in URL presets** | 11 ready-to-use presets including `wikiquote-mix` (19 famous-people pages) |

### Mutation & derivation
| Feature | Detail |
|---|---|
| **Word mutations** | case, suffix (!, 123, 2024…), prefix (the, my…), years (1990–2026), leetspeak, reverse |
| **Phrase mutations** | no-space, camelCase, PascalCase, snake_case, kebab-case, initials ("to be or not to be" → `tbontb`) |
| **Intensity levels** | `light` (~5/item) · `medium` (~25/item, default) · `heavy` (~80/item) |
| **Cross-block variant dedup** | Variants seen in any earlier block are not re-processed in the same session |
| **15 derivation strategies** | 10 default fast: SHA-256, Double-SHA-256, Keccak-256, SHA-256 (no space / lower), MD5→SHA-256, PBKDF2, scrypt, HMAC-Bitcoin-Seed, BIP39 seed. 5 opt-in: argon2 / argon2d (heavy KDF), bip44eth (BIP39 → m/44'/60'/0'/0/0), electrum (legacy), warpwallet (scrypt+pbkdf2 layered) |

### Balance check
| Feature | Detail |
|---|---|
| **Multi-chain EVM (19 chains)** | Ethereum, BNB, Polygon, Arbitrum, Optimism, Base, Avalanche, Gnosis, Linea, Scroll, zkSync Era, Fantom, Cronos, Celo, Moonbeam, Mantle, Blast, opBNB, Polygon zkEVM |
| **Non-EVM coins** | BTC, LTC, DOGE, BCH, DASH, ZEC, SOL, ADA |
| **Contract detection** | Addresses that are contracts are auto-flagged (`eth_getCode`) |
| **ERC-20 token check** | Popular stablecoins & tokens checked per chain (USDT/USDC/DAI/BUSD/etc.) |
| **JSON-RPC batch (EVM)** | Many addresses per request — much faster (auto-split if too big) |
| **Per-chain batch & timeout** | Rate-limit-sensitive chains (Arbitrum/Linea/Scroll/zkSync) use smaller batches & longer timeouts |
| **"Race" mode for Arbitrum** | 2 healthy endpoints fired in parallel — winner wins, rest aborted |
| **Multi-RPC fallback + circuit breaker** | 7–12 public endpoints per chain (drpc, llamarpc, publicnode, ankr, 1rpc, blast, onfinality, omniatech); failed endpoints cooldown 60s, sticky to last-good endpoint |
| **RPC health cache** | Stored in `.rpc_health.json` — next session immediately uses healthy endpoints |
| **Parallel checks** | All coins & chains checked simultaneously |

### User experience
| Feature | Detail |
|---|---|
| **Pre-audit estimate** | Before starting, calibrates 50 variants → shows projected total variants, derivations, address checks & finish time |
| **Live speed & ETA** | Per-block progress bar with estimated finish time |
| **Checkpoint & resume** | Ctrl+C anytime — progress saved and can be resumed |
| **Encrypted findings** | AES-256-GCM (frame-based, append-only) to `hallazgos.enc` |
| **Bell notification** | Terminal beeps when a funded wallet is found |
| **Per-coin summary** | Table of addresses checked & finds per coin at session end |
| **config.json only** | No CLI flags — all settings via `config.json` (object toggles for each coin/chain/strategy) |

---

## Project Structure

```
brainwallet-auditor/
├── index.js                  # CLI entry (config.json only, no flags)
├── auditor_brainwallet.js    # Main audit orchestrator (estimate + run + checkpoint)
├── decrypt.js                # Decrypts hallazgos.enc → stdout
├── config.example.json       # Configuration template (copy to config.json)
├── lib/
│   ├── candidates.js         # Mutation variant generator (light/medium/heavy)
│   ├── chainlist.js          # Auto-discovery of public RPCs from chainlist.org
│   ├── derive.js             # 15 derivation strategies (10 default + 5 opt-in)
│   ├── etherscan.js          # Multi-chain EVM RPC + JSON-RPC batch + race + fallback
│   ├── httpStats.js          # HTTP retry counter per endpoint
│   ├── logger.js             # Colored terminal + progress bar + ETA + summaries
│   ├── multicoin.js          # Non-EVM derivation & balance (BTC/LTC/DOGE/BCH/DASH/ZEC/SOL/ADA)
│   ├── notify.js             # Start/find notifications (Telegram/Discord, optional)
│   ├── rpcHealthCache.js     # RPC health score persistence to .rpc_health.json
│   ├── rpcStats.js           # Per-endpoint ok/fail/latency tracker (live)
│   ├── scrapeCache.js        # Persistent words + phrases + ETag/Last-Modified per URL
│   ├── scraper.js            # Parallel scrape + 304 caching + 3-layer extraction
│   ├── sources.js            # Built-in URL presets
│   ├── storage.js            # AES-GCM frame encryption + in-memory address cache
│   ├── tokens.js             # Popular ERC-20 tokens per chain
│   └── util.js               # Rate limiter, concurrency, retry, conditional GET
├── tests/                    # Unit tests (node --test)
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

# Install dependencies
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

### Non-interactive

Set `url` in `config.json` to your preset/URL, then run `node index.js`. All settings are read from `config.json` — **no CLI flags**.

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

### Configuration (config.json)

Copy `config.example.json` to `config.json`, edit it, run `node index.js`. Each variable has an `_varName` description key above it (JSON has no comments). Short example:

```json
{
  "url":       "einstein",
  "intensity": "medium",

  "coins": {
    "eth": true, "btc": true, "btc-bech32": true,
    "ltc": true, "doge": true, "sol": true, "ada": true,
    "bch": false, "dash": false, "zec": false
  },

  "chains": {
    "ethereum": true, "bnb": true, "polygon": true,
    "arbitrum": true, "optimism": true, "base": true,
    "avalanche": true, "linea": true,
    "fantom": false, "gnosis": false, "scroll": false, "zksync": false,
    "cronos": false, "celo": false, "moonbeam": false, "mantle": false,
    "blast": false, "opbnb": false, "polygon-zkevm": false
  },

  "strategies": {
    "sha256": true, "doubleSha256": true, "keccak256": true,
    "sha256NoSpace": true, "sha256Lower": true, "md5": true,
    "pbkdf2": true, "scrypt": true,
    "hmacBitcoinSeed": true, "bip39Seed": true,
    "argon2": false, "argon2d": false,
    "bip44eth": false, "electrum": false, "warpwallet": false
  },

  "checkContract": true,
  "checkTokens":   true,
  "scanAllAddressesForTokens": true,

  "chunkSize":   1000,
  "concurrency": 5,
  "rateLimit":   5,
  "batchSize":   80,
  "logLevel":    "info"
}
```

`config.json` is in `.gitignore` — it won't be committed. See `config.example.json` for the full description of every field.

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
Parallel scraping (concurrency 5)
   │  - HTTP 304: unchanged URLs skip fetch & parse entirely
   │  - pre-strip <script>/<style>/<svg>/<iframe>
   │  - 8 MB HTML cap
   │  - 3-layer extraction: priority / phrases / words
   │  (words & phrases already in token cache are auto-skipped)
   ▼
Pre-audit estimate   ← calibrate 50 variants, predict total time
   ▼
Generate mutation variants     ← cross-block dedup
   │  - words : case/suffix/prefix/year/leetspeak/reverse
   │  - phrase: no-space/camelCase/PascalCase/snake_case/
   │            kebab-case/phrase-initials (e.g. "tbontb")
   ▼
Derive private key  ── 10 default strategies + 5 opt-in
   ▼
Parallel balance checks (per coin & chain)   ← in-memory address dedup
   ├── ETH  → 19 EVM chains (JSON-RPC batch + race + circuit breaker)
   ├── BTC/LTC/DOGE/BCH/DASH/ZEC → blockchain.info / mempool.space / Blockchair
   ├── SOL  → Public Solana RPC (multi-endpoint fallback)
   └── ADA  → Koios
   │
   ▼
Findings → hallazgos.enc (AES-256-GCM) + found.txt
           + bell + notify (optional) + per-coin summary + RPC table
```

---

## Default configuration (config.json)

| Parameter | Default value | Description |
|---|---|---|
| `coins` (on) | eth, btc, btc-bech32, ltc, doge, sol, ada | 7 top coins (BCH/DASH/ZEC off — virtually never carry brainwallet balance) |
| `chains` (on) | ethereum, bnb, polygon, arbitrum, optimism, base, avalanche, linea | 8 busiest EVM chains (11 minor chains off) |
| `strategies` (on) | sha256, doubleSha256, keccak256, sha256NoSpace, sha256Lower, md5, pbkdf2, scrypt, hmacBitcoinSeed, bip39Seed | 10 fast strategies (5 expensive KDFs off) |
| `checkContract` | true | Flag addresses that are contracts |
| `checkTokens` | true | Check popular ERC-20 token balances per chain |
| `scanAllAddressesForTokens` | true | Check tokens for ALL addresses (not only those with native balance) |
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

**Pre-audit estimate:**
```
▶ Estimate
──────────────────────────────────────────────────────────
[INF] Token corpus     : 29,626
[INF] Total variants   : ~1,305,025 (44.0/token, medium intensity)
[INF] Total derivations: ~13,050,250 (10 strategies)
[INF] Total addresses  : ~91,351,750 (7 coins)
[INF] Estimated time   : ~53h 58m 38s  (calibration: 106.90 ms/variant)
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
| `.scrape_cache.json` | Words + phrases + per-URL ETag/Last-Modified (auto-prune at 500k) | gitignored |
| `.rpc_health.json` | RPC endpoint health score persisted across sessions | gitignored |
| `progress.json` | Session checkpoint (auto-deleted on completion) | gitignored |
| `config.json` | Local configuration | gitignored |

> Delete `.scrape_cache.json` to reset the scrape cache (tokens + URL ETags).

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

Runtime dependencies: **ethers v6** (EVM pubkey & address) + **@noble/hashes** (PBKDF2/scrypt/argon2/HMAC) + **@noble/curves** (BIP32/secp256k1 for BIP44 & SOL/ADA).

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
