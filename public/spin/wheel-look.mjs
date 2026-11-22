// Game-show colours and label sizing for the wheel. Pure, so it's easy to test and extend.
export const PALETTE = [
  { fill: "#e8243c", text: "#ffffff" }, // red
  { fill: "#ffc21a", text: "#3a2200" }, // yellow
  { fill: "#1f6fe5", text: "#ffffff" }, // blue
  { fill: "#22b35e", text: "#ffffff" }, // green
  { fill: "#8b3fd1", text: "#ffffff" }, // purple
  { fill: "#ff7a1a", text: "#3a1600" }, // orange
];

export function sliceColors(n) {
  const colors = Array.from({ length: n }, (_, i) => PALETTE[i % PALETTE.length]);
  // If the last slice would match the first, borrow a colour that differs from both neighbours.
  if (n > 1 && colors[n - 1] === colors[0]) {
    colors[n - 1] = PALETTE.find((c) => c !== colors[0] && c !== colors[n - 2]);
  }
  return colors;
}

export function labelSize(n, name) {
  const base = n <= 4 ? 30 : n <= 6 ? 26 : n <= 9 ? 21 : 17;
  const len = [...name].length;
  return Math.max(11, Math.round(len > 10 ? base * (10 / len) ** 0.7 : base));
}
