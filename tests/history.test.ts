import test from "node:test";
import assert from "node:assert/strict";
import {
  formatYear,
  parseYear,
  dateBounds,
  lifeBounds,
  statusAt,
  comparison,
  birthdayYear,
  searchPeople,
} from "../src/history.ts";
import type { Person, HistoricalDate } from "../src/types.ts";
const d = (
  year: number,
  extra: Partial<HistoricalDate> = {},
): HistoricalDate => ({
  value: `${year < 0 ? "-" : "+"}${String(Math.abs(year)).padStart(4, "0")}-00-00T00:00:00Z`,
  precision: 9,
  ...extra,
});
const p = (birth: number, death?: number): Person => ({
  id: "p",
  name: "Test",
  aliases: [],
  description: "",
  occupations: [],
  birth: [d(birth)],
  death: death === undefined ? [] : [d(death)],
  sources: [],
});
test("astronomical years cross BCE/CE without a displayed zero", () => {
  assert.equal(formatYear(0), "1 BCE");
  assert.equal(formatYear(-1), "2 BCE");
  assert.equal(formatYear(1), "1 CE");
  assert.equal(parseYear("1 BCE"), 0);
  assert.equal(parseYear("2", "BCE"), -1);
  assert.equal(parseYear("1 CE"), 1);
  assert.equal(parseYear("0"), null);
  assert.equal(parseYear("1.5"), null);
  assert.equal(parseYear("cat"), null);
  assert.equal(birthdayYear(p(-5), 12), 7);
});
test("date precision, approximation and alternate assertions widen intervals", () => {
  assert.deepEqual(dateBounds(d(1900)), { min: 1900, max: 1901 });
  assert.deepEqual(dateBounds(d(1900, { approximate: true })), {
    min: 1899,
    max: 1902,
  });
  assert.deepEqual(dateBounds(d(1900, { before: 2, after: 3 })), {
    min: 1898,
    max: 1904,
  });
  assert.deepEqual(dateBounds(d(1900, { precision: 8 })), {
    min: 1900,
    max: 1910,
  });
  assert.equal(dateBounds({ ...d(1900), value: "garbage" }), null);
  const disputed = p(1900, 1950);
  disputed.birth.push(d(1902));
  assert.deepEqual(lifeBounds(disputed)?.birth, { min: 1900, max: 1903 });
  assert.equal(dateBounds(d(1900, { calendar: "unknown" })), null);
});
test("whole-year ages remain ranges and unknown death does not imply life", () => {
  assert.equal(statusAt(p(1900, 1950), 1912).kind, "alive");
  assert.match(statusAt(p(1900, 1950), 1912).label, /11–12/);
  assert.equal(statusAt(p(1900, 1950), 1900).kind, "possible");
  assert.equal(statusAt(p(1900, 1950), 1950).kind, "possible");
  assert.equal(statusAt(p(1900, 1950), 1899).kind, "unborn");
  assert.equal(statusAt(p(1900, 1950), 1951).kind, "died");
  assert.equal(statusAt(p(1900), 1912).kind, "unknown");
});
test("overlap is definite only if supported by all date alternatives", () => {
  assert.match(comparison(p(1900, 1950), p(1920, 1970)), /^Definite overlap/);
  assert.match(comparison(p(1900, 1950), p(1950, 1970)), /^Possible overlap/);
  assert.match(comparison(p(1900, 1950), p(1960, 1970)), /^Gap/);
  assert.match(comparison(p(1900), p(1920, 1970)), /Unknown/);
});
test("search includes aliases, occupations and accent-insensitive names", () => {
  const person = {
    ...p(1900, 1950),
    name: "Émilie",
    aliases: ["Millie"],
    occupations: ["mathematician"],
  };
  assert.equal(searchPeople([person], "emilie").length, 1);
  assert.equal(searchPeople([person], "millie").length, 1);
  assert.equal(searchPeople([person], "mathematician").length, 1);
  assert.equal(searchPeople([person], "absent").length, 0);
});
test("centuries, millennia and BCE decades follow historical calendar ranges", () => {
  assert.deepEqual(dateBounds(d(1900, { precision: 7 })), {
    min: 1801,
    max: 1901,
  });
  assert.deepEqual(dateBounds(d(1500, { precision: 6 })), {
    min: 1001,
    max: 2001,
  });
  assert.deepEqual(dateBounds(d(-39, { precision: 8 })), {
    min: -48,
    max: -38,
  });
  assert.deepEqual(dateBounds(d(0, { precision: 7 })), { min: -99, max: 1 });
});
test("partial month and day dates use conservative whole-year calculations", () => {
  assert.deepEqual(dateBounds({ value: "+1900-05-00", precision: 10 }), {
    min: 1900,
    max: 1901,
  });
  assert.deepEqual(dateBounds({ value: "+1900-05-20", precision: 11 }), {
    min: 1900,
    max: 1901,
  });
  const invalid = p(1900, 1950);
  invalid.birth.push({ ...d(1900), calendar: "unsupported" });
  assert.equal(statusAt(invalid, 1920).kind, "unknown");
});
test("unbounded approximation never establishes definite life or overlap", () => {
  const approximate = p(1900, 1950);
  approximate.birth[0].approximate = true;
  assert.equal(statusAt(approximate, 1920).kind, "possible");
  assert.equal(statusAt(approximate, 1800).kind, "unknown");
  assert.match(comparison(approximate, p(1920, 1970)), /^Possible overlap/);
});

test("unresolved alternatives prevent definite life and overlap claims", () => {
  const unresolved = { value: "", precision: 0, snaktype: "novalue" as const };
  const person = p(1900, 1980);
  person.death.push(unresolved);
  assert.equal(statusAt(person, 1950).kind, "unknown");
  assert.match(comparison(person, p(1920, 1990)), /Unknown overlap/);
});

test("a reliable endpoint establishes died or unborn despite uncertainty in the other", () => {
  const uncertainBirth = p(1900, 1980);
  uncertainBirth.birth[0].approximate = true;
  assert.equal(statusAt(uncertainBirth, 2000).kind, "died");
  const uncertainDeath = p(1900, 1980);
  uncertainDeath.death[0].approximate = true;
  assert.equal(statusAt(uncertainDeath, 1800).kind, "unborn");
});
