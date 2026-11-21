// Lobby keeper. Each player lives under their own key so simultaneous
// rolls never overwrite each other (Netlify Blobs has no locking).
import { rollDice, computeOutcome, cleanText, MAX_PLAYERS, MIN_PLAYERS } from "./lobby-logic.mjs";

// A round this old can be cleared by anyone (e.g. last Friday's leftovers).
export const STALE_MS = 6 * 60 * 60 * 1000;

const ROUND_KEY = "meta/round";
const playerPrefix = (roundId) => `r/${roundId}/`;
const IDS = /^[A-Za-z0-9-]{1,64}$/;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export function createHandler({ store, rng = Math.random, now = Date.now }) {
  const newRoundId = () => `${now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

  async function currentRound() {
    const meta = await store.get(ROUND_KEY, { type: "json" });
    if (meta?.roundId) return { roundId: meta.roundId, createdAt: meta.createdAt ?? 0 };
    const fresh = { roundId: newRoundId(), createdAt: now() };
    await store.setJSON(ROUND_KEY, fresh);
    return fresh;
  }

  async function loadPlayers(roundId) {
    const { blobs } = await store.list({ prefix: playerPrefix(roundId) });
    const players = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })));
    return players.filter(Boolean).sort((a, b) => a.joinedAt - b.joinedAt);
  }

  // Tokens prove "this is my seat"; they never leave the server except to their owner.
  const strip = ({ token, ...p }) => p;
  async function snapshot(round) {
    const { roundId } = round;
    const players = (await loadPlayers(roundId)).map(strip);
    const outcome = computeOutcome(players);
    const stale = now() - round.createdAt > STALE_MS;
    // Clearing is allowed after a winner, with fewer than 2 players, or for an old round.
    const canReset = outcome.status === "done" || players.length < MIN_PLAYERS || stale;
    return { roundId, players, outcome, canReset };
  }
  async function rawPlayer(roundId, playerId) {
    return store.get(playerPrefix(roundId) + playerId, { type: "json" });
  }
  const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

  return async function handler(req) {
    try {
      const round = await currentRound();
      const roundId = round.roundId;
      if (req.method === "GET") return json(await snapshot(round));
      if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

      let body;
      try { body = await req.json(); } catch { return json({ error: "Bad JSON" }, 400); }
      const { action, playerId } = body ?? {};
      const state = await snapshot(round);
      const fail = (error, status) => json({ ...state, error }, status);

      if (action === "newRound") {
        if (!state.canReset) return fail("Round not finished", 409);
        const fresh = newRoundId();
        const next = { roundId: fresh, createdAt: now() };
        await store.setJSON(ROUND_KEY, next);
        for (const p of state.players) await store.delete(playerPrefix(roundId) + p.id);
        return json(await snapshot(next));
      }

      if (typeof playerId !== "string" || !IDS.test(playerId)) return fail("Missing player id", 400);
      const key = playerPrefix(roundId) + playerId;
      const me = state.players.find((p) => p.id === playerId);

      if (action === "join") {
        const name = cleanText(body.name, 24);
        const game = cleanText(body.game, 40);
        if (!name || !game) return fail("Name and game are required", 400);
        if (state.outcome.status === "done") return fail("Round finished", 409);
        if (me) {
          const mine = await rawPlayer(roundId, playerId);
          if (!mine || mine.token !== body.token) return fail("That seat belongs to someone else", 403);
          await store.setJSON(key, { ...mine, name, game });
          return json({ ...(await snapshot(round)), yourToken: mine.token });
        }
        if (state.players.some((p) => sameName(p.name, name))) return fail("Name taken", 409);
        if (state.players.length >= MAX_PLAYERS) return fail("Lobby full", 409);
        const token = crypto.randomUUID();
        await store.setJSON(key, { id: playerId, name, game, rolls: [], joinedAt: now(), token });
        // Two people may have grabbed the last seat at once: the later joiner backs out.
        const after = await loadPlayers(roundId);
        if (after.length > MAX_PLAYERS) {
          const seated = [...after].sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id)).slice(0, MAX_PLAYERS);
          if (!seated.some((p) => p.id === playerId)) {
            await store.delete(key);
            return json({ ...(await snapshot(round)), error: "Lobby full" }, 409);
          }
        }
        return json({ ...(await snapshot(round)), yourToken: token });
      }

      if (action === "roll") {
        if (!me || !state.outcome.needsRoll.includes(playerId)) return fail("Not your roll", 409);
        const mine = await rawPlayer(roundId, playerId);
        if (!mine || mine.token !== body.token) return fail("That seat belongs to someone else", 403);
        await store.setJSON(key, { ...mine, rolls: [...mine.rolls, rollDice(rng)] });
        return json(await snapshot(round));
      }

      if (action === "remove") {
        if (state.outcome.status === "done") return fail("Round finished", 409);
        // Only players still waiting to roll can be removed, so nobody can wipe a roll and re-roll.
        if (!state.outcome.needsRoll.includes(playerId)) return fail("Only players who haven't rolled can be removed", 409);
        await store.delete(key);
        return json(await snapshot(round));
      }

      return fail("Unknown action", 400);
    } catch (err) {
      console.error(err);
      return json({ error: "Server error" }, 500);
    }
  };
}
