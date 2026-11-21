// Two 3D dice tumbling across the felt. playRoll accepts the dice values,
// or a promise of them (the roller's own screen starts before the server answers).

const PIPS = { 1: [5], 2: [3, 7], 3: [3, 5, 7], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
// Rotation of the cube that brings face n to the front.
const SHOW = { 1: [0, 0], 2: [0, -90], 3: [-90, 0], 4: [90, 0], 5: [0, 90], 6: [0, 180] };
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeDie() {
  const die = document.createElement("div");
  die.className = "die";
  const cube = document.createElement("div");
  cube.className = "cube";
  for (let n = 1; n <= 6; n++) {
    const face = document.createElement("div");
    face.className = `face f${n}`;
    for (let cell = 1; cell <= 9; cell++) {
      const slot = document.createElement("span");
      if (PIPS[n].includes(cell)) slot.className = "pip";
      face.appendChild(slot);
    }
    cube.appendChild(face);
  }
  die.appendChild(cube);
  const shadow = document.createElement("div");
  shadow.className = "shadow";
  return { die, cube, shadow };
}

const rot = ([x, y], extraX = 0, extraY = 0) => `rotateX(${x + extraX}deg) rotateY(${y + extraY}deg)`;

export async function playRoll(stage, callEl, name, diceOrPromise, { minMs = 1600 } = {}) {
  stage.replaceChildren();
  callEl.textContent = `${name} is rolling…`;
  const w = stage.clientWidth, h = stage.clientHeight;
  const size = parseFloat(getComputedStyle(stage).getPropertyValue("--die")) || 64;
  const restY = h * 0.42 - size / 2;
  const pair = [0, 1].map((i) => {
    const d = makeDie();
    stage.append(d.shadow, d.die);
    d.restX = w / 2 + (i === 0 ? -size * 0.95 : size * 0.15);
    return d;
  });

  const started = performance.now();
  let dice;

  if (reduced()) {
    dice = await diceOrPromise;
  } else {
    // Phase 1: thrown in from the left, bouncing and spinning.
    const throwMs = 1000;
    const anims = pair.flatMap((d, i) => {
      const startX = -size * 2 - i * 30;
      const path = [
        { x: startX, y: restY - h * 0.25 },
        { x: d.restX - w * 0.28, y: restY },
        { x: d.restX - w * 0.14, y: restY - h * 0.12 },
        { x: d.restX - w * 0.05, y: restY },
        { x: d.restX - 8, y: restY - h * 0.03 },
        { x: d.restX, y: restY },
      ];
      const offsets = [0, 0.35, 0.55, 0.75, 0.88, 1];
      return [
        d.die.animate(path.map((p, k) => ({ transform: `translate(${p.x}px, ${p.y}px)`, offset: offsets[k] })),
          { duration: throwMs, easing: "cubic-bezier(.2,.7,.4,1)", fill: "forwards" }),
        d.shadow.animate(path.map((p, k) => ({ transform: `translate(${p.x}px, ${restY + size - 4}px)`, offset: offsets[k] })),
          { duration: throwMs, easing: "cubic-bezier(.2,.7,.4,1)", fill: "forwards" }),
        d.cube.animate([{ transform: rot([0, 0]) }, { transform: rot([0, 0], 720 + i * 360, 540 - i * 180) }],
          { duration: throwMs, easing: "cubic-bezier(.3,.6,.5,1)", fill: "forwards" }),
      ];
    });
    const valuesReady = Promise.resolve(diceOrPromise).then((v) => (dice = v));
    await Promise.all(anims.map((a) => a.finished));

    // Still waiting on the server? Keep the dice rattling in place.
    while (dice === undefined) {
      const spins = pair.map((d) =>
        d.cube.animate([{ transform: rot([0, 0]) }, { transform: rot([0, 0], 360, 360) }], { duration: 400, easing: "linear" }));
      await Promise.race([Promise.all(spins.map((s) => s.finished)), valuesReady]);
      if (dice !== undefined) spins.forEach((s) => s.cancel());
    }

    const left = minMs - (performance.now() - started) - 600;
    if (left > 0) await sleep(left);

    // Phase 2: settle onto the real faces.
    await Promise.all(pair.map((d, i) =>
      d.cube.animate([{ transform: rot([0, 0]) }, { transform: rot(SHOW[dice[i]], 360, 360) }],
        { duration: 600, easing: "cubic-bezier(.2,.9,.3,1.2)", fill: "forwards" }).finished));
  }

  // Lock in the final position (also covers reduced motion).
  pair.forEach((d, i) => {
    d.die.getAnimations().forEach((a) => a.cancel());
    d.shadow.getAnimations().forEach((a) => a.cancel());
    d.cube.getAnimations().forEach((a) => a.cancel());
    d.die.style.transform = `translate(${d.restX}px, ${restY}px)`;
    d.shadow.style.transform = `translate(${d.restX}px, ${restY + size - 4}px)`;
    d.cube.style.transform = rot(SHOW[dice[i]]);
    // Shade the sides so the visible edge reads as the die's side, not a stray line.
    d.die.classList.add("landed");
    d.cube.querySelector(`.f${dice[i]}`)?.classList.add("up");
  });
  callEl.textContent = `${name} rolled ${dice[0] + dice[1]}!`;
  await sleep(700);
  return dice;
}
