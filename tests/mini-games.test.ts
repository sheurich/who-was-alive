import test from "node:test";
import assert from "node:assert/strict";
import {
  createMemoryDeck,
  createHuntRound,
  createDodgeCourse,
  advanceDodge,
} from "../src/mini-game-logic.ts";

test("memory has six pairs and a stable replay without a fixed arrangement", () => {
  const deck = createMemoryDeck(42);
  assert.equal(deck.length, 12);
  assert.deepEqual(deck, createMemoryDeck(42));
  assert.notDeepEqual(deck, createMemoryDeck(43));
  for (const item of new Set(deck))
    assert.equal(deck.filter((x) => x === item).length, 2);
});
test("every hunt round has exactly one target and replays identically", () => {
  for (let seed = 0; seed < 100; seed++) {
    for (let round = 0; round < 5; round++) {
      const board = createHuntRound(seed, round);
      assert.equal(board.items.length, 16);
      assert.equal(board.items.filter((x) => x === board.target).length, 1);
      assert.deepEqual(board, createHuntRound(seed, round));
    }
  }
});
test("each dodge course can be won without taking damage", () => {
  for (let seed = 0; seed < 100; seed++) {
    const course = createDodgeCourse(seed);
    assert.equal(course.length, 12);
    let state = { turn: 0, shields: 3 };
    for (const blocked of course)
      state = advanceDodge(state, (blocked + 1) % 3, course);
    assert.deepEqual(state, { turn: 12, shields: 3 });
    assert.deepEqual(advanceDodge(state, 0, course), state);
  }
});
test("asteroid impacts cost one shield and a lost game cannot keep advancing", () => {
  const course = createDodgeCourse(42);
  let state = { turn: 0, shields: 3 };
  for (let i = 0; i < 3; i++) state = advanceDodge(state, course[i], course);
  assert.deepEqual(state, { turn: 3, shields: 0 });
  assert.deepEqual(advanceDodge(state, 1, course), state);
  assert.throws(() => advanceDodge({ turn: 0, shields: 3 }, 4, course));
});
