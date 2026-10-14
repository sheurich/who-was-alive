export type GameKind = "dodge" | "hunt" | "memory";
export interface Game {
  index: number;
  seed: number;
  kind: GameKind;
  title: string;
  subtitle: string;
  weirdness: number;
  hue: number;
}

export function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let n = Math.imul(state ^ (state >>> 15), 1 | state);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

export function parseSeed(value: string | null): number | null {
  if (value === null || !/^\d{1,10}$/.test(value)) return null;
  const n = Number(value);
  return Number.isInteger(n) && n <= 0xffffffff ? n : null;
}

const adjectives = [
  "Moonlight",
  "Cosmic",
  "Jellybean",
  "Velvet",
  "Tiny",
  "Crystal",
  "Midnight",
  "Bubble",
  "Electric",
  "Secret",
  "Wobbly",
  "Golden",
];
const nouns = {
  dodge: ["Racers", "Rocket Club", "Star Pilot", "Orbit Express", "Comet Dash"],
  hunt: [
    "Treasure Island",
    "Gem Garden",
    "Hidden Kingdom",
    "Crystal Quest",
    "Lucky Lagoon",
  ],
  memory: [
    "Memory Palace",
    "Monster Pairs",
    "Dream Archive",
    "Pocket Planets",
    "Match Party",
  ],
};
const pitches = {
  dodge: [
    "Fly between the falling rocks.",
    "One small ship. A very big sky.",
    "Pick a lane. Keep your rocket in one piece.",
  ],
  hunt: [
    "Somewhere in here, treasure is waiting.",
    "Find the sparkle hiding in plain sight.",
    "A tiny expedition for shiny things.",
  ],
  memory: [
    "A world full of familiar faces. Maybe.",
    "Turn them over. Find their twins.",
    "Your memory is the map.",
  ],
};
const syllables = [
  "blorp",
  "zzi",
  "mø",
  "wum",
  "flim",
  "glo",
  "nup",
  "krr",
  "bip",
  "oo",
  "snorf",
  "vex",
];

export function gameAt(seed: number, index: number): Game {
  const gameSeed = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  const rng = random(gameSeed);
  const pick = <T>(values: T[]) => values[Math.floor(rng() * values.length)];
  const kind = (["dodge", "hunt", "memory"] as const)[index % 3];
  const weirdness = Math.min(1, Math.max(0, (index - 5) / 85));
  let title = pick(adjectives) + " " + pick(nouns[kind]);
  if (weirdness > 0.12) {
    title = title
      .split(" ")
      .map((word) =>
        rng() < weirdness ? pick(syllables) + pick(syllables) : word,
      )
      .join(" ");
  }
  if (weirdness > 0.7)
    title += " " + pick(["░", "▒", "▓", "◊"]) + pick(syllables);
  const subtitle =
    weirdness < 0.4
      ? pick(pitches[kind])
      : weirdness < 0.75
        ? "The " +
          pick(["spoons", "clouds", "triangles", "socks"]) +
          " have forgotten how to " +
          pick(["Tuesday.", "gravity.", "sandwich.", "be a game."])
        : pick(syllables) +
          " " +
          pick(syllables) +
          "? " +
          pick(syllables) +
          " " +
          pick(syllables) +
          "!";
  return {
    index,
    seed: gameSeed,
    kind,
    title,
    subtitle,
    weirdness,
    hue: Math.floor(rng() * 360),
  };
}
