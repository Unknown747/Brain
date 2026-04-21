<p align="center"><a href="./README.md">Bahasa Indonesia</a> | English</p>

# Ethereum Brainwallet Auditor

[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Security](https://img.shields.io/badge/Security-Audit-red.svg)](https://github.com/features/security)
[![Blockchain](https://img.shields.io/badge/Blockchain-Ethereum-purple.svg)](https://ethereum.org/)
[![Crypto](https://img.shields.io/badge/Crypto-AES--GCM-orange.svg)](https://en.wikipedia.org/wiki/AES-GCM)

## 📋 Description

This project implements a tool to audit weak *brainwallet*-style phrases and derive Ethereum private keys from them. It queries the blockchain (via the Etherscan API) to detect whether any of the generated keys have had activity or hold a balance, and securely stores the results encrypted with AES-GCM.

The main objective is to facilitate security research on weak key generation patterns, helping to identify vulnerabilities in commonly used phrases.

---

## 📁 Project Structure

```
ethereum-brainwallet-auditor/
├── index.js                 # Application entry point
├── auditor_brainwallet.js   # Main module containing the brainwallet audit logic
├── decrypt.js               # Helper script to decrypt result files
├── config.json              # Local secret configuration (NOT committed)
├── config.example.json      # Configuration template
├── AES_key.txt              # File with the AES key for encryption/decryption
├── rockyou.txt              # Common-password dictionary (133 MB, optional)
├── hallazgos.enc            # Encrypted audit results
├── package.json             # Project dependencies configuration
├── assets/                  # Multimedia resources folder
│   └── runcode.gif          # GIF showing code execution
├── README.md                # Indonesian documentation
└── README-en.md             # English documentation (this file)
```

---

## 🚀 Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/Unknown747/Brain.git
   cd Brain
   ```

2. Make sure Node.js 20+ is installed.

3. Install dependencies:
   ```bash
   npm install
   ```

4. Copy `config.example.json` to `config.json` in the project root and fill in the values:
   ```json
   {
     "AUDITOR_AES_KEY": "your_256_bit_AES_key_in_64_hexadecimal_characters",
     "ETHERSCAN_API_KEY": "your_optional_etherscan_api_key"
   }
   ```
   `config.json` is listed in `.gitignore` so secrets won't be pushed to the repository.

---

## 💻 Usage

1. Download a phrase dictionary (for example `rockyou.txt`) and place it in the project folder.

2. Run the main script:
   ```bash
   node index.js
   # or
   npm start
   ```

The program will process the dictionary in blocks of 1000 phrases, generate variants, derive private keys, query the blockchain, and save:

- `hallazgos.enc` → all encrypted results.
- `hallazgos_con_fondos.enc` → only results with positive balance, encrypted.

Execution waits 5 seconds between blocks to avoid saturating the API.

### 🔄 Progress Tracker

The code includes a progress tracking system that allows you to resume the audit from where it left off:

**How it works:**
- `progress.txt` stores the number of the 1000-word block where you left off.
- On startup, it reads that number and skips all previous blocks.
- Each time a block finishes, it saves the next index in `progress.txt`.
- If you kill the process or the machine shuts down, when you restart it will continue from there.

---

## 🧠 Theoretical Foundations: Is it possible to find addresses with funds?

In theory, yes — but in practice the probability is extremely, almost absurdly low when talking about randomly generated addresses.

Here's why:

### 1️⃣ Ethereum Private Key Space
A private key is a 256-bit number.
That means there are 2^256 possible combinations, i.e.:
≈ 1.1579 × 10^77 possible keys
(a number so large that it's greater than the estimated number of atoms in the observable universe).

### 2️⃣ Brainwallets and Weak Patterns
The only reason scripts like this have found funded addresses in the past is because:
- Some people used simple passwords (e.g., "password", "123456", "letmein") as seed phrases to derive their private key.
- Those keys are predictable and may exist in dictionaries like `rockyou.txt`.
- This drastically reduces the search space (instead of 2^256, perhaps to a few million).

**Real example:**
A seed phrase "password123" → deterministic private key → an address someone actually used → detectable funds.

### 3️⃣ Real probabilities
- **Fully random keys** → success probability ≈ 0.
- **Keys from weak password dictionaries** → probability > 0, but still very low.

That's why scripts usually focus on brainwallets or weak keys and not on the entire possible space.

---

## ⚠️ What is a Brainwallet and why are they vulnerable?

A *brainwallet* is a technique for generating a cryptographic private key from a memorized phrase or password (a "seed phrase"), generally using a hash (like SHA-256). The idea is that the user doesn't have to store a long, complex private key, only remember a simple phrase.

**However, that simplicity can be a risk:**

- Many people use common phrases, simple words, or predictable patterns (dates, names, common combinations).
- Attackers can use dictionaries and algorithms to generate thousands or millions of likely phrases and compute the derived private keys.
- They then query the blockchain to detect whether any of those keys hold funds or have activity, and steal them.

That's why brainwallets based on weak phrases are highly insecure and have been the source of significant losses in the past.

This project simulates exactly that audit to detect such vulnerabilities and to educate about the importance of using truly random and secure phrases.

---

## 🎯 Problem it solves

Many people use weak phrases or simple patterns to generate their private keys (brainwallets), which can be exploited by attackers to steal funds. This tool helps to:

- Identify insecure patterns in keys derived from weak phrases.
- Detect active keys with a balance on the blockchain.
- Keep sensitive data secure through encryption.

---

## 🔧 Approach and solution

- **Candidate generation** based on common word lists and simple variants (leet speak, numeric suffixes).
- **Private key derivation** using SHA-256 of the phrase (brainwallet).
- **Etherscan querying** to obtain balance and last transaction date.
- **Encrypted storage** of all records and additional filtering for keys with balance.
- **Block processing** for efficient handling and query rate control.

---

## 🚀 Future improvements / ⚠️ Limitations

### 🚀 **Future improvements:**
- 🔗 **Multi-blockchain support**: Extend to other types of wallets or blockchains.
- 🗄️ **Database**: Implement databases for efficient handling of large volumes.
- ⚡ **Parallel queries**: Optimization for parallel queries without exceeding API limits.
- 🖥️ **Graphical interface**: Development of a graphical or web interface for result visualization.
- 🧠 **Advanced heuristics**: More sophisticated algorithms for phrase generation.

### ⚠️ **Current limitations:**
- 🌐 **API dependency**: Depends on the availability and limits of the Etherscan API.
- 📊 **Resource management**: Dictionary and variant generation must be used carefully to avoid saturating resources.
- 🎯 **Limited coverage**: Does not guarantee finding all possible weak phrases, only those based on simple patterns.

---

## 📋 Requirements

- 🟢 **Node.js 20+**
- 📦 **Dependencies** listed in `package.json` (`ethers`, `dotenv`)
- 🔑 **AES Key** of 256 bits (64 hexadecimal characters)
- 🌐 **Etherscan API Key** (optional)
- 📚 **Password dictionary** (e.g., `rockyou.txt` - 133 MB)

## 🔒 Security

⚠️ **WARNING**: This tool is designed solely for educational and security research purposes. Use it only in controlled environments and with appropriate authorization.

- Generated private keys are stored encrypted locally
- No sensitive data is transmitted to external servers
- It is recommended to use on isolated machines for greater security
