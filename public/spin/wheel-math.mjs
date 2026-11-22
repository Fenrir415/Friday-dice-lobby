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

// A spin starts from where the wheel last rested (spin.fromAngle, 0..360) and turns at least
// spin.turns full circles before landing inside the winner's slice.
export function finalRotation(spin, n) {
  const w = 360 / n;
  const from = spin.fromAngle ?? 0;
  const target = mod(360 - (spin.winnerIndex + spin.landFraction) * w, 360);
  return from + spin.turns * 360 + mod(target - from, 360);
}

export function sliceAtArrow(rotation, n) {
  const w = 360 / n;
  return Math.min(n - 1, Math.floor(mod(-rotation, 360) / w));
}

// Motion for each spin style: how far (0..D degrees) the wheel has turned at progress p.
// D is the total distance of the spin. Add a new style here (and its shape in lib/wheel-logic.mjs).
const MOTIONS = {
  normal: (p, D) => D * easeOutCubic(p),
  rocket: (p, D) => D * easeOutQuart(p),
  crawl: (p, D) => D * easeOutQuint(p),
  nudge: (p, D, w, spin) => {
    // Stop in the middle of the slice just before the winner, hold, then nudge forward.
    const pause = D - (1.5 - spin.landFraction) * w;
    if (p < 0.82) return pause * easeOutCubic(p / 0.82);
    if (p < 0.9) return pause;
    return pause + (D - pause) * easeInOut((p - 0.9) / 0.1);
  },
};

export function rotationAt(spin, n, t) {
  if (!spin) return 0;
  const from = spin.fromAngle ?? 0;
  const p = clamp01((t - spin.startAt) / spin.durationMs);
  const F = finalRotation(spin, n);
  if (p >= 1) return F;
  if (p <= 0) return from;
  return from + (MOTIONS[spin.style] ?? MOTIONS.normal)(p, F - from, 360 / n, spin);
}
