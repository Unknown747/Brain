<p align="center">Bahasa Indonesia | <a href="./README-en.md">English</a></p>

<p align="center">
  <img src="assets/runcode.gif" alt="Demo" width="640"/>
</p>

# Brainwallet Auditor

[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Tujuan](https://img.shields.io/badge/Tujuan-Riset_Keamanan-red.svg)](#keamanan)
[![EVM](https://img.shields.io/badge/EVM-ETH_BSC_Polygon_Arbitrum-purple.svg)](#konfigurasi-default)
[![Koin](https://img.shields.io/badge/Koin-BTC_LTC_DOGE_TRX_SOL-orange.svg)](#konfigurasi-default)

---

## Deskripsi

**Brainwallet Auditor** adalah alat riset keamanan untuk mendeteksi dompet kripto yang dibuat dari frasa lemah (*brainwallet*). Alat ini:

1. Mengambil & memfilter teks dari URL (stop-words dibuang otomatis).
2. Menghasilkan ribuan varian frasa + bigram (kombinasi 2 kata).
3. Menurunkan private key menggunakan **6 strategi hashing** berbeda.
4. Mengecek saldo di **10 jaringan blockchain** secara paralel.
5. Retry otomatis (exponential backoff) jika API gagal.
6. Menyimpan checkpoint — bisa dilanjutkan jika proses dihentikan.
7. Menyimpan temuan secara terenkripsi (AES-256-GCM).
8. Menampilkan ringkasan lengkap per koin di akhir sesi.

> ⚠️ Alat ini dibuat semata-mata untuk tujuan edukasi dan penelitian keamanan.

---

## Fitur

| Fitur | Detail |
|---|---|
| **Stop-words filter** | Kata umum (the, and, is, ...) dibuang otomatis sebelum diproses |
| **Varian kandidat + bigram** | Lowercase, uppercase, capitalize, suffix `!` `123` `1` `2024`, kombinasi 2 kata |
| **6 strategi hashing** | SHA-256, Double-SHA-256, Keccak-256, SHA-256 (no space), SHA-256 (lower), MD5→SHA-256 |
| **Multi-chain EVM** | Ethereum, BNB Chain, Polygon, Arbitrum (dapat dikonfigurasi) |
| **Multi-koin** | BTC, LTC, DOGE, TRX, SOL |
| **Retry otomatis** | Exponential backoff saat API gagal (maks 3×) |
| **Pengecekan paralel** | Semua koin & chain dicek bersamaan |
| **Kecepatan & ETA** | Ditampilkan live di terminal |
| **Checkpoint & resume** | Tekan Ctrl+C kapan saja — progres tersimpan, bisa dilanjutkan |
| **Cache in-memory** | Tidak ada file cache alamat — setiap sesi mulai bersih |
| **Enkripsi temuan** | Hasil disimpan dengan AES-256-GCM |
| **Notifikasi bell** | Terminal berbunyi saat wallet berdana ditemukan |
| **Ringkasan per koin** | Tabel alamat diperiksa & temuan per koin di akhir audit |
| **config.json** | Simpan konfigurasi default agar tidak perlu mengetik ulang |

---

## Struktur Proyek

```
brainwallet-auditor/
├── index.js                 # Entry point CLI
├── auditor_brainwallet.js   # Orkestrator utama
├── decrypt.js               # Dekripsi hallazgos.enc
├── config.example.json      # Template konfigurasi (salin ke config.json)
├── aes.key                  # Kunci AES-256 (dibuat otomatis, jangan commit)
├── lib/
│   ├── candidates.js        # Generator varian frasa & bigram
│   ├── derive.js            # 6 strategi derivasi private key
│   ├── etherscan.js         # Pengecekan saldo EVM multi-chain via RPC publik
│   ├── logger.js            # Terminal berwarna + progress bar + ETA + ringkasan
│   ├── multicoin.js         # Derivasi & saldo BTC/LTC/DOGE/TRX/SOL
│   ├── scraper.js           # Scraping + tokenisasi + filter stop-words
│   ├── storage.js           # Enkripsi AES-GCM & penyimpanan temuan
│   └── util.js              # Rate limiter, concurrency, retry, format waktu
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

### Opsi CLI

```bash
node index.js --coins=eth,btc          # Batasi koin
node index.js --chains=1,56            # Batasi chain EVM
node index.js --strategies=sha256,md5  # Batasi strategi hashing
node index.js --help                   # Tampilkan bantuan
```

> Argumen CLI selalu mengalahkan `config.json`.

### Konfigurasi Default (config.json)

Salin `config.example.json` ke `config.json` dan sesuaikan:

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

`config.json` sudah ada di `.gitignore` — tidak akan ter-commit ke repository.

### Checkpoint & Resume

Jika proses dihentikan (Ctrl+C atau crash), progres otomatis tersimpan ke `progress.json`.
Saat dijalankan kembali, program akan menawarkan untuk melanjutkan:

```
▶ Checkpoint Ditemukan
──────────────────────────────────────────────────────
14:05:01 [INF] URL        : https://en.wikipedia.org/wiki/Bitcoin
14:05:01 [INF] Progres    : blok 2/5 selesai
14:05:01 [INF] Diperiksa  : 4200 alamat, temuan: 0

  Lanjut dari checkpoint? (y/n) >
```

### Dekripsi Hasil

```bash
node decrypt.js
# atau
npm run decrypt
```

---

## Alur Kerja

```
URL Input
   │
   ▼
Scraping & Tokenisasi + Filter Stop-Words
   │
   ▼
Generate Varian + Bigram
   │  (lowercase, uppercase, capitalize, suffix, 2-kata)
   ▼
Derivasi Private Key ──── 6 strategi hashing
   │
   ▼
Cek Saldo Paralel (per koin & chain)
   ├── ETH  → Ethereum, BNB Chain, Polygon, Arbitrum  (RPC publik)
   ├── BTC  → blockchain.info
   ├── LTC  → Blockchair
   ├── DOGE → Blockchair
   ├── TRX  → TronGrid
   └── SOL  → Solana RPC publik
   │
   ▼
Temuan → hallazgos.enc (AES-256-GCM) + found.txt
         + notifikasi bell + ringkasan per koin
```

---

## Tampilan Terminal

```
14:05:01 [INF] Strategi  : sha256, doubleSha256, keccak256, sha256NoSpace, sha256Lower, md5
14:05:01 [INF] Koin      : eth, btc, ltc, doge, trx, sol
14:05:01 [INF] EVM Chain : Ethereum, BNB Chain, Polygon, Arbitrum

14:05:03 [CHK] ETH  │ alamat:320 │ waktu: 1.42s
14:05:03 [CHK] BTC  │ alamat:320 │ waktu: 0.98s
14:05:04 [BLK] 1/3 ████████░░░░░░░░ 33% │ kandidat:1800 │ cek:960 │ temuan:0 │ 145/s │ ETA:12d (7.2d)

  Ringkasan per Koin
────────────────────────────────────────
  Koin  │  Diperiksa │  Temuan
────────────────────────────────────────
  ETH   │       2400 │       0
  BTC   │       2400 │       0
  LTC   │       2400 │       0
  DOGE  │       2400 │       0
  TRX   │       2400 │       0
  SOL   │       2400 │       0
────────────────────────────────────────
```

---

## Konfigurasi Default

| Parameter | Nilai | Keterangan |
|---|---|---|
| `chains` | 1, 56, 137, 42161 | ETH · BNB Chain · Polygon · Arbitrum |
| `coins` | eth, btc, ltc, doge, trx, sol | Semua koin |
| `strategies` | sha256, doubleSha256, keccak256, sha256NoSpace, sha256Lower, md5 | Semua strategi |
| `chunkSize` | 1000 | Kata per blok |
| `concurrency` | 5 | Permintaan paralel |
| `rateLimit` | 5 | Request/detik (EVM) |
| `batchSize` | 20 | Alamat per batch EVM |

---

## Landasan Teori

Brainwallet adalah teknik menghasilkan private key dari frasa yang dihafal. Kelemahannya: jika frasa mudah ditebak, private key-nya pun dapat ditemukan.

- Ruang private key Ethereum: **2²⁵⁶** kemungkinan (~10⁷⁷)
- Private key acak: probabilitas sukses ≈ 0
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
- `aes.key`, `config.json`, `hallazgos.enc`, `found.txt` sudah ada di `.gitignore`
- Gunakan hanya di lingkungan terkontrol dan dengan otorisasi yang sesuai
