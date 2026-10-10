import type { HistoricalDate, Person } from "./types.ts";

export interface Bounds {
  min: number;
  max: number;
}
export type LifeStatus = {
  kind: "alive" | "possible" | "unborn" | "died" | "unknown";
  label: string;
};
const GREGORIAN = "Q1985727";
const JULIAN = "Q1985786";

function uncertainDate(date: HistoricalDate): boolean {
  return (
    !!date.approximate ||
    ["P1319", "P1326", "P1480", "P4241"].some(
      (key) => key in (date.qualifiers ?? {}),
    )
  );
}

/** Approximation has no source-defined tolerance; its chart extent cannot prove life or overlap. */
export function isUncertain(person: Person): boolean {
  return (
    [...person.birth, ...person.death].some(uncertainDate) ||
    !lifeBounds(person)?.death
  );
}

/** All numbers are astronomical years: 0 is 1 BCE. Bounds use an exclusive upper endpoint. */
export function formatYear(year: number): string {
  const y = Math.trunc(year);
  return y <= 0 ? `${1 - y} BCE` : `${y} CE`;
}

export function parseYear(
  text: string,
  era: "BCE" | "CE" = "CE",
): number | null {
  const match = text.trim().match(/^(\d+)\s*(BCE|BC|CE|AD)?$/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isSafeInteger(value) || value < 1 || value > 1_000_000)
    return null;
  const isBce = match[2] ? /^(BCE|BC)$/i.test(match[2]) : era === "BCE";
  return isBce ? 1 - value : value;
}

