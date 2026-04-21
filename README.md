<p align="center">Bahasa Indonesia | <a href="./README-en.md">English</a></p>

<p align="center">
  <img src="assets/runcode.gif" alt="Demo" width="640"/>
</p>

# Brainwallet Auditor

[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Security](https://img.shields.io/badge/Tujuan-Riset_Keamanan-red.svg)](#)
[![Chains](https://img.shields.io/badge/EVM-ETH_BSC_Polygon_Arbitrum-purple.svg)](#)
[![Coins](https://img.shields.io/badge/Koin-BTC_LTC_DOGE_TRX_SOL-orange.svg)](#)

---

## Deskripsi

**Brainwallet Auditor** adalah alat riset keamanan untuk mendeteksi dompet kripto yang dibuat dari frasa lemah (*brainwallet*). Alat ini:

1. Mengambil teks dari URL yang diberikan.
2. Menghasilkan ribuan varian frasa + kombinasi 2 kata (bigram).
3. Menurunkan private key menggunakan 5 strategi hashing berbeda.
4. Mengecek saldo di **10 jaringan blockchain** secara paralel.
5. Menyimpan temuan secara terenkripsi (AES-256-GCM).

> ⚠️ Alat ini dibuat semata-mata untuk tujuan edukasi dan penelitian keamanan.

---

## Fitur

| Fitur | Detail |
|---|---|
| **Scraping otomatis** | Ambil & tokenisasi teks dari URL mana pun |
| **Varian kandidat** | Lowercase, uppercase, capitalize, suffix `!`, `123`, `1`, `2024`, bigram |
| **5 strategi hashing** | SHA-256, Double-SHA-256, Keccak-256, SHA-256 (no space), SHA-256 (lowercase) |
| **Multi-chain EVM** | Ethereum, BNB Chain, Polygon, Arbitrum (dapat dikonfigurasi) |
| **Multi-koin** | BTC, LTC, DOGE, TRX, SOL |
| **Retry otomatis** | Exponential backoff saat API gagal (maks 3x) |
| **Pengecekan paralel** | Semua koin & chain dicek bersamaan |
| **Kecepatan & ETA** | Ditampilkan secara live di terminal |
| **Cache in-memory** | Alamat tidak disimpan ke file — setiap sesi mulai bersih |
| **Enkripsi temuan** | Hasil disimpan dengan AES-256-GCM |
| **Notifikasi bell** | Terminal berbunyi otomatis saat wallet berdana ditemukan |

---

## Struktur Proyek

```
brainwallet-auditor/
├── index.js                 # Entry point CLI
├── auditor_brainwallet.js   # Orkestrator utama
├── decrypt.js               # Dekripsi hallazgos.enc
├── aes.key                  # Kunci AES-256 (64 karakter hex, dibuat otomatis)
├── hallazgos.enc            # Temuan terenkripsi
├── found.txt                # Temuan plain text
├── lib/
│   ├── candidates.js        # Generator varian frasa & bigram
│   ├── derive.js            # 5 strategi derivasi private key
│   ├── etherscan.js         # Pengecekan saldo EVM multi-chain via RPC
│   ├── logger.js            # Tampilan terminal berwarna + progress + ETA
│   ├── multicoin.js         # Pengecekan saldo BTC/LTC/DOGE/TRX/SOL
│   ├── scraper.js           # Scraping & tokenisasi teks dari URL
│   ├── storage.js           # Enkripsi AES-GCM & penyimpanan temuan
│   └── util.js              # Rate limiter, concurrency, retry, format waktu
├── package.json
├── README.md                # Dokumentasi Bahasa Indonesia
└── README-en.md             # Dokumentasi Bahasa Inggris
```

---

## Instalasi

```bash
# 1. Klon repositori
git clone https://github.com/Unknown747/Brain.git
cd Brain

# 2. Pastikan Node.js 20+ terpasang
node --version

# 3. Pasang dependensi
npm install
```

Kunci AES akan dibuat otomatis di `aes.key` saat pertama kali dijalankan. **Simpan file ini baik-baik** — diperlukan untuk mendekripsi `hallazgos.enc`.

---

## Penggunaan

```bash
node index.js
# atau
npm start
```

Program akan meminta satu atau lebih URL:

```
══════════════════════════════════════════════════════
   BRAINWALLET AUDITOR   security research tool
══════════════════════════════════════════════════════

  Masukkan satu atau lebih URL untuk di-scrape.
  Pisahkan dengan koma jika lebih dari satu.
  Contoh: https://en.wikipedia.org/wiki/Bitcoin

  URL > https://en.wikipedia.org/wiki/Bitcoin
```

### Opsi CLI

```bash
# Batasi koin yang dicek
node index.js --coins=eth,btc

# Batasi chain EVM (chain ID dipisah koma)
# 1=Ethereum  56=BNB Chain  137=Polygon  42161=Arbitrum
node index.js --coins=eth --chains=1,56
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
Scraping & Tokenisasi
   │  (hapus HTML, ambil kata unik 3–40 karakter)
   ▼
Generate Varian + Bigram
   │  (lowercase, uppercase, capitalize, suffix, 2-kata)
   ▼
Derivasi Private Key  ──── 5 strategi hashing
   │
   ▼
Cek Saldo Paralel
   ├── EVM  → Ethereum, BNB Chain, Polygon, Arbitrum  (RPC publik)
   ├── BTC  → blockchain.info
   ├── LTC  → Blockchair
   ├── DOGE → Blockchair
   ├── TRX  → TronGrid
   └── SOL  → Solana RPC publik
   │
   ▼
Temuan → hallazgos.enc (enkripsi) + found.txt (plain)
         + notifikasi bell terminal
```

---

## Konfigurasi Default

| Parameter | Nilai Default | Keterangan |
|---|---|---|
| `chunkSize` | 1000 | Kata per blok |
| `concurrency` | 5 | Permintaan paralel |
| `rateLimit` | 5 | Request/detik (EVM) |
| `batchSize` | 20 | Alamat per batch EVM |
| `chains` | 1, 56, 137, 42161 | ETH, BNB, Polygon, Arbitrum |
| `coins` | eth, btc, ltc, doge, trx, sol | Semua koin |
| `strategies` | sha256, doubleSha256, keccak256, sha256NoSpace, sha256Lower | Semua strategi |

---

## Tampilan Terminal

```
14:05:01 [INF] Strategi  : sha256, doubleSha256, keccak256, sha256NoSpace, sha256Lower
14:05:01 [INF] Koin      : eth, btc, ltc, doge, trx, sol
14:05:01 [INF] EVM Chain : Ethereum, BNB Chain, Polygon, Arbitrum

14:05:03 [CHK] ETH  │ alamat:320 │ waktu: 1.42s
14:05:03 [CHK] BTC  │ alamat:320 │ waktu: 0.98s
14:05:04 [BLK] 1/3 ████████░░░░░░░░ 33% │ kandidat:1800 │ diperiksa:960 │ temuan:0 │ 145/s │ ETA:12d (7.2d)
```

---

## Landasan Teori

Brainwallet adalah teknik menghasilkan private key dari frasa yang dihafal (biasanya di-hash dengan SHA-256). Kelemahannya: jika frasa mudah ditebak, private key-nya pun dapat ditemukan.

- Ruang private key Ethereum: **2²⁵⁶** kemungkinan (~10⁷⁷)
- Private key acak: probabilitas sukses ≈ 0
- Brainwallet dari kata umum: probabilitas > 0, dan itulah yang diaudit alat ini

Proyek ini mensimulasikan audit tersebut untuk keperluan riset keamanan.

---

## Persyaratan

- **Node.js 20+**
- Koneksi internet (untuk API publik blockchain)
- File `aes.key` (dibuat otomatis jika belum ada)

---

## Keamanan

- Private key yang ditemukan disimpan **terenkripsi lokal** (AES-256-GCM)
- Tidak ada data sensitif yang dikirim ke server pihak ketiga
- Cache alamat hanya ada di memori — tidak ditulis ke disk
- Gunakan hanya di lingkungan terkontrol dan dengan otorisasi yang sesuai
