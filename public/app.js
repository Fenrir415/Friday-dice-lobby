import { viewModel, mergeSeen } from "./view-model.mjs";
import { playRoll } from "./dice-anim.js";

const $ = (id) => document.getElementById(id);
const els = {
  stage: $("stage"), call: $("call"), banner: $("banner"), join: $("join"), name: $("name"),
  game: $("game"), seats: $("seats"), roll: $("roll"), newRound: $("newRound"), note: $("note"),
};

const storage = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
let myId = storage.get("dice.playerId");
if (!myId) { myId = newId(); storage.set("dice.playerId", myId); }
els.name.value = storage.get("dice.name") ?? "";
let myToken = storage.get("dice.token");

let state = null;
const seen = new Map();          // "round/player" -> roll count already shown
const pending = new Set();       // player ids whose newest roll hasn't finished animating
const queue = [];
let playing = false;
let firstLoad = true;
let busy = false;

async function api(body) {
  const res = await fetch("/api/lobby", body
    ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
    : { cache: "no-store" });
  const data = await res.json();
  return { ok: res.ok, data };
}

function note(msg) { els.note.textContent = msg ?? ""; }

// Queue animations for any rolls we haven't shown yet.
function noticeRolls(s) {
  for (const p of s.players) {
    const key = `${s.roundId}/${p.id}`;
    const before = seen.get(key) ?? (firstLoad ? p.rolls.length : 0);
    for (let i = before; i < p.rolls.length; i++) {
      queue.push({ id: p.id, name: p.name, dice: p.rolls[i] });
      pending.add(p.id);
    }
    seen.set(key, mergeSeen(seen.get(key), p.rolls.length));
  }
  firstLoad = false;
  drain();
}

async function drain() {
  if (playing) return;
  playing = true;
  while (queue.length) {
    const item = queue.shift();
    await playRoll(els.stage, els.call, item.name, item.dice);
    if (!queue.some((q) => q.id === item.id)) pending.delete(item.id);
    render();
  }
  playing = false;
  render();
}

function render() {
  if (!state) return;
  const vm = viewModel(state, myId);
  const animating = playing || queue.length > 0;
  const showResult = vm.status === "done" && !animating;

  els.banner.textContent = vm.status === "done" && animating ? "Dice are rolling…" : vm.banner;
  els.banner.classList.toggle("won", showResult);

  els.join.hidden = vm.joined || vm.full || vm.status === "done";
  els.roll.hidden = !vm.canRoll;
  els.roll.disabled = busy || animating;
  els.roll.textContent = vm.status === "rolloff" ? "Roll again" : "Roll";
  els.newRound.hidden = !(vm.showNewRound && !animating);
  els.newRound.textContent = vm.newRoundLabel;

  els.seats.replaceChildren(...vm.rows.map((r) => {
    const li = document.createElement("li");
    li.className = "seat";
    li.classList.toggle("me", r.isMe);
    li.classList.toggle("rolloff", r.inRollOff);
    li.classList.toggle("winner", r.isWinner && showResult);

    const who = document.createElement("span");
    const nm = document.createElement("span");
    nm.className = "who";
    nm.textContent = r.isMe ? `${r.name} (you)` : r.name;
    const pick = document.createElement("span");
    pick.className = "pick";
    pick.textContent = r.game;
    who.append(nm, pick);

    const score = document.createElement("span");
    score.className = "score";
    if (pending.has(r.id)) { score.textContent = "🎲 …"; score.classList.add("pending"); }
    else if (r.needsRoll) { score.textContent = "to roll"; score.classList.add("pending"); }
    else score.textContent = r.latestTotal ?? "";

    const kick = document.createElement("button");
    kick.type = "button";
    kick.className = "kick";
    kick.textContent = "✕";
    kick.setAttribute("aria-label", `Remove ${r.name}`);
    kick.title = `Remove ${r.name}`;
    kick.hidden = !(r.needsRoll && vm.status !== "done");
    kick.addEventListener("click", () => act({ action: "remove", playerId: r.id }));

    li.append(who, score, kick);
    return li;
  }));
}

async function act(body) {
  note("");
  try {
    const { ok, data } = await api(body);
    if (data.yourToken) { myToken = data.yourToken; storage.set("dice.token", myToken); }
    if (data.players) { state = data; noticeRolls(data); render(); }
    if (!ok) note(data.error ?? "Something went wrong. Try again.");
    return { ok, data };
  } catch {
    note("Can't reach the table. Check your connection.");
    return { ok: false, data: {} };
  }
}

els.join.addEventListener("submit", async (e) => {
  e.preventDefault();
  storage.set("dice.name", els.name.value.trim());
  await act({ action: "join", playerId: myId, name: els.name.value, game: els.game.value, token: myToken });
});

els.roll.addEventListener("click", async () => {
  if (busy) return;
  busy = true;
  render();
  const me = state.players.find((p) => p.id === myId);
  const key = `${state.roundId}/${myId}`;
  // Mark our next roll as seen so the poll doesn't animate it a second time.
  seen.set(key, (me?.rolls.length ?? 0) + 1);
  pending.add(myId);
  const result = act({ action: "roll", playerId: myId, token: myToken }).then(({ ok, data }) => {
    if (!ok) { seen.set(key, me?.rolls.length ?? 0); throw new Error("roll failed"); }
    const mine = data.players.find((p) => p.id === myId);
    return mine.rolls[mine.rolls.length - 1];
  });
  playing = true;
  try {
    await playRoll(els.stage, els.call, me?.name ?? "You", result);
  } catch {
    els.stage.replaceChildren();
    els.call.textContent = "";
  }
  pending.delete(myId);
  playing = false;
  busy = false;
  drain();
});

els.newRound.addEventListener("click", () => {
  els.stage.replaceChildren();
  els.call.textContent = "";
  act({ action: "newRound" });
});

async function poll() {
  try {
    const { data } = await api();
    if (data.players) {
      if (state && state.roundId !== data.roundId) { els.stage.replaceChildren(); els.call.textContent = ""; }
      state = data;
      noticeRolls(data);
      render();
    }
  } catch { /* try again next tick */ }
  setTimeout(poll, 1000);
}
poll();
