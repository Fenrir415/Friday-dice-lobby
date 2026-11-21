import { viewModel, mergeSeen, arrivals, seatSlots, tabTitle } from "./view-model.mjs";
import { playRoll } from "./dice-anim.js";

const $ = (id) => document.getElementById(id);
const els = {
  stage: $("stage"), call: $("call"), banner: $("banner"), join: $("join"), name: $("name"),
  game: $("game"), seats: $("seats"), roll: $("roll"), newRound: $("newRound"), note: $("note"),
  tableSeats: $("tableSeats"), toasts: $("toasts"), alerts: $("alerts"),
};

// ---- Join alerts ----
let knownIds = null;          // player ids already seen this round (null until first load)
let knownRound = null;
const justArrived = new Set(); // seats to animate on next render
let audio = null;
const unlockAudio = () => {
  try { audio ??= new (window.AudioContext || window.webkitAudioContext)(); audio.resume?.(); } catch { /* no sound */ }
};
window.addEventListener("pointerdown", unlockAudio, { once: true });
window.addEventListener("keydown", unlockAudio, { once: true });

function chime() {
  if (!audio || audio.state !== "running") return;
  const t = audio.currentTime;
  [660, 990].forEach((f, i) => {
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = f; o.type = "triangle";
    g.gain.setValueAtTime(0.0001, t + i * 0.12);
    g.gain.exponentialRampToValueAtTime(0.18, t + i * 0.12 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.12 + 0.35);
    o.connect(g).connect(audio.destination);
    o.start(t + i * 0.12); o.stop(t + i * 0.12 + 0.4);
  });
}

function toast(title, detail) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = title;
  const small = document.createElement("small");
  small.textContent = detail;
  el.appendChild(small);
  els.toasts.appendChild(el);
  setTimeout(() => el.remove(), 5000);
}

const canNotify = () => "Notification" in window;
function refreshAlertsButton() {
  els.alerts.hidden = !(canNotify() && Notification.permission === "default");
}
els.alerts.addEventListener("click", async () => {
  try { await Notification.requestPermission(); } catch { /* unsupported */ }
  refreshAlertsButton();
  if (canNotify() && Notification.permission === "granted") toast("Join alerts are on", "You'll get a pop-up when someone sits down, while this page is open.");
});
refreshAlertsButton();

function announceArrivals(s) {
  if (knownRound !== s.roundId) {
    // New round: everyone after this counts as a newcomer (but not on the very first load).
    knownIds = knownRound === null ? null : new Set();
    knownRound = s.roundId;
  }
  const fresh = arrivals(knownIds, s.players, myId);
  for (const p of fresh) {
    justArrived.add(p.id);
    toast(`🎲 ${p.name} took a seat`, `Wants to play ${p.game}`);
    if (document.hidden && canNotify() && Notification.permission === "granted") {
      try { new Notification(`${p.name} took a seat`, { body: `Wants to play ${p.game}`, tag: `join-${p.id}` }); } catch { /* ignore */ }
    }
  }
  if (fresh.length) chime();
  knownIds = new Set(s.players.map((p) => p.id));
}

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

  document.title = tabTitle(state.players);
  const chair = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M7 3v18M7 12h10M17 12v9M7 3h3"/></svg>';
  els.tableSeats.replaceChildren(...seatSlots(state.players, myId).map((seat) => {
    const li = document.createElement("li");
    li.className = "table-seat";
    li.classList.toggle("taken", seat.taken);
    li.classList.toggle("me", seat.isMe);
    li.classList.toggle("arrived", seat.taken && justArrived.has(seat.id));
    const token = document.createElement("span");
    token.className = "seat-token";
    if (seat.taken) token.textContent = seat.initial; else token.innerHTML = chair;
    li.appendChild(token);
    li.setAttribute("aria-label", seat.taken ? `${seat.name} is seated` : "Empty seat");
    const nm = document.createElement("span");
    nm.className = seat.taken ? "seat-name" : "seat-name open";
    nm.textContent = seat.taken ? (seat.isMe ? "You" : seat.name) : "Open";
    li.appendChild(nm);
    return li;
  }));
  justArrived.clear();

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
    if (data.players) { state = data; announceArrivals(data); noticeRolls(data); render(); }
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
      announceArrivals(data);
      noticeRolls(data);
      render();
    }
  } catch { /* try again next tick */ }
  setTimeout(poll, 1000);
}
poll();
