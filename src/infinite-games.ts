import "./infinite-games.css";
import { gameAt, parseSeed, type Game } from "./game-catalog";
import { paintCover } from "./game-art";
import { mountGame } from "./mini-games";

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const url = new URL(location.href);
const freshSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];
const seed = parseSeed(url.searchParams.get("seed")) ?? freshSeed();
url.searchParams.set("seed", String(seed));
history.replaceState(null, "", url);
$<HTMLAnchorElement>("new-universe").href =
  "./infinite-games.html?seed=" + freshSeed();
const grid = $("game-grid");
const dialog = $<HTMLDialogElement>("game-dialog");
const kindNames = {
  dodge: "Space dodger",
  hunt: "Treasure hunt",
  memory: "Matching game",
};
let count = 0;
let deepest = 0;
let active: Game | null = null;
let dispose: (() => void) | null = null;
let returnFocus: HTMLElement | null = null;

function updateDepth(index: number) {
  deepest = Math.max(deepest, index);
  const w = gameAt(seed, deepest).weirdness;
  $<HTMLMeterElement>("weird-meter").value = Math.round(w * 100);
  $("depth-label").textContent =
    w < 0.12
      ? "Normal-ish"
      : w < 0.4
        ? "A bit odd"
        : w < 0.7
          ? "Very strange"
          : w < 0.95
            ? "Words have left"
            : "Reality unavailable";
}

const covers = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      const canvas = entry.target as HTMLCanvasElement;
      if (!entry.isIntersecting) {
        canvas.width = 1;
        canvas.height = 1;
        delete canvas.dataset.painted;
        continue;
      }
      const index = Number(canvas.dataset.index);
      if (!canvas.dataset.painted) {
        paintCover(canvas, gameAt(seed, index));
        canvas.dataset.painted = "true";
      }
      if (entry.intersectionRatio > 0) updateDepth(index);
    }
  },
  { rootMargin: "150px" },
);

function addGames(manual = false) {
  const firstIndex = count;
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < 12; i++) {
    const game = gameAt(seed, count++);
    const article = document.createElement("article");
    article.className = "ig-card";
    article.style.setProperty("--cover-hue", String(game.hue));
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ig-cover";
    button.dataset.index = String(game.index);
    button.setAttribute(
      "aria-label",
      "Play " + game.title + " — " + kindNames[game.kind],
    );
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    canvas.dataset.index = String(game.index);
    canvas.setAttribute("aria-hidden", "true");
    const play = document.createElement("span");
    play.className = "ig-play";
    play.textContent = "▶ Play";
    const number = document.createElement("span");
    number.className = "ig-card-number";
    number.textContent = "#" + String(game.index + 1).padStart(3, "0");
    button.append(canvas, play, number);
    const info = document.createElement("div");
    info.className = "ig-card-info";
    const title = document.createElement("h3");
    title.textContent = game.title;
    const pitch = document.createElement("p");
    pitch.textContent = game.subtitle;
    const kind = document.createElement("span");
    kind.className = "ig-kind";
    kind.textContent = kindNames[game.kind];
    info.append(title, pitch, kind);
    article.append(button, info);
    fragment.append(article);
    covers.observe(canvas);
  }
  grid.append(fragment);
  if (manual) {
    grid
      .querySelector<HTMLButtonElement>('[data-index="' + firstIndex + '"]')
      ?.focus();
    $("load-status").textContent = "12 more games added.";
  }
  $("shelf-note").textContent =
    count > 84
      ? "You can keep going. We cannot explain what you will find."
      : "There is always another game.";
}

function play(game: Game) {
  dispose?.();
  active = game;
  $("game-title").textContent = game.title;
  $("game-kind").textContent = kindNames[game.kind];
  $("game-number").textContent = "Game #" + (game.index + 1);
  $("game-host").replaceChildren();
  dispose = mountGame($("game-host"), game);
  const state = new URL(location.href);
  state.searchParams.set("game", String(game.index));
  history.replaceState(null, "", state);
  if (!dialog.open) {
    returnFocus = document.activeElement as HTMLElement;
    dialog.showModal();
  }
}

function closeGame() {
  dialog.close();
}

dialog.addEventListener("close", () => {
  dispose?.();
  dispose = null;
  active = null;
  $("game-host").replaceChildren();
  const state = new URL(location.href);
  state.searchParams.delete("game");
  history.replaceState(null, "", state);
  returnFocus?.focus({ preventScroll: true });
});
grid.addEventListener("click", (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>(
    "button[data-index]",
  );
  if (button) play(gameAt(seed, Number(button.dataset.index)));
});
$("close-game").addEventListener("click", closeGame);
$("back-shelf").addEventListener("click", closeGame);
$("replay-game").addEventListener("click", () => {
  if (active) play(active);
});
$("more-games").addEventListener("click", () => addGames(true));
addGames();
const more = new IntersectionObserver(
  (entries) => {
    if (
      entries.some((entry) => entry.isIntersecting) &&
      !dialog.open &&
      document.activeElement !== $("more-games")
    )
      addGames();
  },
  { rootMargin: "450px" },
);
more.observe($("more-marker"));
const requestedGame = url.searchParams.get("game");
if (requestedGame !== null && /^\d{1,7}$/.test(requestedGame)) {
  play(gameAt(seed, Number(requestedGame)));
}
