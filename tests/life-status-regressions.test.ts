import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { applyCuratedRecords } from "../src/collection.ts";
import { deathDateLabel, statusAt, yearOf } from "../src/history.ts";
import type { Snapshot } from "../src/types.ts";

const snapshot: Snapshot = JSON.parse(
  fs.readFileSync(new URL("../public/data/people.json", import.meta.url), "utf8"),
);
const records = applyCuratedRecords(snapshot.people);

test("Rowling has an explicit living status, not an unknown death", () => {
  const person = records.find(({ id }) => id === "wd-Q34660");
  assert(person);
  assert.equal(deathDateLabel(person), "Alive as of 2026");
  assert.equal(statusAt(person, 1964).kind, "unborn");
  assert.equal(statusAt(person, 1965).label, "Born this year");
  assert.equal(statusAt(person, 2026).kind, "alive");
  assert.equal(statusAt(person, 2027).kind, "unknown");
  const undocumented = { ...person, livingAsOf: undefined };
  assert.equal(deathDateLabel(undocumented), "Not recorded");
  assert.equal(statusAt(undocumented, 2026).kind, "unknown");
});

test("Jeremy's lifespan estimate does not invent a birth date", () => {
  const person = records.find(({ id }) => id === "jeremy-snail");
  assert(person);
  assert.equal(yearOf(person.birth), null);
  assert.equal(deathDateLabel(person), "2017 CE");
  assert.equal(statusAt(person, 2014).kind, "unknown");
  assert.equal(statusAt(person, 2015).kind, "possible");
  assert.equal(statusAt(person, 2016).kind, "alive");
  assert.equal(statusAt(person, 2017).kind, "possible");
  assert.equal(statusAt(person, 2018).kind, "died");
  assert.match(statusAt(person, 2018).label, /Estimated lifespan: about 2 years/);
});
