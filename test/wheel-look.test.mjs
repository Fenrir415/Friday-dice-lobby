import { test } from "node:test";
import assert from "node:assert/strict";
import { sliceColors, labelSize } from "../public/spin/wheel-look.mjs";

test("neighbouring slices never share a colour, including last-to-first", () => {
  for (let n = 2; n <= 12; n++) {
    const c = sliceColors(n);
    assert.equal(c.length, n);
    for (let i = 0; i < n; i++) assert.notEqual(c[i].fill, c[(i + 1) % n].fill, `n=${n} i=${i}`);
  }
});

test("labels shrink for crowded wheels and long names, but stay readable", () => {
  assert.ok(labelSize(2, "WoW") > labelSize(12, "WoW"));
  assert.ok(labelSize(4, "A very long name here") < labelSize(4, "Short"));
  assert.ok(labelSize(12, "x".repeat(24)) >= 11);
});
