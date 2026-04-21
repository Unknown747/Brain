# Brainwallet Auditor

Node.js CLI yang men-scrape teks dari URL, memfilter stop-words, menghasilkan
varian + bigram, lalu mengecek saldo di 10 jaringan blockchain secara paralel
menggunakan API publik gratis tanpa API key.

## Cara pakai
```
node index.js                          # tanya URL, cek semua koin default
node index.js --coins=eth,btc,sol      # batasi koin
node index.js --chains=1,56            # batasi chain EVM
node index.js --strategies=sha256,md5  # batasi strategi hashing
node decrypt.js                        # tampilkan isi hallazgos.enc
```

Saat dijalankan, script akan menanyakan URL (bisa lebih dari satu, pisahkan koma).
Jika ada `progress.json` (checkpoint), script akan menawarkan untuk melanjutkan sesi sebelumnya.

## Konfigurasi default (config.json)
Salin `config.example.json` ke `config.json` untuk menyimpan konfigurasi default.
CLI args selalu mengalahkan config.json.

## Stack
- Node.js 20
- Dependensi: `ethers` saja

## Koin & sumber saldo (semua gratis, tanpa API key)
| Koin | Sumber |
|------|--------|
| ETH, BNB, Polygon, Arbitrum (EVM) | RPC publik llamarpc / publicnode |
| BTC  | blockchain.info (50 alamat per request) |
| LTC  | blockchair.com (100 per request) |
| DOGE | blockchair.com (100 per request) |
| TRX  | TronGrid |
| SOL  | RPC publik Solana (getMultipleAccounts, 100 per request) |

## Strategi derivasi (semua aktif secara default)
| Nama | Deskripsi |
|------|-----------|
| sha256 | SHA-256 standar — paling umum |
| doubleSha256 | SHA-256(SHA-256) — era awal |
| keccak256 | Hash native Ethereum |
| sha256NoSpace | SHA-256 tanpa spasi |
| sha256Lower | SHA-256 lowercase |
| md5 | SHA-256(MD5) — pola brainwallet era 2011–2013 |

## Fitur utama
- **Stop-words filter**: kata umum (the, and, is ...) dibuang sebelum diproses
- **Bigram**: kombinasi 2 kata berdekatan ikut dicek
- **Retry otomatis**: exponential backoff saat API gagal (maks 3×)
- **Checkpoint & resume**: simpan progres, bisa dilanjutkan setelah Ctrl+C
- **Cache in-memory**: tidak ada file cache alamat yang ditulis ke disk
- **ETA & kecepatan**: live di terminal per blok
- **Ringkasan per koin**: tabel di akhir sesi
- **Bell notification**: terminal berbunyi saat wallet berdana ditemukan

## Struktur
```
index.js                   CLI (tanya URL, load config.json, deteksi checkpoint)
auditor_brainwallet.js     Orkestrator: scrape → derive → cek saldo → checkpoint → simpan
decrypt.js                 Dekripsi & tampilkan hallazgos.enc
config.example.json        Template konfigurasi
lib/scraper.js             Scrape URL + filter stop-words + cache anti-pengulangan kata
lib/candidates.js          Varian kata tunggal + bigram
lib/derive.js              6 strategi derivasi private key
lib/etherscan.js           RPC publik multi-chain EVM + retry
lib/multicoin.js           Derivasi & saldo BTC/LTC/DOGE/TRX/SOL + retry
lib/storage.js             AES-GCM frame, found.txt, AddressCache in-memory
lib/util.js                chunkArray, rate-limiter, concurrency, withRetry, durasi
lib/logger.js              Logger berwarna + progress bar + ETA + coinSummary
```

## File yang dihasilkan saat runtime
| File | Isi | Git |
|------|-----|-----|
| `aes.key`         | Kunci AES-256 (auto-generate) | gitignored |
| `hallazgos.enc`   | Temuan terenkripsi (AES-GCM) | gitignored |
| `found.txt`       | Temuan plain text, tab-separated | gitignored |
| `words_cache.txt` | Kata-kata yang sudah pernah di-scrape | gitignored |
| `progress.json`   | Checkpoint sesi (auto-delete saat selesai) | gitignored |

> Cache alamat hanya di memori — tidak ada file cache alamat yang ditulis ke disk.

## Workflow
- `Auditor` — `node index.js`

## Catatan keamanan
- Hanya alamat dengan saldo > 0 yang disimpan.
- `aes.key` JANGAN dihapus — tanpa kunci, `hallazgos.enc` tidak bisa didekripsi.
- Semua file sensitif & file runtime sudah ada di `.gitignore`.
