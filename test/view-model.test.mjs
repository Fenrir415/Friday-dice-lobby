import { test } from "node:test";
import assert from "node:assert/strict";
import { viewModel } from "../public/view-model.mjs";

const p = (id, rolls, game = "g" + id) => ({ id, name: id + "name", game, rolls, joinedAt: 0 });
const st = (players, outcome) => ({ roundId: "r1", players, outcome });

test("not joined (e.g. after new round)", () => {
  const vm = viewModel(st([p("A", [])], { status: "waiting", winnerId: null, needsRoll: ["A"] }), "Z");
  assert.equal(vm.joined, false);
  assert.equal(vm.canRoll, false);
  assert.equal(vm.banner, "Need at least 2 players");
});

test("lobby full and not joined", () => {
  const players = ["A", "B", "C", "D"].map((id) => p(id, []));
  const vm = viewModel(st(players, { status: "waiting", winnerId: null, needsRoll: ["A", "B", "C", "D"] }), "Z");
  assert.equal(vm.banner, "Lobby full (4/4)");
  assert.equal(vm.full, true);
});

test("my turn to roll", () => {
  const vm = viewModel(st([p("A", []), p("B", [[3, 4]])], { status: "waiting", winnerId: null, needsRoll: ["A"] }), "A");
  assert.equal(vm.joined, true);
  assert.equal(vm.canRoll, true);
  assert.equal(vm.banner, "Waiting on 1 to roll…");
  const b = vm.rows.find((r) => r.id === "B");
  assert.equal(b.latestTotal, 7);
  assert.deepEqual(b.dice, [3, 4]);
});

test("roll-off banner", () => {
  const vm = viewModel(st([p("A", [[3, 3]]), p("B", [[4, 2]])], { status: "rolloff", winnerId: null, needsRoll: ["A", "B"] }), "A");
  assert.equal(vm.banner, "Tie! Roll-off: Aname, Bname");
  assert.ok(vm.rows.every((r) => r.inRollOff));
});

test("done", () => {
  const vm = viewModel(st([p("A", [[6, 5]], "Palworld"), p("B", [[1, 1]])], { status: "done", winnerId: "A", needsRoll: [] }), "B");
  assert.equal(vm.rows.filter((r) => r.isWinner).length, 1);
  assert.equal(vm.showNewRound, true);
  assert.equal(vm.canRoll, false);
  assert.equal(vm.banner, "Tonight: PALWORLD (Aname rolled 11)");
});

test("roll-off excludes the player who lost the first roll", () => {
  // A and B tied on 6; A already rolled again; C lost with 2.
  const vm = viewModel(st([p("A", [[3, 3], [5, 5]]), p("B", [[4, 2]]), p("C", [[1, 1]])], { status: "rolloff", winnerId: null, needsRoll: ["B"] }), "C");
  assert.deepEqual(vm.rows.filter((r) => r.inRollOff).map((r) => r.id), ["A", "B"]);
  assert.equal(vm.banner, "Tie! Roll-off: Aname, Bname");
});

import { mergeSeen } from "../public/view-model.mjs";
test("mergeSeen never moves backwards (stale poll can't re-queue my roll)", () => {
  assert.equal(mergeSeen(3, 2), 3);
  assert.equal(mergeSeen(2, 3), 3);
  assert.equal(mergeSeen(undefined, 1), 1);
});
