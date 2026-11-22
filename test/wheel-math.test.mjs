import { test } from "node:test";
import assert from "node:assert/strict";
import { finalRotation, rotationAt, sliceAtArrow } from "../public/spin/wheel-math.mjs";
import { planSpin } from "../lib/wheel-logic.mjs";

const plan = (style, n, winnerIndex, landFraction = 0.5) => ({ id: "x", startAt: 1000, durationMs: 6000, turns: 5, winnerIndex, landFraction, style });

test("arrow lands on the planned winner for every style and size", () => {
  for (let k = 0; k < 400; k++) {
    const n = 2 + (k % 11);
    const s = planSpin({ names: Array.from({ length: n }, (_, i) => "n" + i), rng: Math.random, now: 0 });
    const S = s.slices;
    assert.equal(sliceAtArrow(finalRotation(s, S), S), s.winnerIndex, JSON.stringify(s));
    assert.equal(sliceAtArrow(rotationAt(s, S, s.startAt + s.durationMs + 50), S), s.winnerIndex);
  }
});

test("before start the wheel is still; after the end it rests on the final rotation", () => {
  const s = plan("normal", 4, 2);
  assert.equal(rotationAt(s, 4, 0), 0);
  assert.equal(rotationAt(s, 4, s.startAt), 0);
  assert.equal(rotationAt(s, 4, s.startAt + s.durationMs), finalRotation(s, 4));
  assert.equal(rotationAt(s, 4, s.startAt + s.durationMs * 5), finalRotation(s, 4));
});

test("the wheel only turns one way (no jumps backwards)", () => {
  for (const style of ["normal", "rocket", "crawl", "nudge"]) {
    const s = plan(style, 6, 3, style === "crawl" ? 0.03 : 0.5);
    let prev = -1;
    for (let t = s.startAt; t <= s.startAt + s.durationMs; t += 20) {
      const r = rotationAt(s, 6, t);
      assert.ok(r >= prev - 1e-9, `${style} went backwards at ${t}`);
      prev = r;
    }
  }
});

test("nudge: pauses on the neighbouring slice, then nudges onto the winner", () => {
  const n = 6, s = plan("nudge", n, 2, 0.4);
  const paused = rotationAt(s, n, s.startAt + s.durationMs * 0.86);
  assert.equal(sliceAtArrow(paused, n), 3);
  assert.equal(sliceAtArrow(rotationAt(s, n, s.startAt + s.durationMs), n), 2);
});

test("crawl: still moving slowly near the end, crossing into the winner late", () => {
  const n = 5, s = plan("crawl", n, 1, 0.03);
  const late = rotationAt(s, n, s.startAt + s.durationMs * 0.97);
  const end = rotationAt(s, n, s.startAt + s.durationMs);
  assert.ok(end - late > 0 && end - late < 360 / n);
});

test("sliceAtArrow wraps correctly", () => {
  assert.equal(sliceAtArrow(0, 4), 0);
  assert.equal(sliceAtArrow(-1, 4), 0);
  assert.equal(sliceAtArrow(1, 4), 3);
  assert.equal(sliceAtArrow(360 * 3 + 1, 4), 3);
});

test("a spin starting from a resting angle begins there and still lands on the winner", () => {
  for (let k = 0; k < 300; k++) {
    const n = 2 + (k % 11);
    const s = { ...planSpin({ names: Array.from({ length: n }, (_, i) => "n" + i), rng: Math.random, now: 0 }), fromAngle: Math.random() * 360 };
    const S = s.slices;
    assert.equal(rotationAt(s, S, s.startAt - 100), s.fromAngle);
    assert.equal(rotationAt(s, S, s.startAt), s.fromAngle);
    if (s.style !== "slip") {
      assert.equal(sliceAtArrow(rotationAt(s, S, s.startAt + s.durationMs), S), s.winnerIndex);
      assert.ok(finalRotation(s, S) - s.fromAngle >= s.turns * 360);
    }
    let prev = -Infinity;
    for (let t = s.startAt; t <= s.startAt + s.durationMs; t += 50) { const r = rotationAt(s, S, t); assert.ok(r >= prev - 1e-9); prev = r; }
  }
});
