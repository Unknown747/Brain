<p align="center">Bahasa Indonesia | <a href="./README-en.md">English</a></p>

# Brainwallet Auditor

[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Tujuan](https://img.shields.io/badge/Tujuan-Riset_Keamanan-red.svg)](#keamanan)
[![EVM](https://img.shields.io/badge/EVM-ETH_OP_BSC_Polygon_Base_Arbitrum_Avalanche-purple.svg)](#konfigurasi-default)
[![Koin](https://img.shields.io/badge/Koin-BTC_LTC_DOGE_SOL-orange.svg)](#konfigurasi-default)

---

## Deskripsi

**Brainwallet Auditor** adalah alat riset keamanan untuk mendeteksi dompet kripto yang dibuat dari frasa lemah (*brainwallet*). Alat ini:

1. Mengambil teks dari URL → mengekstrak **frasa prioritas** (judul, heading, blockquote, kutipan), **frasa biasa** (kalimat 4–10 kata + n-gram 3/4/5), dan **kata tunggal**.
2. Menghasilkan ribuan **varian mutasi** (case, suffix, prefix, tahun, leetspeak, camelCase/PascalCase/snake_case/kebab-case/inisial-frasa).
3. Menurunkan private key memakai **6 strategi hashing** berbeda.
4. Mengecek saldo di **11 jaringan blockchain** secara paralel (7 EVM + BTC, LTC, DOGE, SOL).
5. Retry otomatis (exponential backoff) jika API gagal.
6. **Dedup berlapis 3** — token, varian mutasi, dan alamat semuanya cuma diproses sekali.
7. Menyimpan checkpoint — bisa dilanjutkan jika proses dihentikan (Ctrl+C).
8. Menyimpan temuan secara terenkripsi (AES-256-GCM).
9. Menampilkan ringkasan per koin + kesehatan RPC + ETA dengan jam perkiraan selesai.

> ⚠️ Alat ini dibuat semata-mata untuk tujuan edukasi dan penelitian keamanan.

---

## Quick Start

```bash
git clone https://github.com/Unknown747/Brain.git
cd Brain
npm install
node index.js
```

Saat dijalankan tanpa flag, alat akan menanyakan URL/preset, lalu intensitas mutasi. Cukup itu.

---

## Fitur

| Fitur | Detail |
|---|---|
| **Scraper cerdas** | HTML dibersihkan dari nav/footer/sidebar/script + filter token sampah |
| **Ekstraksi 3 lapis** | (1) prioritas: title/h1-h3/blockquote/teks dalam tanda kutip · (2) frasa: kalimat 4–10 kata + n-gram 3/4/5 · (3) kata tunggal |
| **Stop-words multi-bahasa** | EN + ID + ES (untuk kata tunggal; frasa tetap mempertahankan stop-words) |
| **Cache scrape persisten** | Token yang sudah pernah di-scrape otomatis di-skip antar sesi (auto-prune 500k entries) |
| **Preset URL bawaan** | 11 preset siap pakai termasuk `wikiquote-mix` (19 halaman tokoh) |
| **Mutasi kata** | case, suffix (!, 123, 2024…), prefix (the, my…), tahun (1990–2026), leetspeak, reverse |
| **Mutasi frasa** | no-space, camelCase, PascalCase, snake_case, kebab-case, **inisial** (mis. "to be or not to be" → `tbontb`) |
| **Tingkat intensitas** | `light` (~5/item) · `medium` (~25/item, default) · `heavy` (~80/item) |
| **Dedup varian antar-blok** | Varian yang sudah pernah keluar di blok manapun **tidak diproses ulang** |
| **6 strategi hashing** | SHA-256, Double-SHA-256, Keccak-256, SHA-256 (no space), SHA-256 (lower), MD5→SHA-256 |
| **Multi-chain EVM** | Ethereum, Optimism, BNB Chain, Polygon, Base, Arbitrum, Avalanche (dapat dikonfigurasi) |
| **Multi-koin non-EVM** | BTC, LTC, DOGE, SOL |
| **JSON-RPC batch (EVM)** | Banyak alamat per request — jauh lebih cepat |
| **Per-chain rate limit** | Tiap chain punya rps + batch-size sendiri (Arb/OP/Base lebih ketat) |
| **Multi-RPC fallback** | Otomatis pindah endpoint kalau satu RPC gagal/timeout |
| **Endpoint blacklist** | Endpoint yang gagal 5× berturut-turut dinonaktifkan 5 menit, lalu auto-revive |
| **Adaptive cooldown** | Kalau semua endpoint chain kena 429, chain itu di-pause exponential (max 30s) |
| **Tabel kesehatan RPC** | Endpoint mana yang dipakai & berapa kali gagal di akhir sesi |
| **Retry otomatis** | Exponential backoff saat API gagal (maks 3×) |
| **Pengecekan paralel** | Semua koin & chain dicek bersamaan |
| **Kecepatan & ETA** | Ditampilkan live di terminal dengan jam perkiraan selesai |
| **Checkpoint & resume** | Tekan Ctrl+C kapan saja — progres tersimpan, bisa dilanjutkan |
| **Cache alamat in-memory** | Tidak ada file cache alamat — setiap sesi mulai bersih |
| **Enkripsi temuan** | Hasil disimpan dengan AES-256-GCM (frame-based, append-only) |
| **Bell notification** | Terminal berbunyi saat wallet berdana ditemukan |
| **Ringkasan per koin** | Tabel alamat diperiksa & temuan per koin di akhir audit |
| **Mode pratinjau** | `--preview=N` cek N item teratas hasil scrape tanpa audit saldo |
| **config.json** | Simpan konfigurasi default supaya tidak perlu mengetik ulang flag |

---

## Struktur Proyek

```
brainwallet-auditor/
├── index.js                  # Entry point CLI (interaktif & non-interaktif)
├── auditor_brainwallet.js    # Orkestrator audit utama
├── decrypt.js                # Dekripsi hallazgos.enc
├── config.example.json       # Template konfigurasi (salin ke config.json)
├── lib/
│   ├── candidates.js         # Generator varian mutasi (light/medium/heavy)
│   ├── derive.js             # 6 strategi derivasi private key
│   ├── etherscan.js          # RPC publik multi-chain EVM + JSON-RPC batch + fallback
│   ├── logger.js             # Terminal berwarna + progress bar + ETA + ringkasan
│   ├── multicoin.js          # Derivasi & saldo BTC/LTC/DOGE/SOL
│   ├── rpcStats.js           # Pelacak kesehatan tiap endpoint RPC
│   ├── scrapeCache.js        # Cache persisten kata/frasa antar sesi
│   ├── scraper.js            # Scrape URL + ekstraksi 3-lapis (priority/phrases/words)
│   ├── sources.js            # Daftar preset URL bawaan
│   ├── storage.js            # Enkripsi AES-GCM & cache alamat in-memory
│   └── util.js               # Rate limiter, concurrency, retry, format waktu
├── package.json
├── README.md
└── README-en.md
```

---

## Instalasi

```bash
git clone https://github.com/Unknown747/Brain.git
cd Brain

# Pastikan Node.js 20+ terpasang
node --version

# Pasang dependensi (hanya ethers)
npm install
```

Kunci AES dibuat otomatis di `aes.key` saat pertama dijalankan.
**Backup file ini** — diperlukan untuk mendekripsi `hallazgos.enc`.

---

## Penggunaan

### Mode interaktif (paling mudah)

```bash
node index.js
```

Alat akan bertanya:
1. **URL/preset** — ketik nama preset (`einstein`) atau URL apa saja
2. **Intensitas** — `light` / `medium` / `heavy` (default `medium`)

### Mode non-interaktif (CLI)

```bash
node index.js --urls=einstein                  # Pakai preset bawaan langsung
node index.js --urls=einstein,bitcoin          # Gabung beberapa preset/URL
node index.js --urls=all                       # Audit semua preset bawaan
node index.js --urls=einstein --preview=20     # Cek 20 item teratas, tidak audit saldo
node index.js --urls=einstein --intensity=heavy
node index.js --sources                        # Tampilkan daftar preset bawaan
node index.js --help                           # Bantuan
```

> Argumen CLI selalu mengalahkan `config.json`. Pengaturan lanjutan (koin, chain, strategi, tuning kinerja) edit di `config.json`.

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
| `wikiquote-mix` | 19 halaman: filsuf + ilmuwan + penulis + tokoh sejarah |
| `all` | Semua preset di atas digabung & deduplikasi |

### Konfigurasi lanjutan (config.json)

Salin `config.example.json` ke `config.json` lalu sesuaikan:

```json
{
  "coins":       "eth,btc,ltc,doge,sol",
  "chains":      "1,10,56,137,8453,42161,43114",
  "strategies":  "sha256,doubleSha256,keccak256,sha256NoSpace,sha256Lower,md5",
  "intensity":   "medium",
  "chunkSize":   1000,
  "concurrency": 5,
  "rateLimit":   5,
  "batchSize":   100,
  "logLevel":    "info"
}
```

**Daftar chain ID yang didukung:** `1`=Ethereum · `10`=Optimism · `56`=BNB · `137`=Polygon · `8453`=Base · `42161`=Arbitrum · `43114`=Avalanche.

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
Scraping & ekstraksi 3-lapis
   │  - priority: title/h1-h3/blockquote/teks dalam kutipan
   │  - phrases : kalimat 4–10 kata + n-gram 3/4/5
   │  - words   : token tunggal (filter stop-words)
   │  (token yang sudah ada di cache persisten otomatis di-skip)
   ▼
Generate varian mutasi          ← dedup antar-blok
   │  - kata: case/suffix/prefix/tahun/leetspeak/reverse
   │  - frasa: no-space/camelCase/PascalCase/snake_case/
   │           kebab-case/inisial-frasa (mis. "tbontb")
   ▼
Derivasi private key  ── 6 strategi hashing
   │
   ▼
Cek saldo paralel (per koin & chain)   ← dedup alamat in-memory
   ├── ETH  → Ethereum, Optimism, BNB Chain, Polygon, Base, Arbitrum, Avalanche
   │         (per-chain rate-limit + batch + endpoint blacklist 5 menit)
   ├── BTC  → blockchain.info  (+ fallback mempool.space)
   ├── LTC  → Blockchair
   ├── DOGE → Blockchair
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
| `chains` | 1, 10, 56, 137, 8453, 42161, 43114 | ETH · OP · BNB · Polygon · Base · Arb · Avax |
| `coins` | eth, btc, ltc, doge, sol | Semua koin yang didukung |
| `strategies` | sha256, doubleSha256, keccak256, sha256NoSpace, sha256Lower, md5 | Semua strategi |
| `intensity` | medium | Tingkat mutasi (light / medium / heavy) |
| `chunkSize` | 1000 | Kata per blok |
| `concurrency` | 5 | Permintaan paralel per chain EVM |
| `rateLimit` | 5 | Request/detik (cap global; tiap chain punya cap sendiri yang lebih ketat) |
| `batchSize` | 100 | Alamat per batch RPC EVM (cap global; tiap chain punya cap sendiri) |
| `logLevel` | info | debug / info / warn / error |

**Tuning per-chain (otomatis):** Arbitrum 2 rps × 25 alamat · Optimism/Base 3 rps × 50 · ETH/BSC/Polygon/Avax 5 rps × 100. Nilai effective = `min(opts, tuning_per_chain)` — user tetap bisa turunkan via config.

---

## Tampilan terminal

**Banner sesi:**
```
══════════════════════════════════════════════════════════
  ⛓  BRAINWALLET AUDITOR   security research tool
  22/4/2026, 04.21.49
══════════════════════════════════════════════════════════
```

**Progress per blok (live):**
```
[BLK] 12/200 ████░░░░░░░░░░░░ 6% │ kandidat:24800 │ cek:24800 │ temuan:0 │ 845/s │ ETA: 22m (~16:43)
```

**Ringkasan akhir:**
```
══════════════════════════════════════════════════════════
  ✓ AUDIT SELESAI   durasi: 18m 22d
══════════════════════════════════════════════════════════
  Blok diproses     : 200
  Total kandidat    : 4.960.000
  Varian dilewati   : 412.301 (duplikat)
  Alamat diperiksa  : 4.547.699
  Kecepatan rata²   : 4.128 alamat/detik
  Temuan            : 0
══════════════════════════════════════════════════════════
```

---

## File yang dihasilkan saat runtime

| File | Isi | Git |
|---|---|---|
| `aes.key` | Kunci AES-256 (auto-generate) | gitignored |
| `hallazgos.enc` | Temuan terenkripsi (AES-GCM, frame-based) | gitignored |
| `found.txt` | Temuan plain text, tab-separated | gitignored |
| `.scrape_cache.json` | Kata & frasa yang sudah pernah di-scrape (auto-prune 500k) | gitignored |
| `progress.json` | Checkpoint sesi (auto-delete saat selesai) | gitignored |
| `config.json` | Konfigurasi default lokal (opsional) | gitignored |

> Hapus `.scrape_cache.json` untuk reset cache scrape.

---

## Landasan teori

Brainwallet adalah teknik menghasilkan private key dari frasa yang dihafal. Kelemahannya: jika frasa mudah ditebak, private key-nya pun dapat ditemukan.

- Ruang private key Ethereum: **2²⁵⁶** kemungkinan (~10⁷⁷)
- Private key acak murni: probabilitas sukses ≈ 0
- Brainwallet dari kata umum: probabilitas > 0 — itulah yang diaudit alat ini

---

## Persyaratan

- **Node.js 20+** (memakai `fetch` & `crypto.createPrivateKey` bawaan)
- Koneksi internet (untuk API publik blockchain)
- `aes.key` (dibuat otomatis jika belum ada)

Dependency runtime cuma satu: **ethers v6** (untuk derivasi pubkey & address EVM).

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
