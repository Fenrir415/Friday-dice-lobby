// Server-clock offset so every screen shares one timeline.
// Prefers fast round trips (least network delay), lets that preference age so the
// offset keeps updating, and re-syncs immediately if the device clock jumps.
export function createClock({ jumpMs = 1000, aging = 1.05 } = {}) {
  let offset = 0;
  let bestRtt = Infinity;
  return {
    learn(serverTime, sentAt, gotAt) {
      const rtt = Math.max(0, gotAt - sentAt);
      const candidate = serverTime + rtt / 2 - gotAt;
      bestRtt *= aging;
      const jumped = Number.isFinite(bestRtt) && Math.abs(candidate - offset) > jumpMs;
      if (!Number.isFinite(bestRtt) || rtt <= bestRtt * 1.5 || jumped) {
        offset = candidate;
        bestRtt = jumped ? rtt : Math.min(bestRtt, rtt);
      }
    },
    offset: () => offset,
    now: () => Date.now() + offset,
  };
}
