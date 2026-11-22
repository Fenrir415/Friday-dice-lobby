// Wheel keeper: one shared wheel (names + current spin) for everyone with the link.
// All writes are conditional on the version we read, so two people acting at the
// same moment can't both win (e.g. two SPIN presses -> one spin).
import { cleanNames, planSpin, isSpinning, MIN_NAMES } from "./wheel-logic.mjs";
import { finalRotation } from "../public/spin/wheel-math.mjs";

const STATE_KEY = "wheel/state";
const EMPTY = { names: [], spin: null, lastStyle: "normal" };

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export function createWheelHandler({ store, rng = Math.random, now = Date.now }) {
  async function read() {
    const entry = await store.getWithMetadata(STATE_KEY, { type: "json" });
    return entry ? { state: { ...EMPTY, ...entry.data }, etag: entry.etag } : { state: { ...EMPTY }, etag: null };
  }

  // Write only if nobody changed the wheel since we read it.
  async function write(next, etag) {
    const res = await store.setJSON(STATE_KEY, next, etag ? { onlyIfMatch: etag } : { onlyIfNew: true });
    // Only a confirmed write counts. (Needs @netlify/blobs 10+, which supports conditional writes.)
    return res?.modified === true;
  }

  const view = (state) => {
    const t = now();
    return { names: state.names, spin: state.spin, serverNow: t, spinning: isSpinning(state.spin, t) };
  };

  return async function handler(req) {
    try {
      if (req.method === "GET") return json(view((await read()).state));
      if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

      let body;
      try { body = await req.json(); } catch { return json({ error: "Bad JSON" }, 400); }
      const { state, etag } = await read();
      const fail = (error, status) => json({ ...view(state), error }, status);
      const spinning = isSpinning(state.spin, now());

      if (body?.action === "setNames") {
        const names = cleanNames(body.names);
        if (!names) return fail(`Add ${MIN_NAMES} to 12 names, one per line`, 400);
        if (spinning) return fail("Wait for the wheel to stop", 409);
        const next = { ...state, names, spin: null };
        if (!(await write(next, etag))) return json({ ...view((await read()).state), error: "The wheel just changed. Try again." }, 409);
        return json(view(next));
      }

      if (body?.action === "spin") {
        if (spinning) return fail("The wheel is already spinning", 409);
        if (state.names.length < MIN_NAMES) return fail("Add at least 2 names first", 409);
        // Start from where the last spin left the wheel, so it doesn't snap back first.
        const n = state.names.length;
        const fromAngle = state.spin ? ((finalRotation(state.spin, n) % 360) + 360) % 360 : 0;
        const spin = planSpin({ names: state.names, lastStyle: state.lastStyle, fromAngle, rng, now: now() });
        const next = { ...state, spin, lastStyle: spin.style };
        if (!(await write(next, etag))) return json({ ...view((await read()).state), error: "Someone just spun!" }, 409);
        return json(view(next));
      }

      return fail("Unknown action", 400);
    } catch (err) {
      console.error(err);
      return json({ error: "Server error" }, 500);
    }
  };
}
