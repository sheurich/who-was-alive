export const DEFAULT_YEAR = 1850;
export const MAX_PINS = 8;
export interface UrlState {
  year: number;
  pins: string[];
}

export function parseState(search: string, validIds: Set<string>): UrlState {
  const params = new URLSearchParams(search);
  const raw = params.get("year") ?? "";
  const value = /^-?\d+$/.test(raw) ? Number(raw) : NaN;
  const year =
    Number.isSafeInteger(value) && value >= -3500 && value <= 2026
      ? value
      : DEFAULT_YEAR;
  const pins = [...new Set((params.get("pins") ?? "").split(","))]
    .filter((id) => validIds.has(id))
    .slice(0, MAX_PINS);
  return { year, pins };
}

export function encodeState(year: number, pins: string[]): string {
  const params = new URLSearchParams();
  params.set(
    "year",
    String(
      Number.isSafeInteger(year) && year >= -3500 && year <= 2026
        ? year
        : DEFAULT_YEAR,
    ),
  );
  const unique = [...new Set(pins)].filter(Boolean).slice(0, MAX_PINS);
  if (unique.length) params.set("pins", unique.join(","));
  return `?${params.toString()}`;
}
