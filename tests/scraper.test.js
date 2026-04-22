const test = require("node:test");
const assert = require("node:assert/strict");
const { _internals } = require("../lib/scraper");
const { extractYears, STOP_WORDS } = _internals;

test("scraper: extractYears hanya menerima 1900–2030", () => {
    const text = "Born in 1955, died in 2011. Year 1492 ignored. Year 2050 too. Years 2020 and 2020.";
    const years = extractYears(text);
    assert.deepEqual(years.sort(), ["1955", "2011", "2020"].sort());
});

test("scraper: extractYears mengurutkan berdasar frekuensi", () => {
    const text = "1999 1999 1999 2024 2024 2010";
    const years = extractYears(text);
    assert.equal(years[0], "1999");
    assert.equal(years[1], "2024");
    assert.equal(years[2], "2010");
});

test("scraper: STOP_WORDS mencakup multi-bahasa", () => {
    // English
    assert.ok(STOP_WORDS.has("the"));
    // Indonesian
    assert.ok(STOP_WORDS.has("yang"));
    // Spanish
    assert.ok(STOP_WORDS.has("el"));
    // Russian
    assert.ok(STOP_WORDS.has("и"));
    // Arabic
    assert.ok(STOP_WORDS.has("في"));
    // Japanese particle
    assert.ok(STOP_WORDS.has("の"));
    // Korean particle
    assert.ok(STOP_WORDS.has("이"));
    // Chinese
    assert.ok(STOP_WORDS.has("的"));
});
