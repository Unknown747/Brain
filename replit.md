# Brainwallet Auditor

Node.js CLI yang men-scrape teks dari URL, mengekstrak kata + frasa nyata
(kalimat 4–10 kata, n-gram 4/5), menghasilkan varian mutasi yang banyak,
lalu mengecek saldo di 10 jaringan blockchain secara paralel menggunakan
API publik gratis tanpa API key.

## Cara pakai
```
node index.js                          # tanya URL, cek semua koin default
node index.js --urls=einstein          # langsung pakai preset bawaan (non-interaktif)
node index.js --urls=einstein,bitcoin  # gabung beberapa preset/URL
node index.js --sources                # daftar preset URL bawaan
node index.js --coins=eth,btc,sol      # batasi koin
node index.js --chains=1,56            # batasi chain EVM
node index.js --strategies=sha256,md5  # batasi strategi hashing
node index.js --intensity=heavy        # tingkat mutasi: light | medium | heavy
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
- **Scraper cerdas**: HTML dibersihkan dari nav/footer/sidebar/script + filter token sampah (ALL-CAPS panjang, mayoritas digit, fragmen URL)
- **Frasa nyata**: ekstraksi kalimat utuh 4–10 kata + n-gram 4/5 dari urutan asli teks
- **Stop-words multi-bahasa**: EN + ID + ES (dipakai untuk kata tunggal; frasa tetap mempertahankan stop-words)
- **Mutasi password**: case, suffix (!, 123, 1234, 2024…), prefix (the, my…), tahun (1990–2026), leetspeak, reverse, camelCase/PascalCase untuk frasa
- **Tingkat intensitas**: `light` / `medium` / `heavy` — atur cakupan vs kecepatan
- **JSON-RPC batch (EVM)**: 1 request berisi banyak alamat, jauh lebih cepat
- **Multi-RPC fallback**: ETH/BSC/Polygon/Arbitrum/SOL/BTC otomatis pindah endpoint kalau gagal
- **Tabel kesehatan RPC**: lihat endpoint mana yang dipakai & berapa kali gagal di akhir sesi
- **Retry otomatis**: exponential backoff saat API gagal (maks 3×)
- **Checkpoint & resume**: simpan progres, bisa dilanjutkan setelah Ctrl+C
- **Cache in-memory**: tidak ada file cache alamat yang ditulis ke disk
- **ETA & kecepatan**: live di terminal per blok
- **Ringkasan per koin**: tabel di akhir sesi
- **Bell notification**: terminal berbunyi saat wallet berdana ditemukan

## Struktur
```
index.js                   CLI (tanya URL/preset, load config.json, deteksi checkpoint)
auditor_brainwallet.js     Orkestrator: scrape → derive → cek saldo → checkpoint → simpan
decrypt.js                 Dekripsi & tampilkan hallazgos.enc
config.example.json        Template konfigurasi
lib/scraper.js             Scrape URL + ekstraksi kata/frasa + filter stop-words
lib/scrapeCache.js         Cache persisten kata/frasa antar sesi (auto-prune)
lib/sources.js             Daftar preset URL bawaan (einstein, bible, …, all)
lib/candidates.js          Generator varian mutasi (light/medium/heavy)
lib/derive.js              6 strategi derivasi private key
lib/etherscan.js           RPC publik multi-chain EVM + JSON-RPC batch + fallback
lib/multicoin.js           Derivasi & saldo BTC/LTC/DOGE/SOL + retry
lib/rpcStats.js            Pelacak kesehatan tiap endpoint RPC
lib/storage.js             AES-GCM frame, found.txt, AddressCache in-memory
lib/util.js                chunkArray, rate-limiter, concurrency, withRetry, durasi
lib/logger.js              Logger berwarna + progress bar + ETA + coinSummary + rpcSummary
```

## File yang dihasilkan saat runtime
| File | Isi | Git |
|------|-----|-----|
| `aes.key`         | Kunci AES-256 (auto-generate) | gitignored |
| `hallazgos.enc`   | Temuan terenkripsi (AES-GCM) | gitignored |
| `found.txt`       | Temuan plain text, tab-separated | gitignored |
| `.scrape_cache.json` | Kata & frasa yang sudah pernah di-scrape (auto, persisten antar sesi) | gitignored |
| `progress.json`   | Checkpoint sesi (auto-delete saat selesai) | gitignored |

> Cache alamat hanya di memori — tidak ada file cache alamat yang ditulis ke disk.
> Cache scrape persisten — token (kata/frasa) yang sudah pernah di-scrape otomatis di-skip pada sesi berikutnya. Hapus `.scrape_cache.json` untuk reset.

## Workflow
- `Auditor` — `node index.js`

## Catatan keamanan
- Hanya alamat dengan saldo > 0 yang disimpan.
- `aes.key` JANGAN dihapus — tanpa kunci, `hallazgos.enc` tidak bisa didekripsi.
- Semua file sensitif & file runtime sudah ada di `.gitignore`.
