import { test } from "node:test";
import assert from "node:assert/strict";
import { createWheelHandler } from "../lib/wheel-handler.mjs";

// In-memory store with ETags, like Netlify Blobs' conditional writes.
function etagStore() {
  const m = new Map();
  let n = 0;
  const tick = () => new Promise((r) => setTimeout(r, 0));
  return {
    async getWithMetadata(key) { await tick(); const e = m.get(key); return e ? { data: structuredClone(e.data), etag: e.etag, metadata: {} } : null; },
    async get(key) { await tick(); const e = m.get(key); return e ? structuredClone(e.data) : null; },
    async setJSON(key, data, { onlyIfMatch, onlyIfNew } = {}) {
      await tick();
      const cur = m.get(key);
      if (onlyIfNew && cur) return { modified: false };
      if (onlyIfMatch && (!cur || cur.etag !== onlyIfMatch)) return { modified: false };
      m.set(key, { data: structuredClone(data), etag: `"${++n}"` });
      return { modified: true, etag: `"${n}"` };
    },
  };
}

function setup() {
  const clock = { t: 100_000 };
  const h = createWheelHandler({ store: etagStore(), rng: Math.random, now: () => clock.t });
  const get = async () => (await h(new Request("http://x/api/wheel"))).json();
  const post = async (body) => {
    const r = await h(new Request("http://x/api/wheel", { method: "POST", body: JSON.stringify(body) }));
    return { status: r.status, body: await r.json() };
  };
  return { get, post, clock };
}

test("empty wheel to start, with server time", async () => {
  const { get } = setup();
  const s = await get();
  assert.deepEqual(s.names, []);
  assert.equal(s.spin, null);
  assert.equal(s.spinning, false);
  assert.equal(typeof s.serverNow, "number");
});

test("names are saved and shared", async () => {
  const { get, post } = setup();
  const r = await post({ action: "setNames", names: ["WoW", " Valheim ", "", "<b>x</b>"] });
  assert.equal(r.status, 200);
  assert.deepEqual((await get()).names, ["WoW", "Valheim", "<b>x</b>"]);
});

test("bad name lists are refused", async () => {
  const { post } = setup();
  assert.equal((await post({ action: "setNames", names: ["solo"] })).status, 400);
  assert.equal((await post({ action: "setNames", names: Array.from({ length: 13 }, (_, i) => "n" + i) })).status, 400);
  assert.equal((await post({ action: "setNames", names: "a\nb" })).status, 400);
});

test("cannot spin without 2 names", async () => {
  const { post } = setup();
  const r = await post({ action: "spin" });
  assert.equal(r.status, 409);
});

test("spin is planned by the server and locks the wheel until it stops", async () => {
  const { post, get, clock } = setup();
  await post({ action: "setNames", names: ["a", "b", "c"] });
  const r = await post({ action: "spin" });
  assert.equal(r.status, 200);
  assert.ok(r.body.spin && r.body.spinning);
  assert.equal((await post({ action: "spin" })).status, 409);
  assert.equal((await post({ action: "setNames", names: ["x", "y"] })).status, 409);
  clock.t = r.body.spin.startAt + r.body.spin.durationMs;
  const s = await get();
  assert.equal(s.spinning, false);
  assert.equal(s.spin.id, r.body.spin.id); // result stays visible
  assert.equal((await post({ action: "spin" })).status, 200);
});

test("two SPIN presses at once: exactly one spin happens", async () => {
  const { post } = setup();
  await post({ action: "setNames", names: ["a", "b"] });
  const [x, y] = await Promise.all([post({ action: "spin" }), post({ action: "spin" })]);
  assert.deepEqual([x.status, y.status].sort(), [200, 409]);
  const loser = x.status === 409 ? x : y;
  assert.match(loser.body.error, /just spun|spinning/i);
});

test("editing names clears the old result", async () => {
  const { post, clock } = setup();
  await post({ action: "setNames", names: ["a", "b"] });
  const s = await post({ action: "spin" });
  clock.t = s.body.spin.startAt + s.body.spin.durationMs + 1;
  const r = await post({ action: "setNames", names: ["c", "d", "e"] });
  assert.equal(r.body.spin, null);
});

test("unknown action", async () => {
  const { post } = setup();
  assert.equal((await post({ action: "nope" })).status, 400);
});

test("a store that doesn't confirm the write is treated as a failed write (fail safe)", async () => {
  const s = etagStore();
  const silent = { ...s, setJSON: async (k, v, o) => { await s.setJSON(k, v, o); return undefined; } };
  const h = createWheelHandler({ store: silent, now: () => 1 });
  const r = await h(new Request("http://x/api/wheel", { method: "POST", body: JSON.stringify({ action: "setNames", names: ["a", "b"] }) }));
  assert.equal(r.status, 409);
});

test("next spin starts from where the last one stopped", async () => {
  const { post, clock } = setup();
  await post({ action: "setNames", names: ["a", "b", "c"] });
  const first = (await post({ action: "spin" })).body.spin;
  clock.t = first.startAt + first.durationMs + 10;
  const second = (await post({ action: "spin" })).body.spin;
  const { finalRotation } = await import("../public/spin/wheel-math.mjs");
  assert.equal(second.fromAngle, ((finalRotation(first, 3) % 360) + 360) % 360);
});
