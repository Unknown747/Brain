const test = require("node:test");
const assert = require("node:assert/strict");
const { COINS, _internals } = require("../lib/multicoin");

// Kunci tetap untuk uji deterministik: 32-byte all-0x11.
const PRIV = "0x" + "11".repeat(32);

test("multicoin: registry berisi 9 koin", () => {
    const expected = ["btc", "btc-bech32", "ltc", "doge", "bch", "dash", "zec", "sol", "ada"];
    for (const c of expected) assert.ok(COINS[c], `koin hilang: ${c}`);
});

test("multicoin: BTC legacy P2PKH mulai dengan '1'", () => {
    const a = COINS.btc.derive(PRIV);
    assert.match(a, /^1[1-9A-HJ-NP-Za-km-z]{25,34}$/);
});

test("multicoin: BTC bech32 mulai dengan 'bc1'", () => {
    const a = COINS["btc-bech32"].derive(PRIV);
    assert.match(a, /^bc1[02-9ac-hj-np-z]{38,58}$/);
});

test("multicoin: LTC mulai dengan 'L'", () => {
    const a = COINS.ltc.derive(PRIV);
    assert.match(a, /^L[1-9A-HJ-NP-Za-km-z]{25,34}$/);
});

test("multicoin: DOGE mulai dengan 'D'", () => {
    const a = COINS.doge.derive(PRIV);
    assert.match(a, /^D[1-9A-HJ-NP-Za-km-z]{25,34}$/);
});

test("multicoin: BCH cashaddr mulai dengan 'bitcoincash:'", () => {
    const a = COINS.bch.derive(PRIV);
    assert.match(a, /^bitcoincash:[02-9ac-hj-np-z]{42}$/);
});

test("multicoin: DASH mulai dengan 'X'", () => {
    const a = COINS.dash.derive(PRIV);
    assert.match(a, /^X[1-9A-HJ-NP-Za-km-z]{25,34}$/);
});

test("multicoin: ZEC mulai dengan 't1'", () => {
    const a = COINS.zec.derive(PRIV);
    assert.match(a, /^t1[1-9A-HJ-NP-Za-km-z]{33}$/);
});

test("multicoin: SOL adalah base58 32-44 char", () => {
    const a = COINS.sol.derive(PRIV);
    assert.match(a, /^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
});

test("multicoin: ADA Shelley enterprise mulai dengan 'addr1'", () => {
    const a = COINS.ada.derive(PRIV);
    assert.match(a, /^addr1[02-9ac-hj-np-z]{50,}$/);
});

test("multicoin: derivasi deterministik (sama input → sama alamat)", () => {
    for (const coin of Object.keys(COINS)) {
        const a = COINS[coin].derive(PRIV);
        const b = COINS[coin].derive(PRIV);
        assert.equal(a, b, `coin ${coin} tidak deterministik`);
    }
});
