import { test } from "node:test";
import assert from "node:assert/strict";
import { sliceCount, nameForSlice, finalRotation, sliceAtArrow, rotationAt } from "../public/spin/wheel-math.mjs";
import { planSpin } from "../lib/wheel-logic.mjs";

test("at least 12 slices, every name gets the same number", () => {
  const expected = { 2: 12, 3: 12, 4: 12, 5: 15, 6: 12, 7: 14, 8: 16, 9: 18, 10: 20, 11: 22, 12: 12 };
  for (const [k, s] of Object.entries(expected)) {
    assert.equal(sliceCount(Number(k)), s, `k=${k}`);
    assert.equal(s % Number(k), 0);
  }
});

test("names repeat around the wheel in order", () => {
  const names = ["WoW", "Valheim"];
  assert.deepEqual(Array.from({ length: 6 }, (_, i) => nameForSlice(names, i)), ["WoW", "Valheim", "WoW", "Valheim", "WoW", "Valheim"]);
});

test("spin plan records its slice count and picks a slice on the full wheel", () => {
  for (let k = 2; k <= 12; k++) {
    const names = Array.from({ length: k }, (_, i) => "g" + i);
    for (let r = 0; r < 50; r++) {
      const s = planSpin({ names, rng: Math.random, now: 0 });
      assert.equal(s.slices, sliceCount(k));
      assert.ok(s.winnerIndex >= 0 && s.winnerIndex < s.slices);
      assert.equal(sliceAtArrow(finalRotation(s, s.slices), s.slices), s.winnerIndex);
      assert.equal(sliceAtArrow(rotationAt(s, s.slices, s.startAt + s.durationMs), s.slices), s.winnerIndex);
    }
  }
});

test("slip moves to the very next slice of the full wheel", () => {
  const names = ["a", "b"];
  const S = sliceCount(2);
  for (let r = 0; r < 100; r++) {
    const fromAngle = Math.random() * 360;
    const seq = [0, 0.99, ...Array(10).fill(0.5)]; let i = 0;
    const s = planSpin({ names, fromAngle, rng: () => seq[i++], now: 0 });
    assert.equal(s.style, "slip");
    assert.equal(s.winnerIndex, (sliceAtArrow(fromAngle, S) - 1 + S) % S);
    assert.ok(finalRotation(s, S) - fromAngle < 2 * (360 / S));
  }
});
