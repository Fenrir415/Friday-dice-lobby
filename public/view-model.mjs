// Turns lobby state into what the screen shows. Shared by the page and tests.
export const MAX_PLAYERS = 4;
const MIN_PLAYERS = 2;

const sum = (d) => d[0] + d[1];

export function viewModel(state, myId) {
  const { players, outcome } = state;
  const joined = players.some((p) => p.id === myId);
  const full = players.length >= MAX_PLAYERS;
  const nameOf = (id) => players.find((p) => p.id === id)?.name ?? "?";
  // During a roll-off, everyone still tied is "in" it, including those who already rolled again.
  const rollOff = new Set();
  if (outcome.status === "rolloff") {
    const depth = Math.min(...players.filter((p) => outcome.needsRoll.includes(p.id)).map((p) => p.rolls.length));
    let tied = players;
    for (let k = 0; k < depth; k++) {
      const best = Math.max(...tied.map((p) => sum(p.rolls[k])));
      tied = tied.filter((p) => sum(p.rolls[k]) === best);
    }
    for (const p of tied) rollOff.add(p.id);
  }

  const rows = players.map((p) => {
    const last = p.rolls[p.rolls.length - 1];
    return {
      id: p.id,
      name: p.name,
      game: p.game,
      rollCount: p.rolls.length,
      latestTotal: last ? sum(last) : null,
      dice: last ?? null,
      isWinner: outcome.winnerId === p.id,
      isMe: p.id === myId,
      inRollOff: rollOff.has(p.id),
      needsRoll: outcome.needsRoll.includes(p.id),
    };
  });

  let banner;
  if (outcome.status === "done") {
    const w = rows.find((r) => r.isWinner);
    banner = `Tonight: ${w.game.toUpperCase()} (${w.name} rolled ${w.latestTotal})`;
  } else if (outcome.status === "rolloff") {
    banner = `Tie! Roll-off: ${[...rollOff].map(nameOf).join(", ")}`;
  } else if (!joined && full) {
    banner = `Lobby full (${MAX_PLAYERS}/${MAX_PLAYERS})`;
  } else if (players.length < MIN_PLAYERS) {
    banner = "Need at least 2 players";
  } else {
    banner = `Waiting on ${outcome.needsRoll.length} to roll…`;
  }

  return {
    joined,
    full,
    canRoll: joined && outcome.needsRoll.includes(myId),
    rows,
    banner,
    showNewRound: (Boolean(state.canReset) || outcome.status === "done") && players.length > 0,
    newRoundLabel: outcome.status === "done" ? "Start a new round" : "Clear the table",
    status: outcome.status,
  };
}

// Roll counts we've already animated only ever go up, so a stale poll can't re-queue a roll.
export const mergeSeen = (prev, count) => Math.max(prev ?? 0, count);
