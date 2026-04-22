<p align="center">Bahasa Indonesia | <a href="./README-en.md">English</a></p>

# Brainwallet Auditor

[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Tujuan](https://img.shields.io/badge/Tujuan-Riset_Keamanan-red.svg)](#keamanan)
[![EVM](https://img.shields.io/badge/EVM-11_chain-purple.svg)](#konfigurasi-default)
[![Koin](https://img.shields.io/badge/Koin-BTC_LTC_DOGE_SOL-orange.svg)](#konfigurasi-default)

---

## Deskripsi

**Brainwallet Auditor** adalah alat riset keamanan untuk mendeteksi dompet kripto yang dibuat dari frasa lemah (*brainwallet*). Alat ini:

1. Mengambil teks dari URL → mengekstrak **frasa prioritas** (judul, heading, blockquote, kutipan), **frasa biasa** (kalimat 4–10 kata + n-gram 3/4/5), dan **kata tunggal**.
2. Menghasilkan ribuan **varian mutasi** (case, suffix, prefix, tahun, leetspeak, camelCase/PascalCase/snake_case/kebab-case/inisial-frasa).
3. Menurunkan private key memakai **15 strategi derivasi** (10 default + 5 opsional opt-in).
4. Mengecek saldo di **27 jaringan blockchain** secara paralel (19 EVM + BTC/LTC/DOGE/BCH/DASH/ZEC/SOL/ADA).
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

### Scraper
| Fitur | Detail |
|---|---|
| **Fetch paralel** | Banyak URL diambil bersamaan (concurrency 5) — preset 19-URL ~3-5× lebih cepat |
| **HTTP 304 caching** | ETag & Last-Modified disimpan per URL; halaman yang tidak berubah tidak di-download ulang |
| **Cache token persisten** | Kata & frasa yang sudah pernah dibuat di-skip antar sesi (auto-prune 500k entries) |
| **Pra-strip noise** | `<script>/<style>/<svg>/<iframe>` dibuang sekali di awal — regex priority bekerja di string yang jauh lebih kecil |
| **Cap HTML 8 MB** | Halaman raksasa dipotong otomatis untuk cegah catastrophic backtracking |
| **Ekstraksi 3 lapis** | (1) prioritas: title/h1-h3/blockquote/teks dalam tanda kutip · (2) frasa: kalimat 4–10 kata + n-gram 3/4/5 · (3) kata tunggal |
| **Stop-words multi-bahasa** | EN, ID, ES, RU, AR, JP, KR, ZH (untuk kata tunggal; frasa tetap pertahankan stop-words) |
| **Wikipedia-aware** | Buang artefak wiki (`[edit]`, `[citation needed]`, ISBN/DOI/arXiv, navbox, hatnote, IPA, tanggal-lahir-mati) + ekstraksi proper-noun multi-kata otomatis dipecah |
| **Frasa dari italics/bold** | Tag `<i>/<em>/<b>/<strong>/<cite>` ikut diekstrak (judul karya & istilah penting) |
| **Preset URL bawaan** | 11 preset siap pakai termasuk `wikiquote-mix` (19 halaman tokoh) |

### Mutasi & derivasi
| Fitur | Detail |
|---|---|
| **Mutasi kata** | case, suffix (!, 123, 2024…), prefix (the, my…), tahun (1990–2026), leetspeak, reverse |
| **Mutasi frasa** | no-space, camelCase, PascalCase, snake_case, kebab-case, inisial ("to be or not to be" → `tbontb`) |
| **Tingkat intensitas** | `light` (~5/item) · `medium` (~25/item, default) · `heavy` (~80/item) |
| **Dedup varian antar-blok** | Varian yang sudah pernah keluar tidak diproses ulang dalam sesi yang sama |
| **15 strategi derivasi** | 10 default cepat: SHA-256, Double-SHA-256, Keccak-256, SHA-256 (no space / lower), MD5→SHA-256, PBKDF2, scrypt, HMAC-Bitcoin-Seed, BIP39 seed. 5 opsional opt-in: argon2 / argon2d (KDF mahal), bip44eth (BIP39 → m/44'/60'/0'/0/0), electrum (legacy), warpwallet (scrypt+pbkdf2 berlapis) |

### Cek saldo
| Fitur | Detail |
|---|---|
| **Multi-chain EVM (19 chain)** | Ethereum, BNB, Polygon, Arbitrum, Optimism, Base, Avalanche, Gnosis, Linea, Scroll, zkSync Era, Fantom, Cronos, Celo, Moonbeam, Mantle, Blast, opBNB, Polygon zkEVM |
| **Multi-koin non-EVM** | BTC, LTC, DOGE, BCH, DASH, ZEC, SOL, ADA |
| **Deteksi contract** | Alamat yang berupa kontrak otomatis ditandai (`eth_getCode`) |
| **Cek ERC-20 token** | Stablecoin & token populer dicek per chain (USDT/USDC/DAI/BUSD/dst) |
| **JSON-RPC batch (EVM)** | Banyak alamat per request — jauh lebih cepat (auto-split bila terlalu besar) |
| **Per-chain batch & timeout** | Chain yang sensitif rate-limit (Arbitrum/Linea/Scroll/zkSync) pakai batch lebih kecil & timeout longgar |
| **Mode "race" untuk Arbitrum** | 2 endpoint sehat ditembak paralel — pemenang dipakai, sisanya dibatalkan |
| **Multi-RPC fallback + circuit breaker** | 7–12 endpoint publik per chain (drpc, llamarpc, publicnode, ankr, 1rpc, blast, onfinality, omniatech); yang gagal di-cooldown 60s, sticky ke endpoint sehat terakhir |
| **Cache kesehatan RPC** | Disimpan di `.rpc_health.json` — sesi berikutnya langsung pakai endpoint sehat |
| **Pengecekan paralel** | Semua koin & chain dicek bersamaan |

### Pengalaman pengguna
| Fitur | Detail |
|---|---|
| **Estimasi pre-audit** | Sebelum mulai, kalibrasi 50 varian → tampilkan perkiraan total varian, derivasi, cek alamat & waktu selesai |
| **Kecepatan & ETA live** | Progress bar per blok dengan jam perkiraan selesai |
| **Checkpoint & resume** | Ctrl+C kapan saja — progres tersimpan, bisa dilanjutkan |
| **Enkripsi temuan** | AES-256-GCM (frame-based, append-only) ke `hallazgos.enc` |
| **Bell notification** | Terminal berbunyi saat wallet berdana ditemukan |
| **Ringkasan per koin** | Tabel alamat diperiksa & temuan per koin di akhir audit |
| **config.json saja** | Tidak ada flag CLI — semua pengaturan via `config.json` (object toggle nyala/mati per koin/chain/strategi) |

---

## Struktur Proyek

```
brainwallet-auditor/
├── index.js                  # Entry point CLI (config.json saja, tanpa flag)
├── auditor_brainwallet.js    # Orkestrator audit utama (estimasi + run + checkpoint)
├── decrypt.js                # Dekripsi hallazgos.enc → stdout
├── config.example.json       # Template konfigurasi (salin ke config.json)
├── lib/
│   ├── candidates.js         # Generator varian mutasi (light/medium/heavy)
│   ├── chainlist.js          # Auto-discovery RPC publik dari chainlist.org
│   ├── derive.js             # 15 strategi derivasi private key (10 default + 5 opsional)
│   ├── etherscan.js          # RPC publik multi-chain EVM + JSON-RPC batch + race + fallback
│   ├── httpStats.js          # Counter retry HTTP per endpoint
│   ├── logger.js             # Terminal berwarna + progress bar + ETA + ringkasan
│   ├── multicoin.js          # Derivasi & saldo non-EVM (BTC/LTC/DOGE/BCH/DASH/ZEC/SOL/ADA)
│   ├── notify.js             # Notifikasi mulai/temuan (Telegram/Discord opsional)
│   ├── rpcHealthCache.js     # Persistensi skor kesehatan RPC ke .rpc_health.json
│   ├── rpcStats.js           # Pelacak ok/fail/latency per endpoint (live)
│   ├── scrapeCache.js        # Cache persisten kata + frasa + ETag/Last-Modified per URL
│   ├── scraper.js            # Scrape paralel + 304 caching + ekstraksi 3-lapis
│   ├── sources.js            # Daftar preset URL bawaan
│   ├── storage.js            # Enkripsi AES-GCM frame + cache alamat in-memory
│   ├── tokens.js             # Daftar ERC-20 token populer per chain
│   └── util.js               # Rate limiter, concurrency, retry, conditional GET
├── tests/                    # Unit tests (node --test)
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

# Pasang dependensi
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

### Mode non-interaktif

Set `url` di `config.json` ke preset/URL pilihan, lalu jalankan `node index.js`. Semua pengaturan dibaca dari `config.json` — **tidak ada flag CLI**.

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

### Konfigurasi (config.json)

Salin `config.example.json` ke `config.json`, sesuaikan, jalankan `node index.js`. Setiap variabel punya kunci penjelasan `_namaVar` di atasnya (JSON tidak dukung komentar). Contoh ringkas:

```json
{
  "url":       "einstein",
  "intensity": "medium",

  "coins": {
    "eth": true, "btc": true, "btc-bech32": true,
    "ltc": true, "doge": true, "sol": true, "ada": true,
    "bch": false, "dash": false, "zec": false
  },

  "chains": {
    "ethereum": true, "bnb": true, "polygon": true,
    "arbitrum": true, "optimism": true, "base": true,
    "avalanche": true, "linea": true,
    "fantom": false, "gnosis": false, "scroll": false, "zksync": false,
    "cronos": false, "celo": false, "moonbeam": false, "mantle": false,
    "blast": false, "opbnb": false, "polygon-zkevm": false
  },

  "strategies": {
    "sha256": true, "doubleSha256": true, "keccak256": true,
    "sha256NoSpace": true, "sha256Lower": true, "md5": true,
    "pbkdf2": true, "scrypt": true,
    "hmacBitcoinSeed": true, "bip39Seed": true,
    "argon2": false, "argon2d": false,
    "bip44eth": false, "electrum": false, "warpwallet": false
  },

  "checkContract": true,
  "checkTokens":   true,
  "scanAllAddressesForTokens": true,

  "chunkSize":   1000,
  "concurrency": 5,
  "rateLimit":   5,
  "batchSize":   80,
  "logLevel":    "info"
}
```

`config.json` sudah ada di `.gitignore` — tidak akan ter-commit. Lihat `config.example.json` untuk penjelasan lengkap setiap variabel.

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
Scraping paralel (concurrency 5)
   │  - HTTP 304: URL tak berubah → fetch & parse total dilewati
   │  - pra-strip <script>/<style>/<svg>/<iframe>
   │  - cap HTML 8 MB
   │  - ekstraksi 3-lapis: priority / phrases / words
   │  (kata & frasa yang sudah ada di cache token otomatis di-skip)
   ▼
Estimasi pre-audit   ← kalibrasi 50 varian, prediksi total waktu
   ▼
Generate varian mutasi          ← dedup antar-blok
   │  - kata: case/suffix/prefix/tahun/leetspeak/reverse
   │  - frasa: no-space/camelCase/PascalCase/snake_case/
   │           kebab-case/inisial-frasa (mis. "tbontb")
   ▼
Derivasi private key  ── 10 strategi default + 5 opsional opt-in
   ▼
Cek saldo paralel (per koin & chain)   ← dedup alamat in-memory
   ├── ETH  → 19 chain EVM (JSON-RPC batch + race + circuit breaker)
   ├── BTC/LTC/DOGE/BCH/DASH/ZEC → blockchain.info / mempool.space / Blockchair
   ├── SOL  → Solana RPC publik (multi-endpoint fallback)
   └── ADA  → Koios
   │
   ▼
Temuan → hallazgos.enc (AES-256-GCM) + found.txt
         + bell + notify (opsional) + ringkasan per koin + tabel RPC
```

---

## Konfigurasi default (config.json)

| Parameter | Nilai default | Keterangan |
|---|---|---|
| `coins` (on) | eth, btc, btc-bech32, ltc, doge, sol, ada | 7 koin teratas (BCH/DASH/ZEC off, hampir tidak pernah ada saldo brainwallet) |
| `chains` (on) | ethereum, bnb, polygon, arbitrum, optimism, base, avalanche, linea | 8 chain EVM teramai (11 chain minor off) |
| `strategies` (on) | sha256, doubleSha256, keccak256, sha256NoSpace, sha256Lower, md5, pbkdf2, scrypt, hmacBitcoinSeed, bip39Seed | 10 strategi cepat (5 KDF mahal off) |
| `checkContract` | true | Tandai alamat yang berupa kontrak |
| `checkTokens` | true | Cek saldo ERC-20 populer per chain |
| `scanAllAddressesForTokens` | true | Cek token untuk SEMUA alamat (bukan hanya yang punya saldo native) |
| `intensity` | medium | Tingkat mutasi (light / medium / heavy) |
| `chunkSize` | 1000 | Kata per blok |
| `concurrency` | 5 | Permintaan paralel per chain EVM |
| `rateLimit` | 5 | Request/detik (EVM) |
| `batchSize` | 80 | Alamat per batch JSON-RPC EVM (auto-split bila terlalu besar) |
| `logLevel` | info | debug / info / warn / error |

---

## Tampilan terminal

**Banner sesi:**
```
══════════════════════════════════════════════════════════
  ⛓  BRAINWALLET AUDITOR   security research tool
  22/4/2026, 04.21.49
══════════════════════════════════════════════════════════
```

**Estimasi pre-audit:**
```
▶ Estimasi
──────────────────────────────────────────────────────────
[INF] Token korpus     : 29.626
[INF] Total varian     : ~1.305.025 (44.0/token, intensitas medium)
[INF] Total derivasi   : ~13.050.250 (10 strategi)
[INF] Total cek alamat : ~91.351.750 (7 koin)
[INF] Perkiraan waktu  : ~53j 58m 38d  (kalibrasi: 106.90 ms/varian)
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
| `.scrape_cache.json` | Kata + frasa + ETag/Last-Modified per URL (auto-prune 500k) | gitignored |
| `.rpc_health.json` | Skor kesehatan endpoint RPC antar sesi | gitignored |
| `progress.json` | Checkpoint sesi (auto-delete saat selesai) | gitignored |
| `config.json` | Konfigurasi lokal | gitignored |

> Hapus `.scrape_cache.json` untuk reset cache scrape (kata + ETag URL).

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

Dependency runtime: **ethers v6** (pubkey & address EVM) + **@noble/hashes** (PBKDF2/scrypt/argon2/HMAC) + **@noble/curves** (BIP32/secp256k1 untuk BIP44 & SOL/ADA).

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
