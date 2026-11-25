import corrections from "../data/corrections.json";
import guestLives from "../data/guest-lives.json";
import type { Person } from "./types.ts";

export function applyCuratedRecords(people: Person[]): Person[] {
  const records = new Map(people.map((person) => [person.id, person]));
  for (const guest of guestLives) {
    const existing = records.get(guest.id);
    records.set(guest.id, {
      ...guest,
      portrait: existing?.portrait ?? guest.portrait,
    });
  }
  for (const [id, correction] of Object.entries(corrections)) {
    const person = records.get(id);
    if (person) {
      records.set(id, {
        ...person,
        ...correction,
        sources: [...new Set([...person.sources, ...correction.sources])],
      });
    }
  }
  return [...records.values()];
}
