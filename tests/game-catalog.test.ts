import test from "node:test";
import assert from "node:assert/strict";
import { gameAt, random, parseSeed } from "../src/game-catalog.ts";

test("a shared seed reproduces the same game and random sequence", () => {
  assert.deepEqual(gameAt(123, 14), gameAt(123, 14));
  assert.notDeepEqual(gameAt(123, 14), gameAt(456, 14));
  const a = random(99),
    b = random(99);
  assert.deepEqual(
    Array.from({ length: 20 }, a),
    Array.from({ length: 20 }, b),
  );
});
test("the first shelf has all three playable kinds and readable names", () => {
  assert.equal(new Set([0, 1, 2].map((i) => gameAt(4, i).kind)).size, 3);
  assert.match(gameAt(4, 0).title, /^[A-Za-z ]+$/);
});
test("deeper shelves become more corrupted without invalid or enormous output", () => {
  let previous = 0;
  for (const index of [0, 12, 36, 100, 1000, 1000000]) {
    const game = gameAt(7, index);
    assert.ok(game.weirdness >= previous && game.weirdness <= 1);
    assert.ok(game.title.length > 0 && game.title.length < 60);
    assert.ok(Number.isFinite(game.seed));
    previous = game.weirdness;
  }
  assert.equal(gameAt(7, 0).weirdness, 0);
  assert.ok(gameAt(7, 100).weirdness > 0.9);
  assert.match(gameAt(7, 100).title, /[░▒▓◊]/);
});
test("URL seeds accept only bounded unsigned integers", () => {
  assert.equal(parseSeed("123"), 123);
  for (const value of [
    null,
    "",
    "-1",
    "1.5",
    "NaN",
    "999999999999999",
    "12oops",
  ])
    assert.equal(parseSeed(value), null);
});
