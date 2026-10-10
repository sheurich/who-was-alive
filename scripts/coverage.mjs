import fs from "node:fs/promises";
const root = new URL("../", import.meta.url);
const d = JSON.parse(
  await fs.readFile(new URL("public/data/people.json", root)),
);
const tally = (values) =>
  Object.entries(
    values.reduce((a, v) => ((a[v] = (a[v] || 0) + 1), a), {}),
  ).sort((a, b) => b[1] - a[1]);
const year = (p) => parseInt(p.birth.find((d) => d.value)?.value);
const bands = [
  ["Before 1 CE", -Infinity, 0],
  ["1–499", 1, 499],
  ["500–999", 500, 999],
  ["1000–1499", 1000, 1499],
  ["1500–1799", 1500, 1799],
  ["1800–1899", 1800, 1899],
  ["1900 onward", 1900, Infinity],
];
const finiteYears = d.people.map(year).filter(Number.isFinite);
const coverage = {
  eraBasis:
    "First concrete birth claim in each record; alternatives and uncertainty may span other eras.",
  unplaceableBirths: d.people.length - finiteYears.length,
  outsideUiRange: d.people
    .filter((p) => year(p) < -3500 || year(p) > 2026)
    .map((p) => ({ id: p.id, name: p.name, year: year(p) })),
  people: d.people.length,
  portraits: d.people.filter((p) => p.portrait).length,
  cachedPortraits: d.people.filter((p) => p.portrait?.path).length,
  remotePortraits: d.people.filter((p) => p.portrait && !p.portrait.path)
    .length,
  portraitAcquisition: d.portraitRefresh || null,
  birthRange: [Math.min(...finiteYears), Math.max(...finiteYears)],
  birthBands: bands.map(([label, min, max]) => ({
    label,
    count: d.people.filter((p) => year(p) >= min && year(p) <= max).length,
  })),
  multipleBirthClaims: d.people.filter((p) => p.birth.length > 1).length,
  multipleDeathClaims: d.people.filter((p) => p.death.length > 1).length,
  approximate: d.people.filter((p) =>
    [...p.birth, ...p.death].some((d) => d.approximate || d.precision < 9),
  ).length,
  withoutBirthReferences: d.people.filter((p) =>
    p.birth.every((d) => !d.references.length),
  ).length,
  withoutDeathReferences: d.people.filter(
    (p) => p.death.length && p.death.every((d) => !d.references.length),
  ).length,
  unresolvedDateClaims: d.people.filter((p) =>
    [...p.birth, ...p.death].some(
      (d) => d.snaktype === "somevalue" || d.snaktype === "novalue",
    ),
  ).length,
  missingDeath: d.people.filter((p) => !p.death.length).length,
  missingDescription: d.people.filter((p) => !p.description).length,
  missingCitizenship: d.people.filter((p) => !p.regions.length).length,
  genders: tally(d.people.map((p) => p.gender || "unspecified")),
  citizenships: tally(d.people.flatMap((p) => p.regions)),
  occupations: tally(d.people.flatMap((p) => p.occupations)),
};
await fs.writeFile(
  new URL("public/data/coverage.json", root),
  JSON.stringify(coverage, null, 2) + "\n",
);
console.log(JSON.stringify(coverage, null, 2));
