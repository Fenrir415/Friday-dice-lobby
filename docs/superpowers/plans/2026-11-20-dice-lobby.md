# Friday Night Dice Lobby Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A shared web lobby where each player enters a game pick, rolls 2d6 with their own button, and the highest roll's pick wins.

**Architecture:** Static `public/index.html` + `public/app.js` polls `GET /api/lobby` every 1s. One Netlify Function (`netlify/functions/lobby.mjs`) is the lobby keeper. It stores each player as their **own Blobs key** (`<roundId>/<playerId>`) so concurrent rolls never overwrite each other, which matters because Blobs has no concurrency control. Winner/tie logic is a pure module shared by tests and the function.

**Tech Stack:** Vanilla HTML/CSS/JS, Node 22 ESM, Netlify Functions v2, `@netlify/blobs` (strong consistency), `node --test`.

**Spec:** `docs/design.md`

## Global Constraints
- No npm installs locally (no network). `@netlify/blobs` is declared in `package.json` for Netlify's remote build only; local tests inject a fake store.
- Rolls are generated server-side only: two six-sided dice, total 2–12.
- Blobs store: `getStore({ name: "dice-lobby", consistency: "strong" })`.
- All user text is rendered with `textContent`, never `innerHTML`. Name ≤ 24 chars, game ≤ 40 chars, trimmed, non-empty.
- Players per round: min 2, max 4 (`MIN_PLAYERS = 2`, `MAX_PLAYERS = 4`, exported from `lib/lobby-logic.mjs`).
- Poll interval 1000 ms. No accounts, no Discord integration.

