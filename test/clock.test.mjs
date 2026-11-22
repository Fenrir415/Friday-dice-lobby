import { test } from "node:test";
import assert from "node:assert/strict";
import { createClock } from "../public/spin/clock.mjs";

test("learns the offset from the server time", () => {
  const c = createClock();
  c.learn(10_000, 1_000, 1_100); // 100 ms round trip
  assert.equal(c.offset(), 10_000 + 50 - 1_100);
});

test("keeps following the server after the phone's clock jumps, even if later polls are slower", () => {
  const c = createClock();
  c.learn(10_000, 1_000, 1_020); // very fast first sample
  // Phone clock jumps back 5 s; polls are slower now (200 ms).
  for (let i = 0; i < 3; i++) {
    const local = 2_000 + i * 1000 - 5_000;
    c.learn(11_000 + i * 1000, local, local + 200);
  }
  const local = 2_000 + 2 * 1000 - 5_000 + 200;
  assert.ok(Math.abs(c.offset() - (13_000 + 100 - local)) < 300, `offset ${c.offset()}`);
});

test("ignores a single slow, noisy sample", () => {
  const c = createClock();
  c.learn(10_000, 1_000, 1_040);
  const before = c.offset();
  c.learn(11_000, 2_000, 2_900); // 900 ms round trip, same real offset
  assert.ok(Math.abs(c.offset() - before) < 50);
});
