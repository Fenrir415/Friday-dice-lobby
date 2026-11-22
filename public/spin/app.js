import { rotationAt, sliceAtArrow } from "/spin/wheel-math.mjs";
import { sliceColors, labelSize } from "/spin/wheel-look.mjs";
import { createClock } from "/spin/clock.mjs";

const $ = (id) => document.getElementById(id);
const els = {
  wheel: $("wheel"), spinner: $("spinner"), slices: $("slices"), pegs: $("pegs"), bulbs: $("bulbs"),
  pointer: $("pointer"), result: $("result"), spinBtn: $("spinBtn"),
  namesView: $("namesView"), namesList: $("namesList"), editBtn: $("editBtn"),
  editor: $("editor"), namesInput: $("namesInput"), count: $("count"), acceptBtn: $("acceptBtn"), cancelBtn: $("cancelBtn"),
  note: $("note"),
};
const SVG = "http://www.w3.org/2000/svg";
const R_SLICE = 214;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let state = { names: [], spin: null, spinning: false };
let editing = false;
let drawnKey = "";            // which names the wheel is currently drawn for
let announcedSpin = null;     // spin id whose result we've shown
let firstLoad = true;
let busy = false;

// ---- Server clock: keep every screen on the same timeline ----
const clock = createClock();
const serverNow = () => clock.now();

async function api(body) {
  const sentAt = Date.now();
  const res = await fetch("/api/wheel", body
    ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
    : { cache: "no-store" });
  const data = await res.json();
  if (typeof data.serverNow === "number") clock.learn(data.serverNow, sentAt, Date.now());
  return { ok: res.ok, data };
}

function note(msg) { els.note.textContent = msg ?? ""; }

// ---- Drawing the wheel ----
function polar(r, deg) {
  const a = ((deg - 90) * Math.PI) / 180;
  return [r * Math.cos(a), r * Math.sin(a)];
}

function drawBulbs() {
  const count = 28;
  for (let i = 0; i < count; i++) {
    const [x, y] = polar(243, (360 / count) * i);
    const c = document.createElementNS(SVG, "circle");
    c.setAttribute("cx", x.toFixed(1)); c.setAttribute("cy", y.toFixed(1)); c.setAttribute("r", "5.5");
    c.setAttribute("class", "bulb");
    els.bulbs.appendChild(c);
  }
}

function drawWheel(names) {
  const key = JSON.stringify(names);
  if (key === drawnKey) return;
  drawnKey = key;
  els.slices.replaceChildren();
  els.pegs.replaceChildren();
  const n = names.length;

  if (n < 2) {
    const c = document.createElementNS(SVG, "circle");
    c.setAttribute("r", R_SLICE); c.setAttribute("fill", "#2a2340");
    const t = document.createElementNS(SVG, "text");
    t.setAttribute("text-anchor", "middle"); t.setAttribute("y", "-70");
    t.setAttribute("fill", "#b9ae98"); t.setAttribute("font-size", "22"); t.setAttribute("font-family", "Barlow, sans-serif");
    t.textContent = "Add at least 2 names";
    els.slices.append(c, t);
    return;
  }

  const w = 360 / n;
  const colors = sliceColors(n);
  names.forEach((name, i) => {
    const [x1, y1] = polar(R_SLICE, i * w);
    const [x2, y2] = polar(R_SLICE, (i + 1) * w);
    const path = document.createElementNS(SVG, "path");
    path.setAttribute("d", `M0 0 L${x1.toFixed(2)} ${y1.toFixed(2)} A${R_SLICE} ${R_SLICE} 0 ${w > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`);
    path.setAttribute("fill", colors[i].fill);
    path.setAttribute("stroke", "#fff4d6"); path.setAttribute("stroke-width", "2");
    els.slices.appendChild(path);

    // Name runs along the middle of the slice, from rim toward the hub.
    const mid = i * w + w / 2;
    const text = document.createElementNS(SVG, "text");
    text.setAttribute("class", "slice-label");
    text.setAttribute("transform", `rotate(${mid}) translate(0 ${-R_SLICE + 18}) rotate(90)`);
    text.setAttribute("text-anchor", "start");
    text.setAttribute("dominant-baseline", "central");
    text.setAttribute("font-size", labelSize(n, name));
    text.setAttribute("fill", colors[i].text);
    text.setAttribute("stroke", colors[i].text === "#ffffff" ? "rgba(0,0,0,.35)" : "rgba(255,255,255,.35)");
    text.setAttribute("stroke-width", "3");
    text.textContent = name;
    els.slices.appendChild(text);
    fitLabel(text, LABEL_ROOM);

    const [px, py] = polar(R_SLICE - 6, i * w);
    const peg = document.createElementNS(SVG, "circle");
    peg.setAttribute("cx", px.toFixed(1)); peg.setAttribute("cy", py.toFixed(1)); peg.setAttribute("r", "5");
    peg.setAttribute("class", "peg");
    els.pegs.appendChild(peg);
  });
}

// Room for a name between the rim and the gold hub (radius 38), with a little margin.
const LABEL_ROOM = R_SLICE - 18 - 38 - 10;
function fitLabel(text, room) {
  let len = 0;
  try { len = text.getComputedTextLength(); } catch { return; }
  if (len > room) {
    const size = parseFloat(text.getAttribute("font-size"));
    text.setAttribute("font-size", Math.max(9, size * (room / len)).toFixed(1));
  }
}
// Web fonts can arrive after the first draw and are wider than the fallback: redraw to re-fit.
document.fonts?.ready.then(() => { drawnKey = ""; drawWheel(state.names); });