## Review Focus
1. Double-click or double-tap Roll → only one roll is recorded (server rejects a roll the player isn't owed).
2. The same person in two tabs or devices → same `playerId` from localStorage means one lobby entry; re-joining updates the pick.
3. A screen that's still open from an old round after "New round" → that player shows as not joined and sees the join form, with no errors.
4. A name or game containing `<script>` → displayed literally.
5. An AFK player removed mid-round, or during a roll-off → the winner recomputes correctly.

---

### Task 1: Lobby rules (pure logic)

**Files:**
- Create: `lib/lobby-logic.mjs`
- Test: `test/lobby-logic.test.mjs`

**Interfaces:**
- Produces:
  - `rollDice(rng = Math.random) -> [number, number]`: each die 1–6.
  - `total(roll: [number, number]) -> number`
  - `computeOutcome(players: Player[]) -> { status: "waiting"|"rolloff"|"done", winnerId: string|null, needsRoll: string[] }`
  - `Player = { id: string, name: string, game: string, rolls: [number,number][] , joinedAt: number }`
  - `cleanText(s: unknown, max: number) -> string|null`: trims and caps length; null if empty.

Algorithm for `computeOutcome`: start with all players as candidates at depth 0. At depth d, if any candidate lacks `rolls[d]`, return `needsRoll` = those candidates and status `"waiting"` (d=0) or `"rolloff"` (d>0). Otherwise keep only the candidates with the max `total(rolls[d])`. If exactly one remains, return `"done"` with that winner. Otherwise go to d+1. No players → `"waiting"`, `needsRoll: []`. Fewer than `MIN_PLAYERS` → never `"done"`: return `"waiting"` with `needsRoll` = the players who haven't rolled yet.

- [ ] **Step 1: Write failing tests** `test/lobby-logic.test.mjs`
  - `rollDice(() => 0)` → `[1,1]`; `rollDice(() => 0.999)` → `[6,6]`
  - No players → `{status:"waiting", winnerId:null, needsRoll:[]}`
  - A=[[3,3]], B=[] → waiting, `needsRoll:["B"]`
  - A=[[6,6]] alone → waiting, `needsRoll:[]` (need 2 players)
  - A=[[6,6]], B=[[1,2]] → done, winner A
  - A=[[3,3]], B=[[4,2]], C=[[1,1]] → rolloff, `needsRoll:["A","B"]`
  - A=[[3,3],[6,5]], B=[[4,2],[1,1]], C=[[1,1]] → done, winner A
  - A=[[3,3],[6,5]], B=[[4,2]] (B not yet rolled off) → rolloff, `needsRoll:["B"]`
  - `cleanText("  hi  ", 24)` → `"hi"`; `cleanText("", 24)` → null; `cleanText("x".repeat(50), 40).length` → 40; `cleanText(5, 10)` → null
- [ ] **Step 2:** `node --test test/` → FAIL (module missing)
- [ ] **Step 3:** Implement `lib/lobby-logic.mjs`
- [ ] **Step 4:** `node --test test/` → all pass
- [ ] **Step 5:** `git add -A && git commit -m "feat: lobby winner and tie-break rules"`

### Task 2: Lobby keeper (function)

**Files:**
- Create: `lib/lobby-handler.mjs` (testable core), `netlify/functions/lobby.mjs` (thin wrapper), `netlify.toml`, `package.json`
- Test: `test/lobby-handler.test.mjs`

**Interfaces:**
- Consumes: Task 1 exports.
- Produces: `createHandler({ store, rng?, now? }) -> (req: Request) => Promise<Response>`. `store` has `get(key,{type:"json"})`, `setJSON(key,val)`, `delete(key)`, `list({prefix}) -> {blobs:[{key}]}`.
- HTTP (path `/api/lobby`, via `export const config = { path: "/api/lobby" }`):
  - `GET` → `200 { roundId, players: Player[] (sorted by joinedAt), outcome }`
  - `POST {action:"join", playerId, name, game}` → upserts `<roundId>/<playerId>`, keeping existing rolls. Rejected with 409 once the outcome is `done`.
  - `POST {action:"roll", playerId}` → 409 unless playerId ∈ `outcome.needsRoll`. Otherwise appends `rollDice(rng)`.
  - `POST {action:"remove", playerId}` → deletes that key. 409 if `done`.
  - `POST {action:"newRound"}` → writes `meta/round = {roundId: <new id>}`. 409 unless `done`.
  - Bad input → 400 `{error}`. Every POST returns the same body as GET.
- Current round: `meta/round` (if missing, create one with `roundId = String(now())`).
- `netlify.toml`: `[build] publish = "public"`, `[functions] directory = "netlify/functions"`, `node_bundler = "esbuild"`.
- `package.json`: `"type":"module"`, dependency `"@netlify/blobs": "^8.1.0"`, script `"test": "node --test test/"`.

- [ ] **Step 1: Write failing tests** using an in-memory fake store (a Map) and `rng` stubs:
  - GET on an empty store → `players:[]`, `outcome.status:"waiting"`
  - join A and B → GET lists both. Join A again with a new game → still 2 players, A's game updated.
  - join with name `""` → 400
  - 4 players joined → a 5th new playerId joining → 409 `{error:"Lobby full"}`. An existing player re-joining still works.
  - roll A twice → second roll is 409, and A has 1 roll (Review Focus 1)
  - A rolls 12, B rolls 2 → `done`, winner A. Join C afterwards → 409.
  - A and B tie → B tries roll-off before A → allowed; C (not tied) roll → 409
  - remove the tied B during the roll-off → `done`, winner A (Review Focus 5)
  - newRound when not done → 409. When done → the old players are gone, and a GET returns a new roundId (Review Focus 3).
  - join with name `"<script>x</script>"` → stored as-is, ≤24 chars (escaping is the client's job)
- [ ] **Step 2:** `node --test test/` → FAIL
- [ ] **Step 3:** Implement `lib/lobby-handler.mjs`. Then `netlify/functions/lobby.mjs` = `import { getStore } from "@netlify/blobs"`, which exports a default handler that builds `createHandler({ store: getStore({name:"dice-lobby", consistency:"strong"}) })` per request, plus `config`.
- [ ] **Step 4:** `node --test test/` → all pass
- [ ] **Step 5:** Commit `feat: lobby keeper function`

### Task 3: Lobby page

**Files:**
- Create: `public/index.html`, `public/style.css`, `public/app.js`, `public/view-model.mjs` (served to the browser and imported by the tests)
- Test: `test/view-model.test.mjs`

**Interfaces:**
- Consumes: the Task 2 HTTP API.
- Produces: `viewModel(state, myId) -> { joined: boolean, canRoll: boolean, rows: {id,name,game,latestTotal,dice,isWinner,isMe,inRollOff}[], banner: string, showNewRound: boolean }`
- Banner copy: fewer than 2 players → `"Need at least 2 players"`; lobby full and not joined → `"Lobby full (4/4)"`; waiting → `"Waiting on N to roll…"`; rolloff → `"Tie! Roll-off: <names>"`; done → `"Tonight: <GAME> (<name> rolled <total>)"`.

- [ ] **Step 1: Failing tests:** `myId` not in players → `joined:false`, `canRoll:false` (Review Focus 3). `myId` in `needsRoll` → `canRoll:true`. Done → exactly one row with `isWinner:true`, `showNewRound:true`. Banner strings exactly as above.
- [ ] **Step 2:** `node --test test/` → FAIL
- [ ] **Step 3:** Implement `public/view-model.mjs`. `app.js` details:
  - `playerId` comes from localStorage (`crypto.randomUUID()` on first visit), with the name remembered there too, wrapped in try/catch.
  - Poll every 1000 ms.
  - Render all user text via `textContent` (Review Focus 4).
  - The Roll button disables itself until the next poll (Review Focus 1).
  - **Live dice table (Douglas's request):** a shared felt "table" panel. Whenever any player's roll count goes up on a poll, every screen queues an animation in `public/dice-anim.js`, `playRoll(tableEl, name, [d1,d2]) -> Promise<void>`. In it, two 3D CSS dice tumble and bounce across the table for ~1.6 s, land on the real faces, and show "<name> rolled <total>!". Animations play one after another if several arrive in the same poll. That player's total in the lobby list stays hidden ("🎲 …") until their animation finishes. The winner panel waits for the queue to empty. The roller's own screen starts tumbling the moment they click and lands when the server answers (at least 1.6 s). No animation is replayed for rolls that already existed when the page loaded.
  - There's a big winner panel and Remove (✕) on rows that still need to roll.
  - Dark game-night styling that works on phones.
- [ ] **Step 4:** `node --test test/` → pass. Open `public/index.html` in Playwright against a stubbed `/api/lobby` and screenshot it at desktop and phone widths to check the layout.
- [ ] **Step 5:** Commit `feat: lobby page`

### Task 4: Deploy and live check

- [ ] **Step 1:** Create a Netlify project `friday-dice-lobby` (with a suffix if taken), via the connector.
- [ ] **Step 2:** Deploy via `netlify-deploy-services-updater` → `deploy-site` with the siteId. Add `.netlify` to `.gitignore`.
- [ ] **Step 3:** Verify live. Open the URL in a browser: join as two players in two tabs, roll both, see the winner, then New round. Expect the rolls to show in the other tab within ~2 s.
- [ ] **Step 4:** Commit and hand the link to Douglas.
