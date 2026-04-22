const test = require("node:test");
const assert = require("node:assert/strict");
const { generateVariants } = require("../lib/candidates");

test("candidates: light hanya menghasilkan beberapa varian per kata", () => {
    const out = generateVariants(["password"], { intensity: "light" });
    assert.ok(out.length > 0);
    assert.ok(out.length < 10, `light terlalu banyak: ${out.length}`);
    assert.ok(out.includes("password"));
    assert.ok(out.includes("Password"));
});

test("candidates: medium menghasilkan lebih banyak varian, termasuk suffix tahun", () => {
    const out = generateVariants(["bitcoin"], { intensity: "medium" });
    assert.ok(out.length > 10);
    assert.ok(out.some((v) => /^bitcoin\d+$/.test(v)));    // suffix angka
    assert.ok(out.some((v) => v.startsWith("my")));        // prefix
});

test("candidates: frasa multi-kata → camel/pascal/no-space/snake/kebab", () => {
    const out = generateVariants(["to be or not to be"], { intensity: "medium" });
    assert.ok(out.includes("tobeornottobe"));              // no-space
    assert.ok(out.includes("toBeOrNotToBe"));              // camel
    assert.ok(out.includes("ToBeOrNotToBe"));              // pascal
    assert.ok(out.includes("to_be_or_not_to_be"));         // snake
    assert.ok(out.includes("to-be-or-not-to-be"));         // kebab
});

test("candidates: tahun-konteks dipakai untuk gabung dengan frasa", () => {
    const out = generateVariants(["steve jobs"], { intensity: "medium", years: ["1955", "2011"] });
    assert.ok(out.includes("stevejobs1955"));
    assert.ok(out.includes("SteveJobs1955"));
    assert.ok(out.includes("stevejobs2011"));
});

test("candidates: opts.seen menyaring duplikat antar pemanggilan", () => {
    const seen = new Set();
    const a = generateVariants(["hello"], { intensity: "medium", seen });
    const b = generateVariants(["hello"], { intensity: "medium", seen });
    assert.ok(a.length > 0);
    assert.equal(b.length, 0); // semua sudah ada di seen
});

test("candidates: input kosong / null aman", () => {
    assert.deepEqual(generateVariants([]), []);
    assert.deepEqual(generateVariants(["", "  ", null]), []);
});