// ---- Animation: same frame on every screen ----
let lastPegIndex = null;
let flap = 0; // pointer kick, decays each frame

function frame() {
  const n = state.names.length;
  const spin = state.spin;
  let rotation = 0;
  if (spin && n >= 2) {
    const end = spin.startAt + spin.durationMs;
    const t = reducedMotion && serverNow() < end ? spin.startAt : serverNow();
    rotation = rotationAt(spin, n, t);
    const now = serverNow();
    const live = now >= spin.startAt && now < end;
    els.wheel.classList.toggle("spinning", live);

    // Tick the flapper each time a peg passes the arrow.
    const pegIndex = Math.floor(rotation / (360 / n));
    if (live && lastPegIndex !== null && pegIndex !== lastPegIndex) flap = Math.min(28, flap + 16);
    lastPegIndex = pegIndex;

    if (now < spin.startAt) showCountdown(spin.startAt - now);
    else if (now < end) showSpinning();
    else if (announcedSpin !== spin.id) announce(spin, rotation);
  } else {
    els.wheel.classList.remove("spinning");
  }
  els.spinner.setAttribute("transform", `rotate(${rotation})`);
  flap *= 0.82;
  els.pointer.style.transform = `rotate(${-flap}deg)`;
  requestAnimationFrame(frame);
}

function showCountdown(ms) {
  els.result.classList.remove("pop");
  els.result.textContent = ms > 700 ? "Get ready…" : "Here we go!";
}
function showSpinning() {
  if (els.result.textContent !== "Spinning…") { els.result.classList.remove("pop"); els.result.textContent = "Spinning…"; }
}

function announce(spin, rotation) {
  announcedSpin = spin.id;
  const n = state.names.length;
  const name = state.names[sliceAtArrow(rotation, n)] ?? state.names[spin.winnerIndex];
  els.result.textContent = `Landed on: ${name}`;
  const fresh = !firstLoad && serverNow() - (spin.startAt + spin.durationMs) < 4000;
  if (fresh) {
    els.result.classList.remove("pop"); void els.result.offsetWidth; els.result.classList.add("pop");
    els.wheel.classList.remove("won"); void els.wheel.getBoundingClientRect(); els.wheel.classList.add("won");
  }
  renderPanel();
}

// ---- Names panel ----
function renderPanel() {
  const n = state.names.length;
  const spinningNow = state.spin && serverNow() < state.spin.startAt + state.spin.durationMs;
  const showEditor = editing || n < 2;
  els.editor.hidden = !showEditor;
  els.namesView.hidden = showEditor;
  els.cancelBtn.hidden = n < 2;
  els.acceptBtn.disabled = busy || spinningNow;
  els.editBtn.disabled = Boolean(spinningNow);
  els.spinBtn.disabled = busy || spinningNow || n < 2 || showEditor;

  const colors = n >= 2 ? sliceColors(n) : [];
  const winner = state.spin && announcedSpin === state.spin.id ? state.spin.winnerIndex : -1;
  els.namesList.replaceChildren(...state.names.map((name, i) => {
    const li = document.createElement("li");
    const sw = document.createElement("span");
    sw.className = "swatch";
    sw.style.background = colors[i]?.fill ?? "#555";
    const label = document.createElement("span");
    label.textContent = name;
    li.append(sw, label);
    li.classList.toggle("winner", i === winner);
    return li;
  }));
  updateCount();
}

function typedNames() {
  return els.namesInput.value.split("\n").map((s) => s.trim()).filter(Boolean);
}
function updateCount() {
  const k = typedNames().length;
  els.count.textContent = k < 2 ? `${k} name${k === 1 ? "" : "s"}. Add at least 2.` : k > 12 ? `${k} names. 12 is the most.` : `${k} names`;
  els.count.classList.toggle("bad", k < 2 || k > 12);
}
els.namesInput.addEventListener("input", updateCount);

els.editBtn.addEventListener("click", () => {
  editing = true;
  els.namesInput.value = state.names.join("\n");
  renderPanel();
  els.namesInput.focus();
});
els.cancelBtn.addEventListener("click", () => { editing = false; note(""); renderPanel(); });

els.editor.addEventListener("submit", async (e) => {
  e.preventDefault();
  const names = typedNames();
  if (names.length < 2 || names.length > 12) { note("Add 2 to 12 names, one per line."); return; }
  busy = true; renderPanel(); note("");
  try {
    const { ok, data } = await api({ action: "setNames", names });
    if (data.names) apply(data);
    if (ok) editing = false; else note(data.error ?? "Couldn't save the names. Try again.");
  } catch { note("Can't reach the wheel. Check your connection."); }
  busy = false; renderPanel();
});

els.spinBtn.addEventListener("click", async () => {
  busy = true; renderPanel(); note("");
  try {
    const { ok, data } = await api({ action: "spin" });
    if (data.names) apply(data);
    if (!ok) note(data.error ?? "Couldn't spin. Try again.");
  } catch { note("Can't reach the wheel. Check your connection."); }
  busy = false; renderPanel();
});

function apply(data) {
  const prevSpin = state.spin?.id;
  state = data;
  drawWheel(state.names);
  if (state.spin?.id !== prevSpin) { lastPegIndex = null; }
  if (firstLoad && state.names.length < 2) els.namesInput.value = "";
  renderPanel();
}

async function poll() {
  try {
    const { data } = await api();
    if (data.names) {
      apply(data);
      if (firstLoad && !state.spin) els.result.textContent = "";
      firstLoad = false;
    }
  } catch { /* try again next tick */ }
  setTimeout(poll, 1000);
}

drawBulbs();
drawWheel([]);
requestAnimationFrame(frame);
poll();
