import test from "node:test";
import assert from "node:assert/strict";
import { parseState, encodeState } from "../src/state.ts";
test("share state round trips BCE years and ordered unique pins", () => {
  const valid = new Set(["Q1", "Q2"]);
  assert.deepEqual(parseState(encodeState(0, ["Q2", "Q1"]), valid), {
    year: 0,
    pins: ["Q2", "Q1"],
  });
  assert.deepEqual(parseState("?year=-440&pins=Q1,Q1,no,Q2", valid), {
    year: -440,
    pins: ["Q1", "Q2"],
  });
});
test("malformed years and unknown ids cannot corrupt state", () => {
  const valid = new Set(["Q1"]);
  for (const value of [
    "NaN",
    "Infinity",
    "1.2",
    "",
    "999999999999999999",
    "1e3",
  ]) {
    assert.equal(parseState(`?year=${value}`, valid).year, 1850);
  }
  assert.deepEqual(parseState("?pins=unknown", valid), {
    year: 1850,
    pins: [],
  });
});
test("pins are capped at eight", () => {
  const ids = Array.from({ length: 12 }, (_, i) => `Q${i}`);
  assert.equal(parseState(encodeState(1850, ids), new Set(ids)).pins.length, 8);
});
