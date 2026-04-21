<p align="center">Bahasa Indonesia | <a href="./README-en.md">English</a></p>

# Auditor Brainwallet Ethereum

[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Security](https://img.shields.io/badge/Security-Audit-red.svg)](https://github.com/features/security)
[![Blockchain](https://img.shields.io/badge/Blockchain-Ethereum-purple.svg)](https://ethereum.org/)
[![Crypto](https://img.shields.io/badge/Crypto-AES--GCM-orange.svg)](https://en.wikipedia.org/wiki/AES-GCM)

## 📋 Deskripsi

Proyek ini mengimplementasikan sebuah alat untuk mengaudit frasa lemah bergaya *brainwallet* dan menurunkan kunci privat Ethereum darinya. Skrip ini mengkueri blockchain (melalui Etherscan API) untuk mendeteksi apakah ada kunci yang dihasilkan memiliki aktivitas atau saldo, serta menyimpan hasilnya secara aman dengan enkripsi AES-GCM.

Tujuan utamanya adalah memfasilitasi penelitian keamanan terhadap pola pembuatan kunci yang lemah, sehingga membantu mengidentifikasi kerentanan pada frasa yang umum digunakan.

---

## 📁 Struktur Proyek

```
ethereum-brainwallet-auditor/
├── index.js                 # Titik masuk (entry point) aplikasi
├── auditor_brainwallet.js   # Modul utama berisi logika audit brainwallet
├── decrypt.js               # Skrip bantu untuk mendekripsi berkas hasil
├── config.json              # Konfigurasi rahasia lokal (TIDAK di-commit)
├── config.example.json      # Template konfigurasi
├── AES_key.txt              # Berkas berisi kunci AES untuk enkripsi/dekripsi
├── rockyou.txt              # Kamus kata sandi umum (133 MB, opsional)
├── hallazgos.enc            # Hasil audit terenkripsi
├── package.json             # Konfigurasi dependensi proyek
├── assets/                  # Folder sumber daya multimedia
│   └── runcode.gif          # GIF yang menunjukkan eksekusi kode
├── README.md                # Dokumentasi Bahasa Indonesia (berkas ini)
└── README-en.md             # Dokumentasi Bahasa Inggris
```

---

## 🚀 Instalasi

1. Klon repositori ini:
   ```bash
   git clone https://github.com/Unknown747/Brain.git
   cd Brain
   ```

2. Pastikan Node.js 20+ terpasang.

3. Pasang dependensi:
   ```bash
   npm install
   ```

4. Salin `config.example.json` menjadi `config.json` di folder utama, lalu isi nilainya:
   ```json
   {
     "AUDITOR_AES_KEY": "kunci_AES_256_bit_dalam_64_karakter_heksadesimal",
     "ETHERSCAN_API_KEY": "kunci_etherscan_api_anda_opsional"
   }
   ```
   `config.json` sudah ada di `.gitignore` sehingga rahasia tidak terdorong ke repositori.

---

## 💻 Penggunaan

1. Unduh kamus frasa (contohnya `rockyou.txt`) dan letakkan di folder proyek.

2. Jalankan skrip utama:
   ```bash
   node index.js
   # atau
   npm start
   ```

Program akan memproses kamus dalam blok berisi 1000 frasa, menghasilkan varian, menurunkan kunci privat, mengkueri blockchain, dan menyimpan:

- `hallazgos.enc` → seluruh hasil terenkripsi.
- `hallazgos_con_fondos.enc` → hanya hasil dengan saldo positif terenkripsi.

Eksekusi akan menunggu 5 detik antar blok agar tidak membebani API.

### 🔄 Pelacak Progres

Kode menyertakan sistem pelacakan progres yang memungkinkan Anda melanjutkan audit dari titik terakhir:

**Cara kerjanya:**
- `progress.txt` menyimpan nomor blok 1000-kata terakhir yang diproses.
- Saat memulai, skrip membaca nomor itu dan melewati semua blok sebelumnya.
- Setiap kali sebuah blok selesai, indeks berikutnya disimpan ke `progress.txt`.
- Jika proses dihentikan atau komputer mati, saat dijalankan kembali audit akan melanjutkan dari titik tersebut.

---

## 🧠 Landasan Teori: Apakah mungkin menemukan alamat dengan dana?

Secara teori, ya itu mungkin, tetapi dalam praktiknya probabilitasnya sangat, hampir absurd, kecil bila kita bicara tentang alamat yang dihasilkan secara acak.

Alasannya:

### 1️⃣ Ruang Kunci Privat Ethereum
Sebuah kunci privat adalah angka 256-bit.
Artinya ada 2^256 kemungkinan kombinasi, yaitu:
≈ 1,1579 × 10^77 kemungkinan kunci
(angka yang sangat besar, lebih besar dari perkiraan jumlah atom di alam semesta yang teramati).

### 2️⃣ Brainwallet dan Pola Lemah
Satu-satunya alasan skrip seperti ini pernah menemukan alamat berdana di masa lalu adalah karena:
- Sebagian orang menggunakan kata sandi sederhana (mis. "password", "123456", "letmein") sebagai frasa benih untuk menurunkan kunci privatnya.
- Kunci-kunci tersebut dapat diprediksi dan kemungkinan ada di kamus seperti `rockyou.txt`.
- Hal ini secara drastis mengecilkan ruang pencarian (alih-alih 2^256, mungkin hanya beberapa juta).

**Contoh nyata:**
Frasa benih "password123" → kunci privat deterministik → alamat yang pernah dipakai seseorang → dana yang terdeteksi.

### 3️⃣ Probabilitas Sebenarnya
- **Kunci sepenuhnya acak** → probabilitas sukses ≈ 0.
- **Kunci dari kamus kata sandi lemah** → probabilitas > 0, tapi tetap sangat rendah.

Itulah sebabnya skrip biasanya berfokus pada brainwallet atau kunci lemah, bukan seluruh ruang kemungkinan.

---

## ⚠️ Apa itu Brainwallet dan kenapa rentan?

Sebuah *brainwallet* adalah teknik untuk menghasilkan kunci privat kriptografis dari sebuah frasa atau kata sandi yang dihafal (sebuah "frasa benih"), umumnya menggunakan hash (seperti SHA-256). Idenya adalah pengguna tidak perlu menyimpan kunci privat yang panjang dan kompleks, cukup mengingat sebuah frasa sederhana.

**Namun, kesederhanaan itu bisa berisiko:**

- Banyak orang memakai frasa umum, kata sederhana, atau pola yang dapat diprediksi (tanggal, nama, kombinasi umum).
- Penyerang dapat memakai kamus dan algoritma untuk membangkitkan ribuan atau jutaan frasa yang mungkin dan menghitung kunci privat turunannya.
- Kemudian mereka mengkueri blockchain untuk mendeteksi apakah ada kunci tersebut yang punya dana atau aktivitas, lalu mencurinya.

Itulah sebabnya brainwallet berbasis frasa lemah sangat tidak aman dan telah menjadi sumber kerugian besar di masa lalu.

Proyek ini mensimulasikan audit semacam itu untuk mendeteksi kerentanan tersebut sekaligus mengedukasi pentingnya menggunakan frasa yang benar-benar acak dan aman.

---

## 🎯 Masalah yang dipecahkan

Banyak orang memakai frasa lemah atau pola sederhana untuk menghasilkan kunci privatnya (brainwallet), yang dapat dieksploitasi penyerang untuk mencuri dana. Alat ini membantu untuk:

- Mengidentifikasi pola tidak aman pada kunci yang diturunkan dari frasa lemah.
- Mendeteksi kunci aktif yang memiliki saldo di blockchain.
- Menjaga keamanan data sensitif melalui enkripsi.

---

## 🔧 Pendekatan dan solusi

- **Pembangkitan kandidat** berbasis daftar kata umum dan varian sederhana (leet speak, akhiran numerik).
- **Penurunan kunci privat** menggunakan SHA-256 atas frasa (brainwallet).
- **Kueri Etherscan** untuk memperoleh saldo dan tanggal transaksi terakhir.
- **Penyimpanan terenkripsi** untuk seluruh catatan dan penyaringan tambahan untuk kunci dengan saldo.
- **Pemrosesan per blok** untuk penanganan yang efisien dan kontrol laju kueri.

---

## 🚀 Peningkatan masa depan / ⚠️ Keterbatasan

### 🚀 **Peningkatan masa depan:**
- 🔗 **Dukungan multi-blockchain**: Memperluas ke jenis dompet atau blockchain lain.
- 🗄️ **Basis data**: Mengimplementasikan basis data untuk menangani volume besar secara efisien.
- ⚡ **Kueri paralel**: Optimasi kueri paralel tanpa melebihi batas API.
- 🖥️ **Antarmuka grafis**: Pengembangan antarmuka grafis atau web untuk visualisasi hasil.
- 🧠 **Heuristik lanjutan**: Algoritma yang lebih canggih untuk pembangkitan frasa.

### ⚠️ **Keterbatasan saat ini:**
- 🌐 **Ketergantungan API**: Tergantung pada ketersediaan dan batas Etherscan API.
- 📊 **Manajemen sumber daya**: Pembangkitan kamus dan varian harus digunakan dengan hati-hati agar tidak menjenuhkan sumber daya.
- 🎯 **Cakupan terbatas**: Tidak menjamin menemukan semua frasa lemah yang mungkin, hanya yang berbasis pola sederhana.

---

## 📋 Persyaratan

- 🟢 **Node.js 20+**
- 📦 **Dependensi** yang tercantum di `package.json` (`ethers`, `dotenv`)
- 🔑 **Kunci AES** sepanjang 256 bit (64 karakter heksadesimal)
- 🌐 **Etherscan API Key** (opsional)
- 📚 **Kamus kata sandi** (mis. `rockyou.txt` - 133 MB)

## 🔒 Keamanan

⚠️ **PERINGATAN**: Alat ini dirancang semata-mata untuk tujuan edukasi dan penelitian keamanan. Gunakan hanya di lingkungan terkontrol dan dengan otorisasi yang sesuai.

- Kunci privat yang dihasilkan disimpan terenkripsi secara lokal
- Tidak ada data sensitif yang dikirim ke server eksternal
- Disarankan menggunakan pada mesin yang terisolasi untuk keamanan lebih
