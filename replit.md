# Ethereum Brainwallet Auditor

## Overview
Node.js CLI tool that derives Ethereum private keys from weak "brainwallet" phrases (SHA-256), optionally queries Etherscan for balance/activity, and stores results encrypted with AES-GCM. Script messages are in Indonesian.

## Project Type
Command-line script (no frontend, no backend server).

## Stack
- Node.js 20
- Dependencies: `ethers`, `dotenv`

## Entry Point
`auditor_brainwallet.js` — reads `rockyou.txt` if present (in 1000-line chunks, with progress saved to `progress.txt`), otherwise falls back to a small built-in wordlist.

Auxiliary: `decrypt.js` decrypts result files (`hallazgos.enc`, `hallazgos_con_fondos.enc`).

## Configuration
Environment variables (read from `.env`):
- `AUDITOR_AES_KEY` — 64 hex chars (32 bytes) for AES-GCM encryption
- `ETHERSCAN_API_KEY` — optional; if missing, network queries are skipped

## Workflow
- `Auditor` — runs `node auditor_brainwallet.js` as a console process.

## Documentation
- `README.md` — Bahasa Indonesia
- `README-en.md` — English

## Notes
- The bundled Etherscan API key targets the deprecated V1 endpoint; the script logs errors and continues. Migrating to Etherscan API V2 would require code changes.
- `rockyou.txt` is not bundled; without it, the script uses a tiny default wordlist.
