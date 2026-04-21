<p align="center">Bahasa Indonesia | <a href="./README-en.md">English</a></p>

# Brainwallet Auditor

[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Tujuan](https://img.shields.io/badge/Tujuan-Riset_Keamanan-red.svg)](#keamanan)
[![EVM](https://img.shields.io/badge/EVM-ETH_BSC_Polygon_Arbitrum-purple.svg)](#konfigurasi-default)
[![Koin](https://img.shields.io/badge/Koin-BTC_LTC_DOGE_TRX_SOL-orange.svg)](#konfigurasi-default)

---

## Deskripsi

**Brainwallet Auditor** adalah alat riset keamanan untuk mendeteksi dompet kripto yang dibuat dari frasa lemah (*brainwallet*). Alat ini:

1. Mengambil teks dari URL → mengekstrak **kata + frasa nyata** (kalimat 4–10 kata, n-gram 4/5).
2. Menghasilkan ribuan **varian mutasi** (case, suffix, prefix, tahun, leetspeak, camelCase/PascalCase/no-space).
3. Menurunkan private key memakai **6 strategi hashing** berbeda.
4. Mengecek saldo di **10 jaringan blockchain** secara paralel.
5. Retry otomatis (exponential backoff) jika API gagal.
6. Menyimpan checkpoint — bisa dilanjutkan jika proses dihentikan.
7. Menyimpan temuan secara terenkripsi (AES-256-GCM).
8. Menampilkan ringkasan per koin + kesehatan RPC di akhir sesi.

> ⚠️ Alat ini dibuat semata-mata untuk tujuan edukasi dan penelitian keamanan.

---

## Fitur

| Fitur | Detail |
|---|---|
| **Scraper cerdas** | HTML dibersihkan dari nav/footer/sidebar/script + filter token sampah |
| **Frasa nyata** | Ekstraksi kalimat utuh 4–10 kata + n-gram 4/5 dari urutan asli teks |
| **Stop-words multi-bahasa** | EN + ID + ES (untuk kata tunggal; frasa tetap mempertahankan stop-words) |
| **Cache scrape persisten** | Token yang sudah pernah di-scrape otomatis di-skip antar sesi (auto-prune) |
| **Preset URL bawaan** | 10 sumber siap pakai: einstein, shakespeare, bible, quran, taoteching, … |
| **Mutasi password** | case, suffix (!, 123, 2024…), prefix (the, my…), tahun (1990–2026), leetspeak, reverse, camelCase/PascalCase |
| **Tingkat intensitas** | `light` (~5/item) · `medium` (~25/item, default) · `heavy` (~80/item) |
| **6 strategi hashing** | SHA-256, Double-SHA-256, Keccak-256, SHA-256 (no space), SHA-256 (lower), MD5→SHA-256 |
| **Multi-chain EVM** | Ethereum, BNB Chain, Polygon, Arbitrum (dapat dikonfigurasi) |
| **Multi-koin** | BTC, LTC, DOGE, TRX, SOL |
| **JSON-RPC batch (EVM)** | Banyak alamat per request — jauh lebih cepat |
| **Multi-RPC fallback** | Otomatis pindah endpoint kalau satu RPC gagal/timeout |
| **Tabel kesehatan RPC** | Endpoint mana yang dipakai & berapa kali gagal di akhir sesi |
| **Retry otomatis** | Exponential backoff saat API gagal (maks 3×) |
| **Pengecekan paralel** | Semua koin & chain dicek bersamaan |
| **Kecepatan & ETA** | Ditampilkan live di terminal |
| **Checkpoint & resume** | Tekan Ctrl+C kapan saja — progres tersimpan, bisa dilanjutkan |
| **Cache alamat in-memory** | Tidak ada file cache alamat — setiap sesi mulai bersih |
| **Enkripsi temuan** | Hasil disimpan dengan AES-256-GCM |
| **Bell notification** | Terminal berbunyi saat wallet berdana ditemukan |
| **Ringkasan per koin** | Tabel alamat diperiksa & temuan per koin di akhir audit |
| **config.json** | Simpan konfigurasi default supaya tidak perlu mengetik ulang flag |

---

## Struktur Proyek

```
brainwallet-auditor/
├── index.js                  # Entry point CLI
├── auditor_brainwallet.js    # Orkestrator utama
├── decrypt.js                # Dekripsi hallazgos.enc
├── config.example.json       # Template konfigurasi (salin ke config.json)
├── lib/
│   ├── candidates.js         # Generator varian mutasi (light/medium/heavy)
│   ├── derive.js             # 6 strategi derivasi private key
│   ├── etherscan.js          # RPC publik multi-chain EVM + JSON-RPC batch + fallback
│   ├── logger.js             # Terminal berwarna + progress bar + ETA + ringkasan
│   ├── multicoin.js          # Derivasi & saldo BTC/LTC/DOGE/TRX/SOL
│   ├── rpcStats.js           # Pelacak kesehatan tiap endpoint RPC
│   ├── scrapeCache.js        # Cache persisten kata/frasa antar sesi
│   ├── scraper.js            # Scrape URL + ekstraksi kata/frasa + filter stop-words
│   ├── sources.js            # Daftar preset URL bawaan
│   ├── storage.js            # Enkripsi AES-GCM & penyimpanan temuan
│   └── util.js               # Rate limiter, concurrency, retry, format waktu
├── package.json
├── README.md
└── README-en.md
```

---

## Instalasi

```bash
# 1. Klon repositori
git clone https://github.com/Unknown747/Brain.git
cd Brain

# 2. Pastikan Node.js 20+ terpasang
node --version

# 3. Pasang dependensi (hanya ethers)
npm install
```

Kunci AES dibuat otomatis di `aes.key` saat pertama dijalankan.
**Backup file ini** — diperlukan untuk mendekripsi `hallazgos.enc`.

---

## Penggunaan

```bash
node index.js
# atau
npm start
```

### Mode interaktif

Saat dijalankan tanpa flag, script akan menanyakan URL atau nama preset.
Anda bisa mengetik:

- nama preset: `einstein`
- gabungan beberapa preset/URL: `einstein,bitcoin,https://situs-saya.com/data`
- `all` untuk audit semua preset bawaan sekaligus

### Mode non-interaktif (CLI)

```bash
node index.js --urls=einstein                  # Pakai preset bawaan langsung
node index.js --urls=einstein,bitcoin          # Gabung beberapa preset/URL
node index.js --urls=all                       # Audit semua preset bawaan
node index.js --sources                        # Tampilkan daftar preset bawaan
node index.js --coins=eth,btc,sol              # Batasi koin
node index.js --chains=1,56                    # Batasi chain EVM
node index.js --strategies=sha256,md5          # Batasi strategi hashing
node index.js --intensity=heavy                # Tingkat mutasi: light | medium | heavy
node index.js --help                           # Bantuan lengkap
```

> Argumen CLI selalu mengalahkan `config.json`.

### Preset URL bawaan

| Preset | Sumber |
|---|---|
| `einstein` | Wikiquote — Albert Einstein |
| `shakespeare` | Wikiquote — William Shakespeare |
| `twain` | Wikiquote — Mark Twain |
| `proverbs` | Wikiquote — English proverbs |
| `movies` | Wikiquote — List of films |
| `bible` | Project Gutenberg — King James Bible |
| `taoteching` | Project Gutenberg — Tao Te Ching |
| `quran` | Project Gutenberg — Quran (terjemahan) |
| `bitcoin` | Bitcoin whitepaper + Wikipedia |
| `quotes` | Gabungan: Einstein + Shakespeare + Twain + Proverbs |
| `all` | Semua preset di atas (10 URL unik) |

### Konfigurasi default (config.json)

Salin `config.example.json` ke `config.json` lalu sesuaikan:

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

`config.json` sudah ada di `.gitignore` — tidak akan ter-commit.

### Checkpoint & resume

Jika proses dihentikan (Ctrl+C atau crash), progres otomatis tersimpan ke `progress.json`.
Saat dijalankan kembali, program akan menawarkan untuk melanjutkan:

```
▶ Checkpoint Ditemukan
──────────────────────────────────────────────────────
[INF] URL        : https://en.wikipedia.org/wiki/Bitcoin
[INF] Progres    : blok 2/5 selesai
[INF] Diperiksa  : 4200 alamat, temuan: 0

  Lanjut dari checkpoint? (y/n) >
```

### Dekripsi hasil

```bash
node decrypt.js
# atau
npm run decrypt
```

---

## Alur Kerja

```
URL / preset
   │
   ▼
Scraping & ekstraksi kata + frasa nyata
   │  (filter stop-words, skip token yang sudah ada di cache persisten)
   ▼
Generate varian mutasi
   │  (case, suffix, prefix, tahun, leetspeak, camel/PascalCase, no-space)
   ▼
Derivasi private key  ── 6 strategi hashing
   │
   ▼
Cek saldo paralel (per koin & chain)
   ├── ETH  → Ethereum, BNB Chain, Polygon, Arbitrum  (JSON-RPC batch + fallback)
   ├── BTC  → blockchain.info  (+ fallback mempool.space)
   ├── LTC  → Blockchair
   ├── DOGE → Blockchair
   ├── TRX  → TronGrid
   └── SOL  → Solana RPC publik (multi-endpoint fallback)
   │
   ▼
Temuan → hallazgos.enc (AES-256-GCM) + found.txt
         + bell + ringkasan per koin + tabel kesehatan RPC
```

---

## Konfigurasi default

| Parameter | Nilai | Keterangan |
|---|---|---|
| `chains` | 1, 56, 137, 42161 | ETH · BNB Chain · Polygon · Arbitrum |
| `coins` | eth, btc, ltc, doge, trx, sol | Semua koin |
| `strategies` | sha256, doubleSha256, keccak256, sha256NoSpace, sha256Lower, md5 | Semua strategi |
| `intensity` | medium | Tingkat mutasi (light / medium / heavy) |
| `chunkSize` | 1000 | Kata per blok |
| `concurrency` | 5 | Permintaan paralel per chain EVM |
| `rateLimit` | 5 | Request/detik (EVM) |
| `batchSize` | 100 | Alamat per batch RPC EVM |

---

## File yang dihasilkan saat runtime

| File | Isi | Git |
|---|---|---|
| `aes.key` | Kunci AES-256 (auto-generate) | gitignored |
| `hallazgos.enc` | Temuan terenkripsi (AES-GCM) | gitignored |
| `found.txt` | Temuan plain text, tab-separated | gitignored |
| `.scrape_cache.json` | Kata & frasa yang sudah pernah di-scrape (persisten antar sesi, auto-prune) | gitignored |
| `progress.json` | Checkpoint sesi (auto-delete saat selesai) | gitignored |

> Cache scrape persisten — token yang sudah pernah di-scrape otomatis di-skip pada sesi berikutnya. Hapus `.scrape_cache.json` untuk reset.

---

## Landasan teori

Brainwallet adalah teknik menghasilkan private key dari frasa yang dihafal. Kelemahannya: jika frasa mudah ditebak, private key-nya pun dapat ditemukan.

- Ruang private key Ethereum: **2²⁵⁶** kemungkinan (~10⁷⁷)
- Private key acak murni: probabilitas sukses ≈ 0
- Brainwallet dari kata umum: probabilitas > 0 — itulah yang diaudit alat ini

---

## Persyaratan

- **Node.js 20+**
- Koneksi internet (untuk API publik blockchain)
- `aes.key` (dibuat otomatis jika belum ada)

---

## Keamanan

- Private key tersimpan **terenkripsi lokal** (AES-256-GCM)
- Tidak ada data sensitif yang dikirim ke server pihak ketiga
- Cache alamat hanya di memori — tidak ditulis ke disk
- `aes.key`, `config.json`, `hallazgos.enc`, `found.txt`, `.scrape_cache.json`, `progress.json` semua sudah di `.gitignore`
- Gunakan hanya di lingkungan terkontrol dan dengan otorisasi yang sesuai

---

## Lisensi

MIT — lihat [LICENSE](./LICENSE).
