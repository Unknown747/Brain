# Brainwallet Auditor

Node.js CLI yang men-scrape teks dari URL (mis. Wikipedia), menjadikan
kata-katanya brainwallet, lalu mengecek saldo di banyak koin secara paralel
menggunakan API publik gratis tanpa API key.

## Cara pakai
```
node index.js                          # tanya URL, cek semua koin default
node index.js --coins=eth,btc,sol      # batasi koin
node decrypt.js                        # tampilkan isi hallazgos.enc
```

Saat dijalankan, script akan menanyakan URL. Bisa lebih dari satu (pisahkan
dengan koma).

## Stack
- Node.js 20
- Dependensi: `ethers` saja

## Koin & sumber saldo (semua gratis, tanpa API key)
| Koin | Sumber |
|------|--------|
| ETH (multi-chain EVM) | RPC publik llamarpc / publicnode |
| BTC  | blockchain.info (50 alamat per request) |
| LTC  | blockchair.com (100 per request) |
| DOGE | blockchair.com (100 per request) |
| TRX  | TronGrid |
| SOL  | RPC publik Solana (`getMultipleAccounts`, 100 per request) |

Setiap koin punya rate-limiter sendiri dan dijalankan paralel dalam satu blok,
jadi menambah koin baru tidak mengalikan waktu — total ≈ koin paling lambat.

## Struktur
```
index.js                   CLI (tanya URL, parse --coins/--help, panggil runAudit)
auditor_brainwallet.js     Orkestrator: scrape → derive → cek saldo → simpan
decrypt.js                 Dekripsi & tampilkan hallazgos.enc
lib/scraper.js             Scrape URL + cache anti-pengulangan kata
lib/candidates.js          Bangkitkan varian dari daftar kata
lib/derive.js              Strategi derivasi (sha256, keccak256, dll)
lib/etherscan.js           Backend RPC publik untuk chain EVM
lib/multicoin.js           Derivasi & saldo BTC/LTC/DOGE/TRX/SOL
lib/storage.js             AES-GCM frame, found.txt, AddressCache
lib/util.js                chunkArray, rate-limiter, concurrency, durasi
lib/logger.js              Logger berwarna leveled
```

## File yang dihasilkan saat runtime
| File | Isi |
|------|-----|
| `aes.key`         | Kunci AES-256 (auto-generate saat pertama jalan) |
| `hallazgos.enc`   | Temuan terenkripsi (framed AES-GCM) |
| `found.txt`       | Temuan plain text, tab-separated |
| `words_cache.txt` | Kata-kata yang sudah pernah di-scrape |

> Cache alamat dicek hanya di memori — tidak ada file cache alamat yang ditulis ke disk.

## Strategi derivasi
Semua strategi aktif secara default: `sha256`, `doubleSha256`, `keccak256`, `sha256NoSpace`, `sha256Lower`.

## Workflow
- `Auditor` — `node index.js`

## Catatan keamanan
- Hanya alamat dengan saldo > 0 yang disimpan.
- `aes.key` JANGAN dihapus — tanpa kunci, `hallazgos.enc` tidak bisa didekripsi.
