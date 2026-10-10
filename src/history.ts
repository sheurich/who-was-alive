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

// These sourcing circumstances describe calendar treatment, not uncertain dates.
const SOURCING_METADATA = new Set([
  "Q106419137",
  "Q26877139",
  "Q26877143",
  "Q27055388",
  "Q18195782",
  "Q26961029",
  "Q71536040",
  "Q712144",
  "Q132555",
]);
const STATEMENT_METADATA = new Set(["Q29509043", "Q29509080"]);

const APPROXIMATION = new Set(["Q5727902", "Q60070514", "Q37113960"]);

interface DateEvidence {
  interval: Bounds | null;
  display: Bounds | null;
}

type QualifierSnak = { datavalue?: { value?: unknown } };
function qualifierValues(
  date: HistoricalDate,
  property: string,
): unknown[] | null {
  const value = date.qualifiers?.[property];
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.length) return null;
  const result = value.map((snak: QualifierSnak) => snak?.datavalue?.value);
  return result.some((value) => value === undefined) ? null : result;
}
function qualifierIds(date: HistoricalDate, property: string): string[] | null {
  const values = qualifierValues(date, property);
  if (!values) return null;
  const ids = values.map((value) => (value as { id?: unknown })?.id);
  return ids.every((id) => typeof id === "string") ? (ids as string[]) : null;
}
function sourcing(
  date: HistoricalDate,
): { approximate: boolean; unsupported: boolean } | null {
  const circumstances = qualifierIds(date, "P1480");
  const nature = qualifierIds(date, "P5102");
  if (!circumstances || !nature) return null;
  return {
    approximate:
      !!date.approximate ||
      [...circumstances, ...nature].some((id) => APPROXIMATION.has(id)),
    unsupported:
      circumstances.some(
        (id) => !SOURCING_METADATA.has(id) && !APPROXIMATION.has(id),
      ) ||
      nature.some(
        (id) => !STATEMENT_METADATA.has(id) && !APPROXIMATION.has(id),
      ),
  };
}
function finite(bounds: Bounds | null): bounds is Bounds {
  return !!bounds && Number.isFinite(bounds.min) && Number.isFinite(bounds.max);
}

/** True when the complete lifetime cannot be bounded by source assertions. */
export function isUncertain(person: Person): boolean {
  const birth = evidenceBounds(person.birth);
  const death = evidenceBounds(person.death);
  return !finite(birth) || !finite(death);
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
function sourceBounds(date: HistoricalDate): Bounds | null {
  if (date.snaktype) return null;
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
  // Julian conversion can cross a year boundary. Conservative bounds avoid false precision.
  const calendarMargin =
    calendar === JULIAN || calendar === "julian"
      ? Math.ceil(Math.abs(year) / 36500) + 1
      : 0;
  return {
    min: start - before * qualifierUnit - calendarMargin,
    max: start + unit + after * qualifierUnit + calendarMargin,
  };
}

/** Qualifier time values retain Wikidata JSON's historical BCE numbering. */
function qualifierTime(value: unknown): Bounds | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as {
    time?: string;
    precision?: number;
    calendarmodel?: string;
    before?: number;
    after?: number;
  };
  const match =
    typeof raw.time === "string" &&
    raw.time.match(/^([+-]?\d+)(-\d{2}-\d{2}.*)$/);
  if (!match || typeof raw.precision !== "number") return null;
  const sourceYear = Number(match[1]);
  const year = sourceYear < 0 ? sourceYear + 1 : sourceYear;
  return sourceBounds({
    value: `${year < 0 ? "-" : "+"}${String(Math.abs(year)).padStart(4, "0")}${match[2]}`,
    precision: raw.precision,
    calendar: raw.calendarmodel,
    before: raw.before,
    after: raw.after,
  });
}

function dateEvidence(date: HistoricalDate): DateEvidence {
  const display = sourceBounds(date);
  if (!display) return { interval: null, display: null };
  const earliest = qualifierValues(date, "P1319");
  const latest = qualifierValues(date, "P1326");
  const context = sourcing(date);
  if (!earliest || !latest || !context) return { interval: null, display };
  const lower = earliest.map(qualifierTime);
  const upper = latest.map(qualifierTime);
  if ([...lower, ...upper].some((bound) => !bound))
    return { interval: null, display };
  const hasEndpoints = lower.length > 0 || upper.length > 0;
  const unsupported = context.unsupported;
  const unbounded = context.approximate || unsupported;
  if (!hasEndpoints && !unbounded) return { interval: display, display };
  const min = lower.length
    ? Math.min(...lower.map((bound) => bound!.min))
    : -Infinity;
  const max = upper.length
    ? Math.max(...upper.map((bound) => bound!.max))
    : Infinity;
  if (min >= max) return { interval: null, display };
  const interval = { min, max };
  return {
    interval: unsupported ? { min: -Infinity, max: Infinity } : interval,
    display: finite(interval) ? interval : display,
  };
}

/** Finite chart extent only; source evidence governs life and overlap conclusions. */
export function dateBounds(date: HistoricalDate): Bounds | null {
  return dateEvidence(date).display;
}

