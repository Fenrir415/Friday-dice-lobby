import { test } from "node:test";
import assert from "node:assert/strict";
import { createHandler } from "../lib/lobby-handler.mjs";

function fakeStore() {
  const m = new Map();
  return {
    m,
    async get(key) { return m.has(key) ? structuredClone(m.get(key)) : null; },
    async setJSON(key, val) { m.set(key, structuredClone(val)); return { modified: true }; },
    async delete(key) { m.delete(key); },
    async list({ prefix = "" } = {}) { return { blobs: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; },
  };
}

// rng that yields queued values; each die uses one value. 0.999 -> 6, 0 -> 1.
function seqRng(values) { let i = 0; return () => values[i++ % values.length]; }

function setup(rngValues = [0.5]) {
  const store = fakeStore();
  let t = 1000;
  const h = createHandler({ store, rng: seqRng(rngValues), now: () => t++ });
  const get = async () => { const r = await h(new Request("http://x/api/lobby")); return { status: r.status, body: await r.json() }; };
  const tokens = {};
  const post = async (body, { raw = false } = {}) => {
    if (!raw && body.playerId && tokens[body.playerId] && !("token" in body)) body = { ...body, token: tokens[body.playerId] };
    const r = await h(new Request("http://x/api/lobby", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));
    const out = { status: r.status, body: await r.json() };
    if (out.body.yourToken && body.playerId) tokens[body.playerId] = out.body.yourToken;
    return out;
  };
  return { store, get, post };
}

test("empty lobby", async () => {
  const { get } = setup();
  const r = await get();
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.players, []);
  assert.equal(r.body.outcome.status, "waiting");
  assert.ok(r.body.roundId);
});

test("join and re-join updates pick", async () => {
  const { get, post } = setup();
  await post({ action: "join", playerId: "A", name: "Doug", game: "Dune" });
  await post({ action: "join", playerId: "B", name: "Bro", game: "Palworld" });
  const r = await post({ action: "join", playerId: "A", name: "Doug", game: "WoW" });
  assert.equal(r.status, 200);
  assert.equal(r.body.players.length, 2);
  assert.equal(r.body.players.find((p) => p.id === "A").game, "WoW");
  assert.deepEqual(r.body.players.map((p) => p.id), ["A", "B"]);
});

test("empty name rejected", async () => {
  const { post } = setup();
  const r = await post({ action: "join", playerId: "A", name: "", game: "Dune" });
  assert.equal(r.status, 400);
});

test("lobby full at 4, re-join still works", async () => {
  const { post } = setup();
  for (const id of ["A", "B", "C", "D"]) await post({ action: "join", playerId: id, name: id, game: "g" });
  const r = await post({ action: "join", playerId: "E", name: "E", game: "g" });
  assert.equal(r.status, 409);
  assert.equal(r.body.error, "Lobby full");
  const r2 = await post({ action: "join", playerId: "D", name: "D", game: "new" });
  assert.equal(r2.status, 200);
});

test("double roll rejected", async () => {
  const { post } = setup();
  await post({ action: "join", playerId: "A", name: "A", game: "g" });
  await post({ action: "join", playerId: "B", name: "B", game: "g" });
  assert.equal((await post({ action: "roll", playerId: "A" })).status, 200);
  const r = await post({ action: "roll", playerId: "A" });
  assert.equal(r.status, 409);
  assert.equal(r.body.players.find((p) => p.id === "A").rolls.length, 1);
});

test("winner, then joins and removes refused", async () => {
  const { post } = setup([0.999, 0.999, 0, 0]);
  await post({ action: "join", playerId: "A", name: "A", game: "Dune" });
  await post({ action: "join", playerId: "B", name: "B", game: "WoW" });
  await post({ action: "roll", playerId: "A" }); // 12
  const r = await post({ action: "roll", playerId: "B" }); // 2
  assert.equal(r.body.outcome.status, "done");
  assert.equal(r.body.outcome.winnerId, "A");
  assert.equal((await post({ action: "join", playerId: "C", name: "C", game: "g" })).status, 409);
  assert.equal((await post({ action: "remove", playerId: "B" })).status, 409);
});

