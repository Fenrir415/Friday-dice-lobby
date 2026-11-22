// Turns a spin plan into a wheel angle at any moment. Pure and shared by every screen,
// so all players see the same frame at the same (server) time.
// Angles are degrees clockwise. Slice i covers [i, i+1) * 360/n measured clockwise from the top.
// The arrow is fixed at the top.

const mod = (a, m) => ((a % m) + m) % m;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const easeOutCubic = (p) => 1 - (1 - p) ** 3;
const easeOutQuart = (p) => 1 - (1 - p) ** 4;
const easeOutQuint = (p) => 1 - (1 - p) ** 5;
const easeInOut = (p) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);

export function finalRotation(spin, n) {
  const w = 360 / n;
  return spin.turns * 360 + mod(360 - (spin.winnerIndex + spin.landFraction) * w, 360);
}

export function sliceAtArrow(rotation, n) {
  const w = 360 / n;
  return Math.min(n - 1, Math.floor(mod(-rotation, 360) / w));
}

// Motion for each spin style. Each takes progress p (0..1) and the final rotation F.
const MOTIONS = {
  normal: (p, F) => F * easeOutCubic(p),
  rocket: (p, F) => F * easeOutQuart(p),
  crawl: (p, F) => F * easeOutQuint(p),
  nudge: (p, F, w, spin) => {
    // Stop in the middle of the slice just before the winner, hold, then nudge forward.
    const pause = F - (1.5 - spin.landFraction) * w;
    if (p < 0.82) return pause * easeOutCubic(p / 0.82);
    if (p < 0.9) return pause;
    return pause + (F - pause) * easeInOut((p - 0.9) / 0.1);
  },
};

export function rotationAt(spin, n, t) {
  if (!spin) return 0;
  const p = clamp01((t - spin.startAt) / spin.durationMs);
  const F = finalRotation(spin, n);
  if (p >= 1) return F;
  if (p <= 0) return 0;
  return (MOTIONS[spin.style] ?? MOTIONS.normal)(p, F, 360 / n, spin);
}