function evidenceBounds(dates: HistoricalDate[]): Bounds | null {
  if (!dates.length) return null;
  const bounds = dates.map((date) => dateEvidence(date).interval);
  if (bounds.some((bound) => !bound)) return null;
  return {
    min: Math.min(...bounds.map((bound) => bound!.min)),
    max: Math.max(...bounds.map((bound) => bound!.max)),
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
  if (!Number.isFinite(year))
    return { kind: "unknown", label: "Dates uncertain" };
  const birth = evidenceBounds(person.birth);
  const death = evidenceBounds(person.death);
  if (birth && death && death.max <= birth.min)
    return { kind: "unknown", label: "Conflicting life dates" };
  if (birth && birth.min >= year + 1)
    return { kind: "unborn", label: "Not born yet" };
  if (death && death.max <= year) return { kind: "died", label: "Died" };
  if (!birth || !death || death.max <= birth.min)
    return { kind: "unknown", label: "Life status unknown" };
  if (birth.max <= year && death.min >= year + 1) {
    if (!finite(birth))
      return { kind: "alive", label: "Alive · age uncertain" };
    // The displayed age is the birthday reached in this year, not age on a day.
    const birthYear = Math.floor((birth.min + birth.max - 1) / 2);
    const age = Math.max(0, year - birthYear);
    return {
      kind: "alive",
      label:
        birth.max - birth.min > 1
          ? `Alive · about ${age}`
          : `Age ${age}`,
    };
  }
  if (
    birth.min === year &&
    birth.max === year + 1 &&
    death.min === year &&
    death.max === year + 1
  )
    return { kind: "possible", label: "Born and died this year" };
  if (birth.min === year && birth.max === year + 1)
    return { kind: "possible", label: "Born this year" };
  if (death.min === year && death.max === year + 1)
    return { kind: "possible", label: "Died this year" };
  if (!finite(birth) || !finite(death)) {
    const display = lifeBounds(person);
    return display?.death &&
      year + 1 > display.birth.min &&
      year < display.death.max
      ? { kind: "possible", label: "Possibly alive · dates uncertain" }
      : { kind: "unknown", label: "Life status uncertain · dates uncertain" };
  }
  const birthBoundary = year + 1 > birth.min && year < birth.max;
  const deathBoundary = year + 1 > death.min && year < death.max;
  return {
    kind: "possible",
    label: `Possibly alive · ${birthBoundary && deathBoundary ? "birth/death" : birthBoundary ? "birth" : "death"} year uncertain`,
  };
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

function yearsLabel(min: number, max: number): string {
  if (min === max) return formatYear(min);
  if (min > 0) return `${min}–${max} CE`;
  if (max <= 0) return `${1 - min}–${1 - max} BCE`;
  return `${formatYear(min)}–${formatYear(max)}`;
}

export function dateLabel(dates: HistoricalDate[]): string {
  if (!dates.length) return "Unknown";
  return [
    ...new Set(
      dates.map((date) => {
        const year = rawYear(date);
        if (year === null) return "Unknown";
        const earliest = qualifierValues(date, "P1319");
        const latest = qualifierValues(date, "P1326");
        const lower = earliest?.map(qualifierTime);
        const upper = latest?.map(qualifierTime);
        const context = sourcing(date);
        if (
          !lower ||
          !upper ||
          !context ||
          [...lower, ...upper].some((bound) => !bound)
        )
          return "Uncertain date";
        const unsupported = context.unsupported;
        let label = formatYear(year);
        if (lower.length && upper.length) {
          const min = Math.min(...lower.map((bound) => bound!.min));
          const max = Math.max(...upper.map((bound) => bound!.max)) - 1;
          label = min <= max ? yearsLabel(min, max) : "Conflicting date bounds";
        } else if (lower.length) {
          label = `No earlier than ${formatYear(Math.min(...lower.map((bound) => bound!.min)))}`;
        } else if (upper.length) {
          label = `No later than ${formatYear(Math.max(...upper.map((bound) => bound!.max)) - 1)}`;
        } else {
          if (date.precision < 9)
            label += date.precision === 8 ? " (decade)" : " (broad estimate)";
          if (context.approximate) label = `c. ${label}`;
          else if (date.before || date.after) {
            const bounds = sourceBounds(date);
            if (bounds) label = yearsLabel(bounds.min, bounds.max - 1);
          }
        }
        if (unsupported) label += " (uncertain)";
        if (date.calendar?.endsWith(JULIAN) || date.calendar === "julian")
          label += " (Julian)";
        return label;
      }),
    ),
  ].join(" or ");
}

export function ageDifference(a: Person, b: Person): string {
  const aa = evidenceBounds(a.birth);
  const bb = evidenceBounds(b.birth);
  if (!finite(aa) || !finite(bb)) return "Age difference uncertain";
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
  const aa = { birth: evidenceBounds(a.birth), death: evidenceBounds(a.death) };
  const bb = { birth: evidenceBounds(b.birth), death: evidenceBounds(b.death) };
  if (
    !aa.birth ||
    !aa.death ||
    !bb.birth ||
    !bb.death ||
    aa.death.max <= aa.birth.min ||
    bb.death.max <= bb.birth.min
  )
    return "Unknown overlap · incomplete dates";
  const earliestStart = Math.max(aa.birth.min, bb.birth.min);
  const latestStart = Math.max(aa.birth.max, bb.birth.max);
  const earliestEnd = Math.min(aa.death.min, bb.death.min);
  const latestEnd = Math.min(aa.death.max, bb.death.max);
  if (earliestEnd > latestStart) {
    return Number.isFinite(latestEnd - earliestStart)
      ? `Definite overlap · ${range(earliestEnd - latestStart, latestEnd - earliestStart)} years`
      : "Definite overlap · duration uncertain";
  }
  if (latestEnd > earliestStart) return "Possible overlap · dates uncertain";
  const early = aa.death.max <= bb.birth.min ? aa : bb;
  const late = early === aa ? bb : aa;
  const min = Math.max(0, late.birth!.min - early.death!.max);
  const max = late.birth!.max - early.death!.min;
  return Number.isFinite(max)
    ? `Gap · ${range(min, max)} years`
    : "Gap · duration uncertain";
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
