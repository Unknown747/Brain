/**
 * Unit test untuk lib/derive.js
 * Jalankan: node --test tests/
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const { deriveAll, STRATEGIES } = require("../lib/derive");

test("derive: sha256('correct horse battery staple') menghasilkan kunci yang dikenal", () => {
    // SHA-256 dari "correct horse battery staple" =
    //   c4bbcb1fbec99d65bf59d85c8cb62ee2db963f0fe106f483d9afa73bd4e39a8a
    const out  = deriveAll("correct horse battery staple", ["sha256"]);
    assert.equal(out.length, 1);
    assert.equal(out[0].privHex, "0xc4bbcb1fbec99d65bf59d85c8cb62ee2db963f0fe106f483d9afa73bd4e39a8a");
    // Alamat EVM dari kunci itu (well-known compromised brainwallet).
    assert.equal(out[0].address.toLowerCase(), "0xdccd62d450c645f6437680b8a4daa098396dce0e");
});

test("derive: semua strategi default menghasilkan kunci 32-byte yang valid", () => {
    const phrase = "hello world";
    const names  = ["sha256","doubleSha256","keccak256","sha256NoSpace","sha256Lower","md5",
                    "pbkdf2","scrypt","hmacBitcoinSeed","bip39Seed"];
    const out = deriveAll(phrase, names);
    assert.equal(out.length, names.length);
    for (const r of out) {
        assert.match(r.privHex, /^0x[0-9a-f]{64}$/);
        assert.match(r.address, /^0x[0-9a-fA-F]{40}$/);
    }
});

test("derive: strategi yang sama dengan input sama → output sama (deterministik)", () => {
    const a = deriveAll("test phrase", ["pbkdf2", "scrypt"]);
    const b = deriveAll("test phrase", ["pbkdf2", "scrypt"]);
    assert.equal(a[0].privHex, b[0].privHex);
    assert.equal(a[1].privHex, b[1].privHex);
});

test("derive: strategi tidak dikenal di-skip diam-diam", () => {
    const out = deriveAll("anything", ["sha256", "tidakAda", "md5"]);
    assert.equal(out.length, 2);
});

test("derive: registry STRATEGIES berisi 11 strategi (10 default + argon2)", () => {
    const expected = [
        "sha256","doubleSha256","keccak256","sha256NoSpace","sha256Lower","md5",
        "pbkdf2","scrypt","hmacBitcoinSeed","bip39Seed","argon2",
    ];
    for (const k of expected) assert.equal(typeof STRATEGIES[k], "function", `strategi hilang: ${k}`);
});
