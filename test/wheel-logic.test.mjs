import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanNames, planSpin, spinEndsAt, isSpinning, LEAD_MS, MAX_NAMES } from "../lib/wheel-logic.mjs";

const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };

test("cleanNames: trims, drops blanks, caps length, enforces 2–12", () => {
  assert.deepEqual(cleanNames([" Doug ", "", "  ", "Bro"]), ["Doug", "Bro"]);
  assert.equal(cleanNames(["Only one"]), null);
  assert.equal(cleanNames("Doug\nBro"), null);
  assert.equal(cleanNames(Array.from({ length: 13 }, (_, i) => "n" + i)), null);
  assert.equal(cleanNames(Array.from({ length: 12 }, (_, i) => "n" + i)).length, 12);
  assert.equal(MAX_NAMES, 12);
  assert.equal(cleanNames(["x".repeat(30), "b"])[0].length, 24);
  assert.deepEqual(cleanNames(["<script>", "b"]), ["<script>", "b"]);
  assert.deepEqual(cleanNames(["Bro", "Bro"]), ["Bro", "Bro"]);
  assert.equal(cleanNames([5, "b"]), null);
});

test("planSpin: rng high -> normal spin; rng low -> funny spin", () => {
  const names = ["a", "b", "c"];
  assert.equal(planSpin({ names, rng: seq([0.99]), now: 1000 }).style, "normal");
  assert.notEqual(planSpin({ names, rng: seq([0]), now: 1000 }).style, "normal");
});

test("planSpin: never two funny spins in a row", () => {
  for (const lastStyle of ["crawl", "rocket", "nudge"]) {
    assert.equal(planSpin({ names: ["a", "b"], lastStyle, rng: seq([0]), now: 1 }).style, "normal");
  }
});

test("planSpin: shape, start lead, winner in range", () => {
  for (let k = 0; k < 200; k++) {
    const s = planSpin({ names: ["a", "b", "c", "d", "e"], rng: Math.random, now: 5000 });
    assert.equal(s.startAt, 5000 + LEAD_MS);
    assert.ok(Number.isInteger(s.winnerIndex) && s.winnerIndex >= 0 && s.winnerIndex < 5);
    assert.ok(s.landFraction > 0 && s.landFraction < 1);
    assert.ok(s.durationMs >= 3000 && s.durationMs <= 12000);
    assert.ok(s.turns >= 3);
    assert.ok(typeof s.id === "string" && s.id.length > 4);
    if (s.style === "crawl") assert.ok(s.landFraction < 0.08);
  }
});

test("spinning window", () => {
  const s = planSpin({ names: ["a", "b"], rng: seq([0.99, 0.5]), now: 0 });
  assert.equal(spinEndsAt(s), s.startAt + s.durationMs);
  assert.equal(isSpinning(s, 0), true);
  assert.equal(isSpinning(s, spinEndsAt(s) - 1), true);
  assert.equal(isSpinning(s, spinEndsAt(s)), false);
  assert.equal(isSpinning(null, 0), false);
});
