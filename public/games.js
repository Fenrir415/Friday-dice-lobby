// The game picker is built from this list. To add a game later:
// make a folder under public/ with an index.html, then add one entry here.
export const GAMES = [
  {
    id: "dice",
    name: "Dice",
    path: "/dice",
    blurb: "Everyone rolls. Highest roll picks the game.",
    icon: "dice",
  },
  {
    id: "spin",
    name: "Spin",
    path: "/spin",
    blurb: "Put names on the wheel. Everyone watches it spin.",
    icon: "wheel",
  },
];
