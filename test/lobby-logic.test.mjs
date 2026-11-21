import { test } from "node:test";
import assert from "node:assert/strict";
import { rollDice, total, computeOutcome, cleanText, MIN_PLAYERS, MAX_PLAYERS } from "../lib/lobby-logic.mjs";

const p = (id, rolls) => ({ id, name: id, game: "g" + id, rolls, joinedAt: 0 });

test("player limits", () => {
  assert.equal(MIN_PLAYERS, 2);
  assert.equal(MAX_PLAYERS, 4);
});

test("rollDice range", () => {
  assert.deepEqual(rollDice(() => 0), [1, 1]);
  assert.deepEqual(rollDice(() => 0.999), [6, 6]);
  assert.equal(total([3, 4]), 7);
});

test("no players", () => {
  assert.deepEqual(computeOutcome([]), { status: "waiting", winnerId: null, needsRoll: [] });
});

test("waiting on unrolled player", () => {
  assert.deepEqual(computeOutcome([p("A", [[3, 3]]), p("B", [])]), { status: "waiting", winnerId: null, needsRoll: ["B"] });
});

test("single player never wins", () => {
  assert.deepEqual(computeOutcome([p("A", [[6, 6]])]), { status: "waiting", winnerId: null, needsRoll: [] });
});

test("clear winner", () => {
  assert.deepEqual(computeOutcome([p("A", [[6, 6]]), p("B", [[1, 2]])]), { status: "done", winnerId: "A", needsRoll: [] });
});

test("tie triggers roll-off for tied only", () => {
  assert.deepEqual(computeOutcome([p("A", [[3, 3]]), p("B", [[4, 2]]), p("C", [[1, 1]])]), { status: "rolloff", winnerId: null, needsRoll: ["A", "B"] });
});

test("roll-off resolved", () => {
  assert.deepEqual(computeOutcome([p("A", [[3, 3], [6, 5]]), p("B", [[4, 2], [1, 1]]), p("C", [[1, 1]])]), { status: "done", winnerId: "A", needsRoll: [] });
});

test("roll-off partly rolled", () => {
  assert.deepEqual(computeOutcome([p("A", [[3, 3], [6, 5]]), p("B", [[4, 2]])]), { status: "rolloff", winnerId: null, needsRoll: ["B"] });
});

test("cleanText", () => {
  assert.equal(cleanText("  hi  ", 24), "hi");
  assert.equal(cleanText("", 24), null);
  assert.equal(cleanText("   ", 24), null);
  assert.equal(cleanText("x".repeat(50), 40).length, 40);
  assert.equal(cleanText(5, 10), null);
});
