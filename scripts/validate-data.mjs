import fs from "node:fs/promises";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import {
  date,
  normalize,
  cachePortrait,
  retryDelay,
  boundedInteger,
  request,
  approximateQualifiers,
  validThumbnail,
} from "./import.mjs";
await import("./portrait.test.mjs");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const claim = (time, precision = 9, rank = "normal", qualifiers = {}) => ({
  id: "test",
  rank,
  qualifiers,
  references: [
    {
      snaks: { P854: [{ datavalue: { value: "https://example.org/source" } }] },
    },
  ],
  mainsnak: {
    datavalue: {
      value: {
        time,
        precision,
        calendarmodel: "http://www.wikidata.org/entity/Q1985786",
        before: 0,
        after: 0,
      },
    },
  },
});
assert.equal(
  date(claim("-0001-00-00T00:00:00Z")).value,
  "+0000-00-00T00:00:00Z",
);
assert.equal(
  date(claim("-0044-03-15T00:00:00Z", 11)).value,
  "-0043-03-15T00:00:00Z",
);
assert.equal(
  date(claim("+1900-00-00T00:00:00Z")).value,
  "+1900-00-00T00:00:00Z",
);
const entity = {
  id: "Q1",
  lastrevid: 10,
  labels: { en: { value: "Test" } },
  claims: {
    P569: [
      claim("-0100-00-00T00:00:00Z"),
      claim("-0101-00-00T00:00:00Z", 8),
      claim("-0099-00-00T00:00:00Z", 9, "deprecated"),
    ],
    P570: [],
  },
};
const person = normalize(entity);
assert.equal(
  normalize({ ...entity, labels: { mul: { value: "Multilingual name" } } })
    .name,
  "Multilingual name",
);
assert.equal(person.birth.length, 2);
assert.equal(person.birth[1].precision, 8);
assert.equal(person.death.length, 0);
assert.equal(person.livingAsOf, undefined);
assert.equal(person.birth[0].references.length, 1);
assert.equal(
  date(claim("+1500-00-00T00:00:00Z", 9, "normal", { P1480: [{}] }))
    .approximate,
  false,
);
const circumstance = (id) => ({
  P1480: [{ snaktype: "value", datavalue: { value: { id } } }],
});
for (const id of ["Q26877139", "Q26877143", "Q27055388"]) {
  const input = claim("+1852-11-27T00:00:00Z", 11, "normal", circumstance(id));
  assert.equal(date(input).approximate, false, `${id} is calendar metadata`);
  assert.deepEqual(date(input).qualifiers, input.qualifiers);
}
for (const id of ["Q5727902", "Q60070514", "Q37113960"]) {
  assert.equal(
    date(claim("+1775-04-23T00:00:00Z", 11, "normal", circumstance(id)))
      .approximate,
    true,
  );
}
assert.equal(
  date(
    claim("+1395-00-00T00:00:00Z", 9, "normal", {
      P5102: circumstance("Q5727902").P1480,
    }),
  ).approximate,
  true,
  "Nature-of-statement circa is also an approximation",
);
const unresolved = {
  id: "unknown",
  rank: "normal",
  mainsnak: { snaktype: "novalue" },
  qualifiers: { P1480: [{}] },
  references: [],
};
const mixed = normalize({
  ...entity,
  claims: {
    P569: entity.claims.P569,
    P570: [claim("+0048-00-00T00:00:00Z"), unresolved],
  },
});
assert.equal(mixed.death.length, 2);
assert.equal(mixed.death[1].value, "");
assert.equal(mixed.death[1].snaktype, "novalue");
assert.equal(
  date({ ...unresolved, mainsnak: { snaktype: "somevalue" } }).snaktype,
  "somevalue",
);
assert.equal(normalize({ ...entity, lastrevid: undefined }).sources.length, 1);
assert(person.sources[1].endsWith("oldid=10"));
// A changed Commons source must download new bytes rather than relabel cached bytes.
const fixtureRoot = await fs.mkdtemp(
  path.join(os.tmpdir(), "lifetimes-portrait-test-"),
);
try {
  await fs.mkdir(path.join(fixtureRoot, "portraits"));
  let downloads = 0;
  const mock = async (url) => {
    downloads++;
    return Buffer.from(`${url}#${downloads}`);
  };
  const first = await cachePortrait(
    "Q0",
    "https://upload.wikimedia.org/old-regression.jpg",
    "a".repeat(40),
    mock,
    fixtureRoot,
  );
  const again = await cachePortrait(
    "Q0",
    "https://upload.wikimedia.org/old-regression.jpg",
    "a".repeat(40),
    mock,
    fixtureRoot,
  );
  const second = await cachePortrait(
    "Q0",
    "https://upload.wikimedia.org/new-regression.jpg",
    "a".repeat(40),
    mock,
    fixtureRoot,
  );
  const overwritten = await cachePortrait(
    "Q0",
    "https://upload.wikimedia.org/new-regression.jpg",
    "b".repeat(40),
    mock,
    fixtureRoot,
  );
  assert.notEqual(second, overwritten);
  assert.equal(first, again);
  assert.notEqual(first, second);
  assert.equal(downloads, 3);
  assert.equal(
    await fs.readFile(path.join(fixtureRoot, second), "utf8"),
    "https://upload.wikimedia.org/new-regression.jpg#2",
  );
  assert(
    (await fs.readFile(path.join(fixtureRoot, overwritten), "utf8")).endsWith(
      "#3",
    ),
  );
} finally {
  await fs.rm(fixtureRoot, { recursive: true, force: true });
}
assert.equal(retryDelay("45"), 45);
assert.equal(
  retryDelay("Wed, 21 Oct 2015 07:28:00 GMT", Date.UTC(2015, 9, 21, 7, 27)),
  60,
);
assert.equal(boundedInteger(undefined, 250, 0, 1000, "test"), 250);
for (const value of ["NaN", "-1", "2.5", "1001", ""])
  assert.throws(() => boundedInteger(value, 250, 0, 1000, "test"));