test("tie roll-off: tied can roll, untied cannot; removing the AFK tied player resolves", async () => {
  // A=6+6, B=6+6, C=1+1
  const { post } = setup([0.999, 0.999, 0.999, 0.999, 0, 0]);
  for (const id of ["A", "B", "C"]) await post({ action: "join", playerId: id, name: id, game: "g" + id });
  for (const id of ["A", "B", "C"]) await post({ action: "roll", playerId: id });
  let r = await post({ action: "roll", playerId: "C" });
  assert.equal(r.status, 409);
  assert.equal(r.body.outcome.status, "rolloff");
  assert.deepEqual(r.body.outcome.needsRoll, ["A", "B"]);
  r = await post({ action: "roll", playerId: "B" }); // B goes first in roll-off: allowed
  assert.equal(r.status, 200);
  assert.equal((await post({ action: "remove", playerId: "B" })).status, 409); // B already rolled off
  r = await post({ action: "remove", playerId: "A" }); // A went AFK in the roll-off
  assert.equal(r.body.outcome.status, "done");
  assert.equal(r.body.outcome.winnerId, "B");
});

test("new round only when done, clears players and changes roundId", async () => {
  const { get, post } = setup([0.999, 0.999, 0, 0]);
  await post({ action: "join", playerId: "A", name: "A", game: "g" });
  await post({ action: "join", playerId: "B", name: "B", game: "g" });
  assert.equal((await post({ action: "newRound" })).status, 409);
  const before = (await get()).body.roundId;
  await post({ action: "roll", playerId: "A" });
  await post({ action: "roll", playerId: "B" });
  const r = await post({ action: "newRound" });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.players, []);
  assert.notEqual(r.body.roundId, before);
});

test("html stored as plain text, capped", async () => {
  const { post } = setup();
  const r = await post({ action: "join", playerId: "A", name: "<script>alert(1)</script>xx", game: "g" });
  const name = r.body.players[0].name;
  assert.ok(name.length <= 24);
  assert.ok(name.startsWith("<script>"));
});

test("bad input", async () => {
  const { post } = setup();
  assert.equal((await post({ action: "nope" })).status, 400);
  assert.equal((await post({ action: "roll" })).status, 400);
});

// ---- Final review fixes ----
const tok = (r, id) => r.body.yourToken;

test("tokens: hidden from GET, required to roll or change pick", async () => {
  const { get, post } = setup();
  const a = await post({ action: "join", playerId: "A", name: "A", game: "g" });
  assert.ok(typeof tok(a) === "string" && tok(a).length >= 16);
  await post({ action: "join", playerId: "B", name: "B", game: "g" });
  const g = await get();
  assert.ok(g.body.players.every((p) => !("token" in p)));
  assert.equal(g.body.yourToken, undefined);
  assert.equal((await post({ action: "roll", playerId: "A" }, { raw: true })).status, 403);
  assert.equal((await post({ action: "roll", playerId: "A", token: "wrong" })).status, 403);
  assert.equal((await post({ action: "join", playerId: "A", name: "A", game: "hijack" }, { raw: true })).status, 403);
  assert.equal((await post({ action: "roll", playerId: "A", token: tok(a) })).status, 200);
});

test("cannot remove a player who already rolled (no remove-and-rejoin re-roll)", async () => {
  const { post } = setup();
  const a = await post({ action: "join", playerId: "A", name: "A", game: "g" });
  await post({ action: "join", playerId: "B", name: "B", game: "g" });
  await post({ action: "roll", playerId: "A", token: tok(a) });
  assert.equal((await post({ action: "remove", playerId: "A" })).status, 409);
});

test("name already taken by another player is refused", async () => {
  const { post } = setup();
  await post({ action: "join", playerId: "A", name: "Doug", game: "g" });
  const r = await post({ action: "join", playerId: "Z", name: " doug ", game: "g" });
  assert.equal(r.status, 409);
  assert.equal(r.body.error, "Name taken");
});

test("simultaneous joins never exceed 4 players", async () => {
  const { post, get } = setup();
  for (const id of ["A", "B", "C"]) await post({ action: "join", playerId: id, name: id, game: "g" });
  const [d, e] = await Promise.all([
    post({ action: "join", playerId: "D", name: "D", game: "g" }),
    post({ action: "join", playerId: "E", name: "E", game: "g" }),
  ]);
  const players = (await get()).body.players;
  assert.equal(players.length, 4);
  assert.deepEqual([d.status, e.status].sort(), [200, 409]);
});
