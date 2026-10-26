import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { requiredPeople } from "../scripts/import.mjs";
import { statusAt, searchPeople } from "../src/history.ts";
import type { Person } from "../src/types.ts";

const people: Person[] = JSON.parse(
  fs.readFileSync(
    new URL("../public/data/people.json", import.meta.url),
    "utf8",
  ),
).people;
const corrections = JSON.parse(
  fs.readFileSync(new URL("../data/corrections.json", import.meta.url), "utf8"),
);

test("Christian Heurich is permanently included with both sourced death dates", () => {
  assert(requiredPeople.includes("Q1080305"));
  const matches = people.filter((p) => p.id === "wd-Q1080305");
  assert.equal(matches.length, 1);
  const person = matches[0];
  assert.equal(searchPeople(people, "Christian Heurich")[0].id, person.id);
  assert.deepEqual(
    person.death.map((d) => d.value),
    ["+1945-03-04T00:00:00Z", "+1945-03-07T00:00:00Z"],
  );
  assert.deepEqual(person.death, corrections[person.id].death);
  assert(person.death.every((d) => d.references?.length));
  assert(person.portrait?.source.includes("commons.wikimedia.org"));
  assert(person.portrait?.license);
  assert.equal(statusAt(person, 1900).label, "Age 58");
  assert.equal(statusAt(person, 1945).label, "Died at age 102 this year");
  assert.equal(statusAt(person, 1950).label, "Died at age 102");
});
