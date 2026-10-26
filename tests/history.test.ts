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
  dateLabel,
  isUncertain,
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
    min: 1900,
    max: 1901,
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
test("ages show the birthday reached that year and missing death does not imply life", () => {
  assert.equal(statusAt(p(1900, 1950), 1912).kind, "alive");
  assert.equal(statusAt(p(1900, 1950), 1912).label, "Age 12");
  assert.equal(statusAt(p(-5, 50), 7).label, "Age 12");
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

const itemQualifier = (id: string) => [{ datavalue: { value: { id } } }];
const timeQualifier = (year: number, precision = 9) => [
  {
    datavalue: {
      value: {
        time: `${year < 0 ? "-" : "+"}${String(Math.abs(year)).padStart(4, "0")}-00-00T00:00:00Z`,
        precision,
        calendarmodel: "http://www.wikidata.org/entity/Q1985727",
      },
    },
  },
];
test("calendar sourcing metadata and refinements do not imply circa", () => {
  for (const id of [
    "Q106419137",
    "Q26877139",
    "Q26877143",
    "Q27055388",
    "Q18195782",
    "Q26961029",
  ]) {
    const ada = p(1815, 1852);
    ada.birth[0].qualifiers = { P1480: itemQualifier(id) };
    assert.equal(statusAt(ada, 1850).kind, "alive");
    assert.match(comparison(ada, p(1800, 1860)), /^Definite overlap/);
  }
  const refined = p(1815, 1852);
  refined.birth[0].qualifiers = { P4241: itemQualifier("Q40719748") };
  assert.equal(statusAt(refined, 1850).kind, "alive");
});
test("bounded broad and disputed birth dates distinguish life from age certainty", () => {
  const decade = p(1900, 1980);
  decade.birth[0].precision = 8;
  assert.equal(statusAt(decade, 1920).kind, "alive");
  assert.equal(statusAt(decade, 1920).label, "Alive · about 16");
  const disputed = p(1900, 1980);
  disputed.birth.push(d(1902));
  assert.equal(statusAt(disputed, 1920).kind, "alive");
  assert.equal(statusAt(disputed, 1920).label, "Alive · about 19");
});
test("earliest and latest source qualifiers bound age without inventing precision", () => {
  const bounded = p(1900, 1980);
  bounded.birth[0].approximate = true;
  bounded.birth[0].qualifiers = {
    P1319: timeQualifier(1898),
    P1326: timeQualifier(1902),
  };
  assert.deepEqual(dateBounds(bounded.birth[0]), { min: 1898, max: 1903 });
  assert.equal(statusAt(bounded, 1920).kind, "alive");
  assert.equal(statusAt(bounded, 1920).label, "Alive · about 20");
  assert.match(comparison(bounded, p(1910, 1950)), /^Definite overlap/);
});
test("one-sided bounds are open rather than fabricated opposite endpoints", () => {
  const earliest = p(1900, 1980);
  earliest.birth[0].qualifiers = { P1319: timeQualifier(1890) };
  assert.equal(statusAt(earliest, 1880).kind, "unborn");
  assert.notEqual(statusAt(earliest, 1950).kind, "alive");
  const latest = p(1900, 1980);
  latest.birth[0].qualifiers = { P1326: timeQualifier(1902) };
  assert.equal(statusAt(latest, 1950).kind, "alive");
  assert.match(statusAt(latest, 1950).label, /Alive.*age uncertain/);
});
test("raw Wikidata BCE qualifier values normalize separately from stored dates", () => {
  const bounded = p(-43, 20);
  bounded.birth[0].qualifiers = {
    P1319: timeQualifier(-50),
    P1326: timeQualifier(-40),
  };
  assert.deepEqual(dateBounds(bounded.birth[0]), { min: -49, max: -38 });
  assert.equal(statusAt(bounded, 0).kind, "alive");
});
test("unknown sourcing circumstances remain conservative", () => {
  const unknown = p(1900, 1980);
  unknown.birth[0].qualifiers = { P1480: itemQualifier("Q999999999") };
  assert.notEqual(statusAt(unknown, 1950).kind, "alive");
  assert.equal(statusAt(unknown, 2000).kind, "died");
});
test("boundary labels identify known birth and death years", () => {
  assert.equal(statusAt(p(1900, 1980), 1900).label, "Born this year");
  assert.equal(
    statusAt(p(1900, 1980), 1980).label,
    "Died at about age 80 this year",
  );
  const decade = p(1900, 1980);
  decade.birth[0].precision = 8;
  assert.match(statusAt(decade, 1905).label, /birth year uncertain/);
});

test("unknown or disputed sourcing cannot gain certainty from temporal bounds", () => {
  for (const id of ["Q999999999", "Q18912752", "Q30230067"]) {
    const person = p(1900, 1980);
    person.birth[0].qualifiers = {
      P1480: itemQualifier(id),
      P1319: timeQualifier(1898),
      P1326: timeQualifier(1902),
    };
    assert.notEqual(statusAt(person, 1920).kind, "alive");
    assert.equal(isUncertain(person), true);
    assert.match(dateLabel(person.birth), /1898–1902 CE.*uncertain/);
    assert.match(comparison(person, p(1910, 1950)), /^Possible overlap/);
  }
});
test("explicit bounds qualify labels and bounded approximation can prove life", () => {
  for (const id of ["Q5727902", "Q60070514", "Q37113960"]) {
    const person = p(1900, 1980);
    person.birth[0].approximate = true;
    person.birth[0].qualifiers = {
      P1480: itemQualifier(id),
      P1319: timeQualifier(1898),
      P1326: timeQualifier(1902),
    };
    assert.equal(statusAt(person, 1920).kind, "alive");
    assert.equal(isUncertain(person), false);
    assert.equal(dateLabel(person.birth), "1898–1902 CE");
  }
  assert.equal(
    dateLabel([d(1900, { qualifiers: { P1319: timeQualifier(1898) } })]),
    "No earlier than 1898 CE",
  );
  assert.equal(
    dateLabel([d(1900, { qualifiers: { P1326: timeQualifier(1902) } })]),
    "No later than 1902 CE",
  );
  assert.equal(
    dateLabel([
      d(-43, {
        qualifiers: { P1319: timeQualifier(-50), P1326: timeQualifier(-40) },
      }),
    ]),
    "50–40 BCE",
  );
});
test("calendar conversion margins survive calendar sourcing metadata", () => {
  const julian = p(1815, 1852);
  julian.birth[0].calendar = "http://www.wikidata.org/entity/Q1985786";
  julian.birth[0].qualifiers = { P1480: itemQualifier("Q26877143") };
  assert.equal(statusAt(julian, 1850).kind, "alive");
  assert.ok(dateBounds(julian.birth[0])!.min < 1815);
  assert.ok(dateBounds(julian.birth[0])!.max > 1816);
  assert.doesNotMatch(dateLabel(julian.birth), /^c\./);
});
test("malformed or contradictory source endpoints cannot establish life", () => {
  const person = p(1900, 1980);
  person.birth[0].qualifiers = {
    P1319: timeQualifier(1905),
    P1326: timeQualifier(1900),
  };
  assert.equal(statusAt(person, 1920).kind, "unknown");
  assert.equal(dateLabel(person.birth), "Conflicting date bounds");
  person.birth[0].qualifiers = { P1319: [{ snaktype: "somevalue" }] };
  assert.equal(statusAt(person, 1920).kind, "unknown");
});

test("impossible source chronology never produces definite status", () => {
  for (const year of [1750, 1850, 2000])
    assert.equal(statusAt(p(1900, 1800), year).kind, "unknown");
});
test("statement-nature qualifiers distinguish uncertainty from official status", () => {
  for (const id of ["Q18912752", "Q5727902", "Q41719", "Q599151"]) {
    const person = p(1900, 1980);
    person.birth[0].qualifiers = { P5102: itemQualifier(id) };
    assert.notEqual(statusAt(person, 1950).kind, "alive");
    assert.equal(isUncertain(person), true);
  }
  for (const id of ["Q29509043", "Q29509080"]) {
    const person = p(1900, 1980);
    person.birth[0].qualifiers = { P5102: itemQualifier(id) };
    assert.equal(statusAt(person, 1950).kind, "alive");
  }
});

const datedPerson = (birth: string, death: string): Person => ({
  ...p(1900, 1980),
  birth: [{ value: birth, precision: 11, calendar: "gregorian" }],
  death: [{ value: death, precision: 11, calendar: "gregorian" }],
});
test("death ages use completed birthdays and remain fixed after death", () => {
  const person = datedPerson("+1900-12-10T00:00:00Z", "+1980-02-01T00:00:00Z");
  assert.equal(statusAt(person, 1980).label, "Died at age 79 this year");
  assert.equal(statusAt(person, 2000).label, "Died at age 79");
  person.death[0].value = "+1980-12-10T00:00:00Z";
  assert.equal(statusAt(person, 2000).label, "Died at age 80");
  assert.equal(
    statusAt(datedPerson("+0000-12-10T00:00:00Z", "+0001-02-01T00:00:00Z"), 2)
      .label,
    "Died before age 1",
  );
});
test("death ages do not claim precision absent from the source", () => {
  assert.equal(statusAt(p(1900, 1980), 2000).label, "Died at about age 80");
  const disputed = p(1900, 1980);
  disputed.birth.push(d(1902));
  assert.equal(statusAt(disputed, 2000).label, "Died at about age 79");
  disputed.birth = [];
  assert.equal(statusAt(disputed, 2000).label, "Died · age unknown");
  const partial = datedPerson("+1900-00-00T00:00:00Z", "+1980-02-01T00:00:00Z");
  partial.birth[0].precision = 9;
  assert.equal(statusAt(partial, 2000).label, "Died at about age 80");
});

test("an unspecified calendar cannot establish an exact age at death", () => {
  const person = datedPerson("+1900-12-10T00:00:00Z", "+1980-12-10T00:00:00Z");
  delete person.birth[0].calendar;
  assert.equal(statusAt(person, 2000).label, "Died at about age 80");
});

test("alternative full dates establish exact death age only when every age agrees", () => {
  const person = datedPerson("+1900-03-05T00:00:00Z", "+1980-03-04T00:00:00Z");
  person.death.push({ ...person.death[0], value: "+1980-03-07T00:00:00Z" });
  assert.match(statusAt(person, 2000).label, /^Died at about age/);
  person.birth[0].value = "+1900-09-12T00:00:00Z";
  assert.equal(statusAt(person, 2000).label, "Died at age 79");
});
