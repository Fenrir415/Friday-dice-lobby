// Pure lobby rules shared by the server and tests.
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;

const die = (rng) => Math.min(6, Math.floor(rng() * 6) + 1);

export function rollDice(rng = Math.random) {
  return [die(rng), die(rng)];
}

export function total(roll) {
  return roll[0] + roll[1];
}

export function computeOutcome(players) {
  if (players.length === 0) return { status: "waiting", winnerId: null, needsRoll: [] };

  let candidates = players;
  for (let depth = 0; ; depth++) {
    const missing = candidates.filter((pl) => !pl.rolls[depth]);
    if (missing.length > 0) {
      return {
        status: depth === 0 ? "waiting" : "rolloff",
        winnerId: null,
        needsRoll: missing.map((pl) => pl.id),
      };
    }
    // Everyone has rolled, but a lone player can't win.
    if (players.length < MIN_PLAYERS) return { status: "waiting", winnerId: null, needsRoll: [] };

    const best = Math.max(...candidates.map((pl) => total(pl.rolls[depth])));
    candidates = candidates.filter((pl) => total(pl.rolls[depth]) === best);
    if (candidates.length === 1) return { status: "done", winnerId: candidates[0].id, needsRoll: [] };
  }
}

export function cleanText(s, max) {
  if (typeof s !== "string") return null;
  const t = s.trim().slice(0, max).trim();
  return t.length ? t : null;
}
