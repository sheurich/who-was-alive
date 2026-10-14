import "./mini-games.css";
import {
  createMemoryDeck,
  createHuntRound,
  createDodgeCourse,
  advanceDodge,
} from "./mini-game-logic.ts";

export type GameKind = "dodge" | "hunt" | "memory";
const tokens = [
  ["◆", "Diamond"],
  ["★", "Star"],
  ["☂", "Umbrella"],
  ["♜", "Tower"],
  ["☀", "Sun"],
  ["☾", "Moon"],
  ["✿", "Flower"],
  ["♫", "Music"],
  ["✈", "Plane"],
  ["⚑", "Flag"],
  ["⚓", "Anchor"],
  ["☘", "Clover"],
  ["♟", "Pawn"],
  ["✦", "Spark"],
  ["♥", "Heart"],
  ["●", "Planet"],
];
function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function button(text: string, className = ""): HTMLButtonElement {
  const node = element("button", `mini-button ${className}`, text);
  node.type = "button";
  return node;
}
function glyph(value: string): HTMLElement {
  const node = element("span", "mini-glyph", value);
  node.setAttribute("aria-hidden", "true");
  return node;
}

/** Mount one self-contained game. All listeners belong to the returned cleanup. */
export function mountGame(
  host: HTMLElement,
  options: { kind: GameKind; seed: number; weirdness: number },
): () => void {
  const controller = new AbortController();
  const signal = controller.signal;
  const root = element("section", "mini-game");
  const weirdness = Number.isFinite(options.weirdness)
    ? Math.max(0, Math.min(1, options.weirdness))
    : 0;
  root.style.setProperty("--mini-hue", String(205 + weirdness * 85));
  root.style.setProperty("--mini-tilt", `${weirdness * 12}deg`);
  root.dataset.weird = String(weirdness > 0.6);
  const instructions = element("p", "mini-instructions");
  const progress = element("p", "mini-progress");
  const message = element("p", "mini-message");
  message.setAttribute("role", "status");
  message.setAttribute("aria-atomic", "true");
  const board = element("div", "mini-board");
  root.append(instructions, progress, board, message);
  host.replaceChildren(root);
  const onClick = (node: HTMLElement, action: () => void) =>
    node.addEventListener("click", action, { signal });
  const finish = (text: string) => {
    message.textContent = text;
    root.classList.add("mini-finished");
  };

  if (options.kind === "dodge") {
    instructions.textContent =
      "Avoid the asteroid lane. Choose a safe lane for each of 12 sectors. Nothing moves until you fly.";
    const course = createDodgeCourse(options.seed);
    let state = { turn: 0, shields: 3 };
    let lane = 1;
    const laneNames = ["left", "middle", "right"];
    board.classList.add("mini-space");
    const incoming = element("p", "mini-incoming");
    const lanes = element("div", "mini-lanes");
    const laneArt = laneNames.map((name) => {
      const cell = element("div", "mini-lane");
      cell.setAttribute("aria-hidden", "true");
      const obstacle = element("span", "mini-asteroid");
      const ship = element("span", "mini-ship");
      const label = element("span", "mini-lane-name", name);
      cell.append(obstacle, ship, label);
      lanes.append(cell);
      return { cell, obstacle, ship };
    });
    const controls = element("div", "mini-lane-controls");
    const buttons = laneNames.map((name, index) => {
      const control = button(`Fly ${name}`);
      onClick(control, () => fly(index));
      controls.append(control);
      return control;
    });
    const keyboard = element(
      "p",
      "mini-hint",
      "Keyboard: ← → selects a lane. Enter flies. Tab reaches each lane button.",
    );
    const flightDeck = element("div", "mini-flight-deck");
    flightDeck.tabIndex = 0;
    flightDeck.setAttribute("role", "group");
    flightDeck.setAttribute(
      "aria-label",
      "Flight controls. Left and right arrows select a lane. Enter flies.",
    );
    const selected = element("p", "mini-selection");
    flightDeck.append(lanes, selected);
    board.append(incoming, flightDeck, controls, keyboard);
    const render = () => {
      const ended = state.shields === 0 || state.turn === course.length;
      progress.textContent = `Sectors cleared: ${state.turn} / 12 · Shields: ${state.shields} / 3`;
      incoming.textContent = ended
        ? "Flight complete"
        : `Incoming asteroid: ${laneNames[course[state.turn]]} lane`;
      selected.textContent = `Selected lane: ${laneNames[lane]}`;
      laneArt.forEach((art, index) => {
        art.cell.classList.toggle("mini-selected", index === lane);
        art.obstacle.textContent =
          !ended && index === course[state.turn] ? "✹" : "·";
        art.ship.textContent = index === lane ? "▲" : "";
      });
      buttons.forEach((control) =>
        control.setAttribute("aria-disabled", String(ended)),
      );
    };
    function fly(nextLane: number) {
      if (state.shields === 0 || state.turn === course.length) return;
      lane = nextLane;
      const previous = state.shields;
      state = advanceDodge(state, lane, course);
      render();
      if (state.shields === 0)
        finish("Out of shields! Use Replay to try the same route again.");
      else if (state.turn === course.length)
        finish(
          `You made it through all 12 sectors with ${state.shields} shields!`,
        );
      else
        message.textContent = `${previous === state.shields ? "Safe passage!" : "Asteroid hit. One shield lost."} Next asteroid: ${laneNames[course[state.turn]]} lane.`;
    }
    flightDeck.addEventListener(
      "keydown",
      (event) => {
        if (state.shields === 0 || state.turn === course.length || event.repeat)
          return;
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          lane = (lane + (event.key === "ArrowLeft" ? 2 : 1)) % 3;
          render();
          message.textContent = `Selected ${laneNames[lane]} lane. Press Enter to fly.`;
        } else if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          fly(lane);
        }
      },
      { signal },
    );
    render();
    message.textContent =
      "Your ship starts in the middle lane. Take your time.";
  } else if (options.kind === "hunt") {
    instructions.textContent =
      "Find the requested symbol in the collection. Discover five treasures to win. There is no time limit.";
    let round = 0;
    let guesses = 0;
    let current = createHuntRound(options.seed, round);
    const misses = new Set<number>();
    const target = element("p", "mini-target");
    const grid = element("div", "mini-hunt-grid");
    grid.setAttribute("role", "group");
    grid.setAttribute("aria-label", "Treasure collection");
    const cells = Array.from({ length: 16 }, (_, index) => {
      const control = button("", "mini-tile");
      onClick(control, () => {
        if (round === 5 || misses.has(index)) return;
        guesses++;
        progress.textContent = `Treasures: ${round} / 5 · Guesses: ${guesses}`;
        if (current.items[index] !== current.target) {
          misses.add(index);
          control.classList.add("mini-miss");
          control.setAttribute("aria-disabled", "true");
          message.textContent = `That is the ${tokens[current.items[index]][1].toLowerCase()}. Look for the ${tokens[current.target][1].toLowerCase()}.`;
        } else {
          round++;
          misses.clear();
          if (round === 5) {
            progress.textContent = `Treasures: 5 / 5 · Guesses: ${guesses}`;
            cells.forEach((cell) => cell.setAttribute("aria-disabled", "true"));
            target.textContent = "Collection complete!";
            finish(`All five treasures found in ${guesses} guesses!`);
          } else {
            current = createHuntRound(options.seed, round);
            render();
            message.textContent = `Treasure found! Next, find the ${tokens[current.target][1].toLowerCase()}.`;
          }
        }
      });
      grid.append(control);
      return control;
    });
    function render() {
      progress.textContent = `Treasures: ${round} / 5 · Guesses: ${guesses}`;
      target.replaceChildren(
        document.createTextNode("Find the "),
        glyph(tokens[current.target][0]),
        document.createTextNode(` ${tokens[current.target][1].toLowerCase()}`),
      );
      cells.forEach((cell, index) => {
        const [icon, name] = tokens[current.items[index]];
        cell.replaceChildren(glyph(icon));
        cell.setAttribute("aria-label", `${name}, position ${index + 1}`);
        cell.setAttribute("aria-disabled", "false");
        cell.classList.remove("mini-miss");
      });
    }
    board.append(target, grid);
    render();
    message.textContent = "Select a symbol to inspect it.";
  } else {
    instructions.textContent =
      "Turn over two cards and find six matching pairs. Unmatched cards stay visible until you hide them or choose another card.";
    const deck = createMemoryDeck(options.seed);
    const matched = new Set<number>();
    let open: number[] = [];
    let turns = 0;
    const hide = button("Hide these two cards", "mini-hide");
    hide.hidden = true;
    const grid = element("div", "mini-memory-grid");
    grid.setAttribute("role", "group");
    grid.setAttribute("aria-label", "Memory cards");
    const cells = deck.map((value, index) => {
      const control = button("", "mini-card");
      onClick(control, () => {
        if (matched.has(index) || open.includes(index)) return;
        if (open.length === 2) open = [];
        open.push(index);
        if (open.length === 2) {
          turns++;
          if (deck[open[0]] === deck[open[1]]) {
            open.forEach((card) => matched.add(card));
            open = [];
            message.textContent = `A match! ${matched.size / 2} of 6 pairs found.`;
          } else
            message.textContent =
              "Different symbols. Hide these two cards or choose another card to continue.";
        } else
          message.textContent = `${tokens[value][1]} revealed. Choose a second card.`;
        render();
        if (matched.size === 12)
          finish(`All six pairs found in ${turns} turns!`);
      });
      grid.append(control);
      return control;
    });
    function render() {
      progress.textContent = `Pairs: ${matched.size / 2} / 6 · Turns: ${turns}`;
      hide.hidden = open.length !== 2;
      cells.forEach((cell, index) => {
        const shown = matched.has(index) || open.includes(index);
        cell.replaceChildren(glyph(shown ? tokens[deck[index]][0] : "?"));
        cell.classList.toggle("mini-revealed", shown);
        cell.classList.toggle("mini-matched", matched.has(index));
        cell.setAttribute(
          "aria-label",
          `Card ${index + 1}: ${shown ? tokens[deck[index]][1] : "face down"}${matched.has(index) ? ", matched" : ""}`,
        );
        cell.setAttribute("aria-disabled", String(matched.has(index)));
      });
    }
    onClick(hide, () => {
      const next = open[0];
      open = [];
      render();
      if (next !== undefined) cells[next].focus();
      message.textContent = "Cards hidden. Choose another pair.";
    });
    board.append(grid, hide);
    render();
    message.textContent = "Choose any card to begin.";
  }
  return () => {
    controller.abort();
    root.remove();
  };
}
