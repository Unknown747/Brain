# Ethereum Brainwallet Auditor

## Overview
Python CLI tool that derives Ethereum private keys from weak "brainwallet" phrases (SHA-256), optionally queries Etherscan for balance/activity, and stores results encrypted with AES-GCM.

## Project Type
Command-line script (no frontend, no backend server).

## Stack
- Python 3.12
- Dependencies: `requests`, `eth-account`, `cryptography`, `python-dotenv`

## Entry Point
`auditor_brainwallet.py` — reads `rockyou.txt` if present (in 1000-line chunks, with progress saved to `progress.txt`), otherwise falls back to a small built-in wordlist.

Auxiliary: `decrypt.py` decrypts result files (`hallazgos.enc`, `hallazgos_con_fondos.enc`).

## Configuration
Environment variables (read from `.env`):
- `AUDITOR_AES_KEY` — 64 hex chars (32 bytes) for AES-GCM encryption
- `ETHERSCAN_API_KEY` — optional; if missing, network queries are skipped

## Workflow
- `Auditor` — runs `python auditor_brainwallet.py` as a console process.

## Notes
- The bundled Etherscan API key targets the deprecated V1 endpoint; the script logs errors and continues. Migrating to Etherscan API V2 would require code changes (out of scope for the import).
- `rockyou.txt` is not bundled; without it, the script uses a tiny default wordlist.
