# Ethereum Brainwallet Auditor

## Overview
Node.js 20 CLI that derives Ethereum private keys from weak "brainwallet" phrases using multiple derivation strategies, queries Etherscan V2 across multiple EVM chains for balances, and stores funded wallets encrypted with AES-GCM. Script messages are in Bahasa Indonesia.

## Project Type
Command-line script (no frontend, no backend server).

## Stack
- Node.js 20
- Dependencies: `ethers` (only)

## Entry Point
`index.js` — CLI parser. Loads config from `config.json`, builds options, calls `auditor_brainwallet.js#runAudit`.

Auxiliary: `decrypt.js <file>` decrypts the framed `hallazgos.enc` file and prints records.

## Modules (`lib/`)
- `logger.js` — leveled colored logger (debug/info/warn/error/success).
- `util.js` — concurrency pool, rate limiter (token-bucket), ETA helper, duration formatter.
- `derive.js` — 5 derivation strategies: `sha256`, `doubleSha256`, `keccak256`, `sha256NoSpace`, `sha256Lower`.
- `candidates.js` — generates phrase variants from a wordlist chunk.
- `etherscan.js` — Etherscan V2 client (`balancemulti`, `txlist`) with multi-chain support and rate-limit retry.
- `storage.js` — framed AES-GCM append format `[4B len][12B nonce][ct][16B tag]`, `found.txt` writer, `AddressCache`.

## Configuration (`config.json`, gitignored)
| Key | Default | Purpose |
|---|---|---|
| `AUDITOR_AES_KEY` | — | 64 hex chars (32 bytes) AES-256-GCM key |
| `ETHERSCAN_API_KEY` | — | V2 API key (skips network if absent) |
| `wordlist` | `rockyou.txt` | Input dictionary |
| `chunkSize` | 1000 | Lines per block |
| `batchSize` | 20 | Addresses per `balancemulti` call |
| `concurrency` | 2 | Parallel workers |
| `rateLimit` | 2 | Requests per second |
| `chains` | `[1,10,56,137,8453,42161]` | Chain IDs to monitor |
| `strategies` | `["sha256","keccak256","doubleSha256"]` | Derivation strategies |
| `logLevel` | `info` | `debug`/`info`/`warn`/`error` |
| `outFile` | `hallazgos.enc` | Encrypted output |
| `foundFile` | `found.txt` | Plaintext list of funded wallets only |
| `cacheFile` | `cache.txt` | Address de-dup cache |
| `progressFile` | `progress.json` | Block checkpoint |

CLI flags override config values: `--wordlist`, `--chunk`, `--concurrency`, `--rate`, `--batch`, `--chains`, `--strategies`, `--log`, `--dry-run`, `--reset-progress`, `--no-eta`.

Supported chains: `1` Ethereum, `10` Optimism, `56` BNB, `137` Polygon, `8453` Base, `42161` Arbitrum, `43114` Avalanche.

## Output
- `hallazgos.enc` — framed AES-GCM, contains funded-wallet JSON records.
- `found.txt` — append-only plaintext, only entries with balance > 0.
- `cache.txt` — sticky address cache to avoid re-querying.
- `progress.json` — checkpoint of next block index.

## Workflow
- `Auditor` — runs `node index.js`.

## Documentation
- `README.md` — Bahasa Indonesia
- `README-en.md` — English

## Notes
- Only funded wallets (`balance > 0`) are persisted to `found.txt` and `hallazgos.enc`.
- Etherscan V2 endpoint: `https://api.etherscan.io/v2/api?chainid=<id>&...`. Free-tier keys are limited to ~3 req/sec; defaults are tuned to 2 req/sec for safety.
- `rockyou.txt` is not bundled; without it, a tiny built-in sample list is used.
