# Brainwallet Auditor

Node.js CLI yang men-scrape teks dari URL, mengekstrak frasa prioritas
(title/heading/blockquote/kutipan) + frasa biasa (kalimat 4–10 kata,
n-gram 3/4/5) + kata tunggal + tahun-konteks, menghasilkan banyak varian
mutasi, lalu mengecek saldo di **27 jaringan blockchain** (18 EVM + 9 non-EVM)
secara paralel via API publik gratis tanpa API key. Termasuk deteksi
smart-contract, cek saldo ERC-20 utama, notifikasi Telegram/Discord, dan
resume cerdas.

## Cara pakai
```
node index.js                          # tanya URL, cek semua koin default
node index.js --urls=einstein          # langsung pakai preset bawaan
node index.js --urls=einstein,bitcoin  # gabung beberapa preset/URL
node index.js --sources                # daftar preset URL bawaan
node index.js --coins=eth,btc,sol      # batasi koin
node index.js --chains=1,56            # batasi chain EVM
node index.js --strategies=sha256,md5  # batasi strategi hashing
node index.js --intensity=heavy        # tingkat mutasi: light | medium | heavy
node index.js --checkContracts=false   # matikan deteksi smart-contract
node index.js --checkTokens=false      # matikan cek ERC-20
node index.js --tokenScope=all         # cek ERC-20 utk SEMUA alamat (default: rich saja)
node index.js --autoDiscoverRpcs=true  # tarik RPC tambahan dari chainlist.org
node index.js --preview=30             # pratinjau item teratas
node decrypt.js                        # tampilkan isi hallazgos.enc
npm test                               # jalankan unit test
```

## Konfigurasi default (config.json)
Salin `config.example.json` ke `config.json` untuk menyimpan konfigurasi
default termasuk blok `notify` (Telegram bot token & chatId, Discord webhook
URL). CLI args selalu mengalahkan config.json.

## Stack
- Node.js 20
- Dependensi: `ethers`, `@noble/curves`, `@noble/hashes`

## Koin & sumber saldo (semua gratis, tanpa API key)
| Koin | Sumber |
|------|--------|
| **18 EVM** — Ethereum, BNB, Polygon, Arbitrum, Optimism, Base, Avalanche, Gnosis, Linea, Scroll, zkSync Era, Cronos, Celo, Moonbeam, Mantle, Blast, opBNB, Polygon zkEVM | 5–12 RPC publik per chain (publicnode, llamarpc, ankr, drpc, blastapi, 1rpc, onfinality, omniatech, meowrpc, …) dengan circuit breaker 60s + sticky last-good + race-mode (Arbitrum). Auto-discovery chainlist.org opsional. |
| **BTC** legacy (P2PKH `1...`) + bech32 (P2WPKH `bc1...`) | blockchain.info → mempool.space fallback |
| **LTC** | blockchair.com |
| **DOGE** | blockchair.com |
| **BCH** (cashaddr) | blockchair.com |
| **DASH** | blockchair.com |
| **ZEC** transparent (`t1...`) | blockchair.com |
| **SOL** | RPC publik Solana (getMultipleAccounts, multi-endpoint failover) |
| **ADA** Shelley enterprise (`addr1...`) | api.koios.rest |

## Strategi derivasi (10 default cepat + 5 opsional mahal)
Default selalu dipakai setiap audit. Opsional **TIDAK** dipakai kecuali Anda
menambahkannya manual lewat `--strategies=...` atau `config.json` — jadi
kecepatan generasi brainwallet default tidak ikut melambat.

| Nama | Deskripsi | Biaya/derive |
|------|-----------|--------------|
| sha256 | SHA-256 standar — paling umum | mikrodetik |
| doubleSha256 | SHA-256(SHA-256) — era awal | mikrodetik |
| keccak256 | Hash native Ethereum | mikrodetik |
| sha256NoSpace | SHA-256 tanpa spasi | mikrodetik |
| sha256Lower | SHA-256 lowercase | mikrodetik |
| md5 | SHA-256(MD5) — pola brainwallet 2011–2013 | mikrodetik |
| pbkdf2 | PBKDF2-SHA256, salt="brainwallet", 2048 iter | <1 ms |
| scrypt | Brainwallet.io 2013–2015 (N=2¹⁴, r=8, p=1) | ~30–80 ms |
| hmacBitcoinSeed | HMAC-SHA512 key="Bitcoin seed" → master BIP32 | mikrodetik |
| bip39Seed | PBKDF2-SHA512 salt="mnemonic" → BIP39 seed | <1 ms |
| **argon2** (opsional) | Argon2id m=4MB, t=1 | ~50–150 ms |
| **argon2d** (opsional) | Argon2d  m=4MB, t=1 — varian data-dependent | ~50–150 ms |
| **bip44eth** (opsional) | BIP39 seed → BIP32 m/44'/60'/0'/0/0 (path MetaMask) | ~1 ms |
| **electrum** (opsional) | PBKDF2-SHA512 salt="electrum" 2048 iter (Electrum 2.x) | <1 ms |
| **warpwallet** (opsional) | scrypt(N=2¹⁸) XOR PBKDF2(2¹⁶) — KDF asli WarpWallet | **~1–3 detik** |

