# Spin the Wheel + Game Picker — Design (approved 2026-11-21)

## Intent
Douglas's group sometimes picks with a spinning wheel his brother types names into and streams.
Make a shared wheel everyone opens on their own device, in the same app as Dice.

## Decided with Douglas
- One app. The link opens a picker with two choices: **Dice** and **Spin**.
- Spin is shared and live: anyone with the link sees the same wheel and the same spin, no streaming.
- Open table: anyone can edit names and press SPIN (locked while spinning).
- Minimum 2 names; names are accepted (Accept) before the wheel is drawn; Edit reopens.
- Arrow at the top shows where the wheel lands.
- Varied spin speeds; occasionally (not overdone) a funny spin for the audience.
- Structure the code so more games/features can be added later.

## Claude's calls (correctable)
- Paths: `/` picker, `/dice` (unchanged game + "← Games" link), `/spin`.
- 2–12 names, ≤24 chars each.
- Server picks winner + spin plan; all screens play it from a shared start time 1.5 s ahead; late joiners join mid-spin.
- Funny spin ~1 in 6, never twice in a row: crawl (barely tips over), rocket, stop-then-nudge.
- Concurrent SPIN presses: one wins (conditional write); others get "Someone just spun".
- Names persist on the server. No sound, no history, no host mode.
- Picker is generated from one games list (`public/games.js`); each game in its own folder; shared base styles.

## Approaches
1. Netlify Function + Blobs + 1 s polling (chosen; same as Dice, no new accounts).
2. Realtime service (Firebase/Supabase): instant, but another account and keys.
3. Single-screen wheel streamed on Discord: rejected by Douglas in favour of shared.
