// Wheel rules used by the server: what names are allowed and how a spin is planned.
// The client turns a plan into motion with public/spin/wheel-math.mjs.
import { cleanText } from "./lobby-logic.mjs";
import { sliceAtArrow } from "../public/spin/wheel-math.mjs";

export const MIN_NAMES = 2;
export const MAX_NAMES = 12;
export const NAME_MAX_CHARS = 24;
export const LEAD_MS = 1500;          // every screen starts the spin together this long after SPIN
export const FUNNY_CHANCE = 1 / 6;    // how often a spin is a funny one
export const FUNNY_STYLES = ["crawl", "rocket", "nudge", "slip"];

export function cleanNames(list) {
  if (!Array.isArray(list)) return null;
  if (list.some((x) => typeof x !== "string")) return null;
  const names = list.map((x) => cleanText(x, NAME_MAX_CHARS)).filter(Boolean);
  return names.length >= MIN_NAMES && names.length <= MAX_NAMES ? names : null;
}

const between = (rng, lo, hi) => lo + rng() * (hi - lo);

// How each kind of spin feels. Add a new style here (and its motion in wheel-math.mjs).
const STYLE_SHAPES = {
  normal: { turns: [4, 7], ms: [4500, 7000], land: [0.15, 0.85] },
  rocket: { turns: [14, 18], ms: [3800, 4600], land: [0.15, 0.85] }, // whips around way too fast
  crawl: { turns: [3, 4], ms: [9000, 11000], land: [0.01, 0.06] },  // creeps and barely tips over
  nudge: { turns: [4, 6], ms: [6500, 7500], land: [0.3, 0.7] },     // stops, then nudges one more
  slip: { turns: [0, 0], ms: [1200, 1800], land: [0.3, 0.7] },      // a feeble spin to the next slice; doesn't count
};

export function planSpin({ names, lastStyle = "normal", fromAngle = 0, rng = Math.random, now = Date.now() }) {
  const funnyAllowed = !FUNNY_STYLES.includes(lastStyle);
  const style = funnyAllowed && rng() < FUNNY_CHANCE
    ? FUNNY_STYLES[Math.min(FUNNY_STYLES.length - 1, Math.floor(rng() * FUNNY_STYLES.length))]
    : "normal";
  const shape = STYLE_SHAPES[style];
  const n = names.length;
  let winnerIndex = Math.min(n - 1, Math.floor(rng() * n));
  // A slip only creeps on to the next slice (the wheel turns clockwise, so indexes count down).
  if (style === "slip") winnerIndex = (sliceAtArrow(fromAngle, n) - 1 + n) % n;
  const landFraction = between(rng, ...shape.land);
  const turns = Math.round(between(rng, ...shape.turns));
  const durationMs = Math.round(between(rng, ...shape.ms));
  const id = now.toString(36) + Math.floor(Math.random() * 1e9).toString(36);
  return { id, startAt: now + LEAD_MS, durationMs, turns, winnerIndex, landFraction, style, fromAngle };
}

export const spinEndsAt = (spin) => spin.startAt + spin.durationMs;
export const isSpinning = (spin, now) => Boolean(spin) && now < spinEndsAt(spin);