function rawYear(date: HistoricalDate): number | null {
  const match = date.value.match(/^([+-]?\d{4,})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (!match) return null;
  const value = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return Number.isSafeInteger(value) &&
    Math.abs(value) <= 1_000_000 &&
    month <= 12 &&
    day <= 31
    ? value
    : null;
}

/** Intentionally calculate in whole years even for day precision. No birthday is inferred. */
export function dateBounds(date: HistoricalDate): Bounds | null {
  const year = rawYear(date);
  if (
    year === null ||
    !Number.isInteger(date.precision) ||
    date.precision < 6 ||
    date.precision > 14
  )
    return null;
  const calendar = date.calendar?.split("/").pop();
  if (
    calendar &&
    calendar !== GREGORIAN &&
    calendar !== JULIAN &&
    calendar !== "gregorian" &&
    calendar !== "julian"
  )
    return null;
  const unit = 10 ** Math.max(0, 9 - date.precision);
  const start =
    date.precision >= 9
      ? year
      : date.precision === 8
        ? year > 0
          ? Math.floor(year / unit) * unit
          : 2 - Math.floor((1 - year) / unit) * unit - unit
        : year > 0
          ? Math.floor((year - 1) / unit) * unit + 1
          : 1 - Math.ceil((1 - year) / unit) * unit;
  const before = Number.isFinite(date.before) ? Math.max(0, date.before!) : 0;
  const after = Number.isFinite(date.after) ? Math.max(0, date.after!) : 0;
  // Wikidata before/after units follow precision; sub-year values are rounded outwards.
  const qualifierUnit = date.precision > 9 ? 1 : unit;
  // This padding is a visual extent only. uncertainDate excludes it from definite conclusions.
  const approximation = date.approximate ? unit : 0;
  // Julian conversion can cross a year boundary. Conservative bounds avoid false precision.
  const calendarMargin =
    calendar === JULIAN || calendar === "julian"
      ? Math.ceil(Math.abs(year) / 36500) + 1
      : 0;
  return {
    min: start - before * qualifierUnit - approximation - calendarMargin,
    max: start + unit + after * qualifierUnit + approximation + calendarMargin,
  };
}

function combined(dates: HistoricalDate[]): Bounds | null {
  if (!dates.length) return null;
  const bounds = dates.map(dateBounds);
  // Dropping an unparseable alternative could turn a possible claim into a definite one.
  if (bounds.some((bound) => !bound)) return null;
  return {
    min: Math.min(...bounds.map((b) => b!.min)),
    max: Math.max(...bounds.map((b) => b!.max)),
  };
}

export function lifeBounds(
  person: Person,
): { birth: Bounds; death: Bounds | null } | null {
  const birth = combined(person.birth);
  if (!birth) return null;
  const death = combined(person.death);
  if (death && death.max <= birth.min) return null;
  return { birth, death };
}

function range(min: number, max: number): string {
  const lo = Math.floor(min + 1e-8);
  const hi = Math.ceil(max - 1e-8);
  return lo === hi ? String(lo) : `${lo}–${hi}`;
}

export function statusAt(person: Person, year: number): LifeStatus {
  const life = lifeBounds(person);
  if (!life || !Number.isFinite(year))
    return { kind: "unknown", label: "Dates uncertain" };
  if (!person.birth.some(uncertainDate) && life.birth.min >= year + 1)
    return { kind: "unborn", label: "Not born yet" };
  if (!person.death.some(uncertainDate) && life.death && life.death.max <= year)
    return { kind: "died", label: "Died" };
  if ([...person.birth, ...person.death].some(uncertainDate)) {
    return life.death && year + 1 > life.birth.min && year < life.death.max
      ? { kind: "possible", label: "Possibly alive · approximate dates" }
      : { kind: "unknown", label: "Life status uncertain · approximate dates" };
  }
  if (!life.death) return { kind: "unknown", label: "Life status unknown" };
  if (life.birth.max <= year && life.death.min >= year + 1) {
    return {
      kind: "alive",
      label: `Age ${range(Math.max(0, year - life.birth.max), year - life.birth.min)}`,
    };
  }
  return { kind: "possible", label: "Possibly alive · dates uncertain" };
}

export function yearOf(dates: HistoricalDate[]): number | null {
  const bounds = combined(dates);
  if (!bounds) return null;
  return Math.floor((bounds.min + bounds.max - 1) / 2);
}

export function birthdayYear(person: Person, age: number): number | null {
  const year = yearOf(person.birth);
  return year === null ? null : year + age;
}

export function dateLabel(dates: HistoricalDate[]): string {
  if (!dates.length) return "Unknown";
  return [
    ...new Set(
      dates.map((date) => {
        const year = rawYear(date);
        if (year === null) return "Unknown";
        let label = formatYear(year);
        if (date.precision < 9)
          label += date.precision === 8 ? " (decade)" : " (broad estimate)";
        if (uncertainDate(date) || date.before || date.after)
          label = `c. ${label}`;
        if (date.calendar?.endsWith(JULIAN) || date.calendar === "julian")
          label += " (Julian)";
        return label;
      }),
    ),
  ].join(" or ");
}

export function ageDifference(a: Person, b: Person): string {
  if ([...a.birth, ...b.birth].some(uncertainDate))
    return "Age difference uncertain";
  const aa = combined(a.birth);
  const bb = combined(b.birth);
  if (!aa || !bb) return "Age difference unknown";
  const deltaMin = aa.min - bb.max;
  const deltaMax = aa.max - bb.min;
  const min =
    deltaMin <= 0 && deltaMax >= 0
      ? 0
      : Math.min(Math.abs(deltaMin), Math.abs(deltaMax));
  const max = Math.max(Math.abs(deltaMin), Math.abs(deltaMax));
  return `${range(min, max)} years apart`;
}

export function comparison(a: Person, b: Person): string {
  const aa = lifeBounds(a);
  const bb = lifeBounds(b);
  if (!aa?.death || !bb?.death) return "Unknown overlap · incomplete dates";
  const earliestStart = Math.max(aa.birth.min, bb.birth.min);
  const latestStart = Math.max(aa.birth.max, bb.birth.max);
  const earliestEnd = Math.min(aa.death.min, bb.death.min);
  const latestEnd = Math.min(aa.death.max, bb.death.max);
  if ([...a.birth, ...a.death, ...b.birth, ...b.death].some(uncertainDate)) {
    return latestEnd > earliestStart
      ? "Possible overlap · approximate dates"
      : "Unknown overlap · approximate dates";
  }
  if (earliestEnd > latestStart)
    return `Definite overlap · ${range(earliestEnd - latestStart, latestEnd - earliestStart)} years`;
  if (latestEnd > earliestStart) return "Possible overlap · dates uncertain";
  const early = aa.death.max <= bb.birth.min ? aa : bb;
  const late = early === aa ? bb : aa;
  return `Gap · ${range(Math.max(0, late.birth.min - early.death!.max), late.birth.max - early.death!.min)} years`;
}

const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
export function searchPeople(people: Person[], query: string): Person[] {
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return people;
  return people.filter((person) => {
    const haystack = normalize(
      [
        person.name,
        ...person.aliases,
        person.description,
        ...person.occupations,
      ].join(" "),
    );
    return terms.every((term) => haystack.includes(term));
  });
}