const originalFetch = globalThis.fetch;
let attempts = 0;
try {
  globalThis.fetch = async () => {
    attempts++;
    return {
      ok: false,
      status: 429,
      headers: new Headers({ "Retry-After": "121" }),
    };
  };
  await assert.rejects(
    () => request("https://www.wikidata.org/mock"),
    /Resume after/,
  );
  assert.equal(attempts, 1);
} finally {
  globalThis.fetch = originalFetch;
}
const data = JSON.parse(
  await fs.readFile(path.join(root, "public/data/people.json"), "utf8"),
);
assert(data.people.length >= 100, "Snapshot too small");
const ids = new Set();
let portraits = 0;
for (const p of data.people) {
  assert(!ids.has(p.id), `Duplicate ${p.id}`);
  ids.add(p.id);
  assert(typeof p.name === "string" && p.name && !/^Q\d+$/.test(p.name));
  assert(typeof p.description === "string");
  for (const field of ["aliases", "occupations", "regions"])
    assert(
      Array.isArray(p[field]) && p[field].every((v) => typeof v === "string"),
    );
  assert(
    Array.isArray(p.sources) &&
      p.sources.length &&
      Array.isArray(p.birth) &&
      p.birth.length &&
      Array.isArray(p.death),
  );
  assert(
    p.sources.every(
      (source) => typeof source === "string" && source.startsWith("https://"),
    ),
  );
  for (const source of p.sources) {
    assert(!source.includes("undefined"));
    if (source.includes("oldid=")) assert(/oldid=\d+$/.test(source));
  }
  assert(!p.livingAsOf, "Import must not infer living status");
  for (const d of [...p.birth, ...p.death]) {
    if (d.value === "") {
      assert(["somevalue", "novalue"].includes(d.snaktype));
      assert.equal(d.precision, 0);
      assert(Array.isArray(d.references));
      continue;
    }
    assert(/^[+-]\d{4,}-\d{2}-\d{2}T/.test(d.value), p.id);
    assert(
      Number.isInteger(d.precision) && d.precision >= 0 && d.precision <= 14,
    );
    assert(
      d.sourceValue &&
        Array.isArray(d.references) &&
        typeof d.calendar === "string",
    );
    for (const field of ["before", "after"])
      assert(Number.isFinite(d[field]) && d[field] >= 0);
    assert(d.rank !== "deprecated");
    assert.equal(
      d.approximate,
      approximateQualifiers(d.qualifiers),
      `${p.id}: approximation flag must match the sourcing qualifier value`,
    );
  }
  if (p.portrait) {
    if (p.portrait.thumbnailUrl)
      assert(
        validThumbnail(p.portrait.thumbnailUrl),
        "Unsafe remote portrait URL",
      );
    assert(
      p.portrait.path || p.portrait.thumbnailUrl,
      "Portrait needs a local path or remote thumbnail",
    );
    if (p.portrait.path)
      assert(
        /^portraits\/Q\d+-[a-f0-9]{16}\.(jpg|png|gif|webp)$/.test(
          p.portrait.path,
        ),
      );
    const portraitSource = new URL(p.portrait.source);
    assert(
      portraitSource.protocol === "https:" &&
        portraitSource.hostname === "commons.wikimedia.org" &&
        !portraitSource.username &&
        !portraitSource.password &&
        !portraitSource.port,
    );
    assert(typeof p.portrait.artist === "string");
    if (p.portrait.sourceHash)
      assert(/^[a-z0-9]{20,64}$/i.test(p.portrait.sourceHash));
    assert(typeof p.portrait.license === "string" && p.portrait.license);
    assert(
      typeof p.portrait.licenseUrl === "string" &&
        p.portrait.licenseUrl.startsWith("https://"),
    );
    assert(/^(CC BY|CC0|Public domain)/i.test(p.portrait.license));
    if (/^CC BY/i.test(p.portrait.license)) assert(p.portrait.artist.trim());
    if (!p.portrait.path) continue;
    const bytes = await fs.readFile(path.join(root, "public", p.portrait.path));
    assert(bytes.length > 100);
    assert(
      (bytes[0] === 255 && bytes[1] === 216) ||
        (bytes[0] === 137 && bytes[1] === 80) ||
        bytes.subarray(0, 4).toString() === "RIFF" ||
        bytes.subarray(0, 4).toString() === "GIF8",
      "Not a known raster image",
    );
    portraits++;
  }
}
console.log(
  `Validated ${data.people.length} people, ${portraits} cached portraits, ${data.people.filter((p) => p.portrait && !p.portrait.path).length} remote portraits; BCE, precision, alternatives, references, and missing-death fixtures passed.`,
);
