# Spin the Wheel + Game Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** Add a picker home page and a shared, live Spin-the-wheel game beside Dice.

**Architecture:** Each game is a folder under `public/` (`dice/`, `spin/`) plus one Netlify Function (`lobby`, `wheel`). `public/games.js` lists the games and drives the picker. The wheel's server stores one JSON state (`wheel/state`) and writes it with an ETag check so two simultaneous SPINs can't both win. The spin animation is a pure function of the server's spin plan and server time, so every screen shows the same frame.

**Tech Stack:** Vanilla HTML/CSS/JS (ES modules), SVG wheel, Netlify Functions v2, `@netlify/blobs`, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-21-spin-wheel-design.md`

## Global Constraints
- Test command: `node --test "test/*.test.mjs"` (Node 22 needs the glob).
- Names: 2–12, each trimmed and ≤ 24 chars; text rendered with `textContent` only.
- Spin starts `LEAD_MS = 1500` after the server accepts it. Funny chance `1/6`, never twice in a row.
- Dice behaviour unchanged. Its assets move to `public/dice/` and are referenced with absolute paths (`/dice/...`).
- Blobs store `dice-lobby`, key `wheel/state`, strong consistency.

## Review Focus
1. Two people press SPIN at the same moment → exactly one spin; the other sees "Someone just spun".
2. Someone opens /spin mid-spin → the wheel is already turning at the right angle, not restarting.
3. Edit or SPIN while spinning → refused with a clear message.
4. Names with `<script>`, blank lines, duplicates, 13+ names → shown literally; blanks dropped; 13+ refused.
5. A phone whose clock is wrong by minutes → still in sync (uses server time offset).

---

### Task 1: Picker + move Dice to /dice
**Files:** Create `public/index.html` (picker), `public/games.js`, `public/shared/base.css`. Move `public/{index.html→dice/index.html, app.js, style.css, dice-anim.js, view-model.mjs}` → `public/dice/`. Modify `test/view-model.test.mjs` import path, `scripts/dev-server.mjs` (serve `/x` → `public/x/index.html`, add `/api/wheel`).
**Interfaces:** `GAMES: {id, name, path, blurb, emoji}[]`.
- [ ] Tests still pass after the move; browser check: `/` shows Dice + Spin, `/dice` plays as before, "← Games" returns.
- [ ] Commit.

### Task 2: Wheel rules (pure)
**Files:** `lib/wheel-logic.mjs`, `public/spin/wheel-math.mjs`, tests `test/wheel-logic.test.mjs`, `test/wheel-math.test.mjs`.
**Interfaces:**
- `cleanNames(list: unknown) -> string[] | null`: drops blanks; null if <2, >12 or not an array.
- `planSpin({ names, lastStyle, rng, now }) -> Spin`, `Spin = { id, startAt, durationMs, turns, winnerIndex, landFraction, style }`. `style ∈ "normal"|"crawl"|"rocket"|"nudge"`.
- `spinEndsAt(spin) -> number`, `isSpinning(spin, now) -> boolean`.
- `finalRotation(spin, n) -> degrees`: `turns*360 + (360 - (winnerIndex + landFraction) * 360/n) % 360`.
- `rotationAt(spin, n, t) -> degrees`: 0 before `startAt`, `finalRotation` after the end, eased per style in between.
- `sliceAtArrow(rotation, n) -> index`.
**Tests:** a funny style is never chosen when `lastStyle` is funny; with rng→0.99 it's normal, with rng→0 it's funny; the winner is in range; `sliceAtArrow(finalRotation(s,n), n) === winnerIndex` for many random plans and every style; `rotationAt` is monotonic for normal/rocket/crawl; crawl lands with `landFraction < 0.08`; nudge passes through the previous slice before ending on the winner.
- [ ] RED → GREEN → commit.

### Task 3: Wheel keeper (function)
**Files:** `lib/wheel-handler.mjs`, `netlify/functions/wheel.mjs` (path `/api/wheel`), `test/wheel-handler.test.mjs`.
**Interfaces:** `createWheelHandler({ store, rng?, now? })`. GET → `{ names, spin, serverNow, spinning }`. POST `{action:"setNames", names:string[]}` and `{action:"spin"}`. 409 while spinning; 400 for bad names; spin with <2 names → 409. Writes use `getWithMetadata` + `setJSON(..., { onlyIfMatch: etag })` (or `onlyIfNew` for the first write); if not modified → 409 "Someone just spun" (for a spin) or "The wheel just changed" (for a names edit).
**Tests:** Review Focus 1, 3 and 4 against a fake store that supports ETags; names persist across GETs; `serverNow` is present.
- [ ] RED → GREEN → commit.

### Task 4: Spin page
**Files:** `public/spin/index.html`, `public/spin/spin.css`, `public/spin/app.js`.
- Uses the GET shape above. Clock offset = `serverNow - Date.now()` (smoothed).
- SVG wheel, slices in felt-table colours, arrow fixed at top. Names editor (textarea, Accept/Edit). SPIN button disabled while spinning or with <2 names. Countdown "Spinning in…" before `startAt`. Result "Landed on: NAME" after the end, with a short pop animation.
- `requestAnimationFrame` loop draws `rotationAt(spin, n, serverNow())`. Reduced motion: jump to the end.
- [ ] Browser test with two pages: B sees A's names; A spins and B's wheel turns in sync and lands on the same name; B opening mid-spin sees it turning; editing is refused while spinning.
- [ ] Commit.

### Task 5: Ship
- [ ] Full tests, final review, merge to `main`, push, verify live `/`, `/dice`, `/spin`.
