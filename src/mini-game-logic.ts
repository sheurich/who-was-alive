import { random } from "./game-catalog";
function shuffled(values: number[], next: () => number): number[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
const symbols = Array.from({ length: 16 }, (_, index) => index);
export function createMemoryDeck(seed: number): number[] {
  const next = random(seed);
  const pairs = shuffled(symbols, next).slice(0, 6);
  return shuffled([...pairs, ...pairs], next);
}
export function createHuntRound(seed: number, round: number) {
  const next = random((seed ^ Math.imul(round + 1, 2654435761)) >>> 0);
  const items = shuffled(symbols, next);
  return { items, target: items[Math.floor(next() * items.length)] };
}
export function createDodgeCourse(seed: number): number[] {
  const next = random(seed);
  return Array.from({ length: 12 }, () => Math.floor(next() * 3));
}
export interface DodgeState {
  turn: number;
  shields: number;
}
export function advanceDodge(
  state: DodgeState,
  lane: number,
  course: number[],
): DodgeState {
  if (!Number.isInteger(lane) || lane < 0 || lane > 2)
    throw new Error("Invalid lane");
  if (state.shields <= 0 || state.turn >= course.length) return state;
  return {
    turn: state.turn + 1,
    shields: state.shields - Number(course[state.turn] === lane),
  };
}