Contoh aktifkan strategi opsional:
```
node index.js --strategies=sha256,bip44eth,electrum
node index.js --strategies=warpwallet --limit=200   # warpwallet sangat lambat
```

## Fitur utama
- **Scraper cerdas** dengan stop-words 8 bahasa (EN/ID/ES/RU/AR/JP/KR/ZH)
- **Frasa prioritas**: title/h1-h3/blockquote/kutipan/proper-noun diaudit duluan
- **Tahun-konteks** (#12): tahun 1900–2030 dari halaman dipasangkan dengan
  setiap frasa → "stevejobs1955", "SteveJobs2011", dst.
- **Mutasi password**: case, suffix, prefix, tahun, leetspeak, reverse,
  camelCase/PascalCase/snake_case/kebab-case + inisial frasa
- **Multi-chain JSON-RPC batch** dengan circuit breaker, sticky-last-good,
  race-mode, batch auto-split
- **Auto-discovery RPC** (#25, opsional) dari chainid.network — endpoint
  publik baru ditarik & ditambahkan, dengan cache 7 hari
- **Deteksi smart-contract** (#3): `eth_getCode` batch — temuan ditandai
  `[CONTRACT]` di found.txt agar tidak salah klaim "kunci ditemukan"
- **Cek ERC-20 utama** (#4): USDT, USDC, DAI, WETH, WBTC dll per chain via
  `eth_call balanceOf` batch — banyak brainwallet hanya punya stable
- **Notifikasi Telegram/Discord** (#19, opt-in): kirim alamat & saldo saat
  temuan masuk. Default **TIDAK** mengirim private key (atur `includePrivKey`)
- **Resume cerdas** (#23): checkpoint v2 menyimpan `AddressCache` &
  `seenVariants` — alamat yang sudah pernah dicek tidak diulang
- **Pratinjau cepat** `--preview=N`
- **Unit tests** (`npm test`) — 27 test untuk derive/candidates/scraper/multicoin

## Struktur
```
index.js                   CLI (tanya URL/preset, load config, deteksi checkpoint)
auditor_brainwallet.js     Orkestrator: scrape → derive → cek saldo → token → contract
decrypt.js                 Dekripsi & tampilkan hallazgos.enc
config.example.json        Template konfigurasi termasuk blok notify
lib/scraper.js             Scrape URL + ekstraksi kata/frasa/tahun + stop-words 8 bahasa
lib/scrapeCache.js         Cache persisten kata/frasa antar sesi
lib/sources.js             Preset URL bawaan (einstein, bible, crypto-pioneers, …)
lib/candidates.js          Generator varian mutasi + kombinasi tahun-konteks
lib/derive.js              15 strategi derivasi (10 default + 5 opsional: argon2/argon2d/bip44eth/electrum/warpwallet)
lib/etherscan.js           18 chain EVM + JSON-RPC batch + fallback + getCode + tokenBalances
lib/multicoin.js           9 koin non-EVM (BTC legacy/bech32, LTC, DOGE, BCH, DASH, ZEC, SOL, ADA)
lib/tokens.js              Registry ERC-20 untuk 18 chain
lib/chainlist.js           Auto-discovery RPC publik dari chainid.network
lib/notify.js              Notifikasi Telegram/Discord (aman, tanpa privkey)
lib/rpcStats.js            Pelacak kesehatan tiap endpoint
lib/storage.js             AES-GCM frame, found.txt, AddressCache serializable
lib/util.js                chunkArray, rate-limiter, concurrency, withRetry
lib/logger.js              Logger berwarna + progress bar + ETA + ringkasan
tests/                     Unit tests (derive, candidates, scraper, multicoin)
```

## File yang dihasilkan saat runtime
| File | Isi | Git |
|------|-----|-----|
| `aes.key`               | Kunci AES-256 (auto-generate) | gitignored |
| `hallazgos.enc`         | Temuan terenkripsi (AES-GCM)  | gitignored |
| `found.txt`             | Temuan plain text, tab-separated | gitignored |
| `.scrape_cache.json`    | Cache token yang sudah di-scrape | gitignored |
| `progress.json`         | Checkpoint v2 (urls/words/years/AddressCache/seenVariants) | gitignored |
| `.chainlist_cache.json` | Cache hasil auto-discovery RPC (TTL 7 hari) | gitignored |

## Catatan keamanan
- Hanya alamat dengan saldo > 0 yang disimpan.
- `aes.key` JANGAN dihapus — tanpa kunci, `hallazgos.enc` tidak bisa didekripsi.
- Notifikasi default TIDAK mengirim private key. Untuk mengirim privkey,
  set `notify.includePrivKey = true` di config.json (TIDAK disarankan).
- Semua file sensitif & file runtime sudah ada di `.gitignore`.

## Workflow
- `Auditor` — `node index.js` (interaktif)

## Tes
- `npm test` — 27 unit test, semua harus lulus.
