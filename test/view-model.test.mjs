import { test } from "node:test";
import assert from "node:assert/strict";
import { viewModel } from "../public/dice/view-model.mjs";

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

import { mergeSeen } from "../public/dice/view-model.mjs";
test("mergeSeen never moves backwards (stale poll can't re-queue my roll)", () => {
  assert.equal(mergeSeen(3, 2), 3);
  assert.equal(mergeSeen(2, 3), 3);
  assert.equal(mergeSeen(undefined, 1), 1);
});

test("clear-table button shows for a solo player when the server allows reset", () => {
  const s = { roundId: "r", players: [p("A", [[3, 5]])], outcome: { status: "waiting", winnerId: null, needsRoll: [] }, canReset: true };
  const vm = viewModel(s, "A");
  assert.equal(vm.showNewRound, true);
  assert.equal(vm.newRoundLabel, "Clear the table");
});

test("winner screen keeps the new-round label", () => {
  const s = { roundId: "r", players: [p("A", [[6, 5]]), p("B", [[1, 1]])], outcome: { status: "done", winnerId: "A", needsRoll: [] }, canReset: true };
  assert.equal(viewModel(s, "A").newRoundLabel, "Start a new round");
});

test("empty lobby shows no clear button", () => {
  const s = { roundId: "r", players: [], outcome: { status: "waiting", winnerId: null, needsRoll: [] }, canReset: true };
  assert.equal(viewModel(s, "A").showNewRound, false);
});

import { arrivals, seatSlots, tabTitle } from "../public/dice/view-model.mjs";

test("arrivals: nothing announced on first load", () => {
  assert.deepEqual(arrivals(null, [p("A", []), p("B", [])], "A"), []);
});

test("arrivals: new players announced, never myself", () => {
  const got = arrivals(new Set(["A"]), [p("A", []), p("B", [], "Valheim"), p("C", [])], "C");
  assert.deepEqual(got.map((x) => [x.name, x.game]), [["Bname", "Valheim"]]);
});

test("seatSlots: always 4 seats, filled in join order", () => {
  const slots = seatSlots([p("A", []), p("B", [])], "B");
  assert.equal(slots.length, 4);
  assert.deepEqual(slots.map((s) => s.taken), [true, true, false, false]);
  assert.equal(slots[0].initial, "A");
  assert.equal(slots[1].isMe, true);
  assert.equal(slots[2].name, null);
});

test("tabTitle shows seat count only when someone is seated", () => {
  assert.equal(tabTitle([]), "Friday Night Dice");
  assert.equal(tabTitle([p("A", []), p("B", [])]), "(2/4) Friday Night Dice");
});
