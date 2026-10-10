import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cache = path.join(root, "work/cache");
const ua =
  "Lifetimes educational static snapshot/1.0 (bounded research import; Wikimedia data reuse)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export function retryDelay(header, now = Date.now()) {
  if (!header) return null;
  if (/^\d+$/.test(header)) return Number(header);
  const timestamp = Date.parse(header);
  return Number.isFinite(timestamp)
    ? Math.max(0, Math.ceil((timestamp - now) / 1000))
    : null;
}
export function boundedInteger(value, fallback, min, max, label) {
  if (value === undefined) return fallback;
  if (
    !/^\d+$/.test(value) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) < min ||
    Number(value) > max
  )
    throw Error(`${label} must be an integer from ${min} to ${max}`);
  return Number(value);
}
export async function request(url, binary = false) {
  for (let n = 0; n < 5; n++) {
    try {
      const r = await fetch(url, {
        headers: {
          "User-Agent": ua,
          Accept: binary ? "image/*" : "application/json",
        },
        signal: AbortSignal.timeout(60000),
      });
      if (!r.ok) {
        const wait = retryDelay(r.headers.get("retry-after")) ?? 2 ** n;
        if (wait > 120) {
          const error = Error(
            `Server requested a pause. Resume after ${new Date(Date.now() + wait * 1000).toISOString()}`,
          );
          error.code = "RETRY_LATER";
          throw error;
        }
        await sleep(wait * 1000);
        throw Error(`HTTP ${r.status}`);
      }
      const cap = binary ? 5 * 1024 * 1024 : 30 * 1024 * 1024;
      const reader = r.body.getReader();
      const chunks = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > cap) {
          await reader.cancel();
          throw Error("Response exceeds download limit");
        }
        chunks.push(value);
      }
      const bytes = Buffer.concat(chunks, size);
      if (binary) return bytes;
      const data = JSON.parse(bytes.toString("utf8"));
      if (data.error) throw Error(JSON.stringify(data.error));
      return data;
    } catch (e) {
      if (
        n === 4 ||
        e.message === "Response exceeds download limit" ||
        e.code === "RETRY_LATER"
      )
        throw e;
      await sleep(1000 * 2 ** n);
    }
  }
}
export async function api(params, host = "www.wikidata.org") {
  return request(
    `https://${host}/w/api.php?${new URLSearchParams({ format: "json", maxlag: "15", ...params })}`,
  );
}
export async function cached(name, fn) {
  const p = path.join(
    cache,
    name.length > 240
      ? name.split("-")[0] +
          "-" +
          createHash("sha256").update(name).digest("hex") +
          ".json"
      : name,
  );
  try {
    return JSON.parse(await fs.readFile(p, "utf8"));
  } catch {}
  const value = await fn();
  await fs.writeFile(p, JSON.stringify(value));
  return value;
}
export function approximateQualifiers(qualifiers = {}) {
  // P1480 describes sourcing circumstances, including calendars, not just circa.
  return [...(qualifiers.P1480 || []), ...(qualifiers.P5102 || [])].some(
    (snak) =>
      ["Q5727902", "Q60070514", "Q37113960"].includes(
        snak.datavalue?.value?.id,
      ),
  );
}
export function date(claim) {
  const v = claim.mainsnak?.datavalue?.value;
  if (!v?.time) {
    if (!["somevalue", "novalue"].includes(claim.mainsnak?.snaktype))
      return null;
    return {
      value: "",
      precision: 0,
      snaktype: claim.mainsnak.snaktype,
      qualifiers: claim.qualifiers || {},
      references: claim.references || [],
      rank: claim.rank,
      statementId: claim.id,
    };
  }
  const m = v.time.match(/^([+-])(\d+)(.*)$/);
  if (!m) return null;
  let y = Number(m[2]) * (m[1] === "-" ? -1 : 1);
  if (y < 0) y++;
  const normalized = `${y < 0 ? "-" : "+"}${String(Math.abs(y)).padStart(4, "0")}${m[3]}`;
  return {
    value: normalized,
    sourceValue: v.time,
    precision: v.precision,
    calendar: v.calendarmodel,
    before: v.before,
    after: v.after,
    approximate: approximateQualifiers(claim.qualifiers),
    qualifiers: claim.qualifiers || {},
    references: claim.references || [],
    rank: claim.rank,
    statementId: claim.id,
  };
}
const values = (e, p) =>
  (e.claims?.[p] || [])
    .filter((x) => x.rank !== "deprecated")
    .map((x) => x.mainsnak?.datavalue?.value)
    .filter(Boolean);
export function normalize(e, labels = {}) {
  const dates = (p) =>
    (e.claims?.[p] || [])
      .filter((x) => x.rank !== "deprecated")
      .map(date)
      .filter(Boolean);
  return {
    id: `wd-${e.id}`,
    name: e.labels?.en?.value || e.labels?.mul?.value || e.id,
    aliases: (e.aliases?.en || []).map((a) => a.value),
    description: e.descriptions?.en?.value || "",
    occupations: values(e, "P106").map((v) => labels[v.id] || v.id),
    birth: dates("P569"),
    death: dates("P570"),
    sources: [
      `https://www.wikidata.org/wiki/${e.id}`,
      ...(Number.isSafeInteger(e.lastrevid)
        ? [
            `https://www.wikidata.org/w/index.php?title=${e.id}&oldid=${e.lastrevid}`,
          ]
        : []),
    ],
    regions: values(e, "P27").map((v) => labels[v.id] || v.id),
    gender: values(e, "P21")
      .map((v) => labels[v.id] || v.id)
      .join(", "),
  };
}
export function portraitPath(id, url, sourceHash) {
  if (!/^[a-z0-9]{20,64}$/i.test(sourceHash || ""))
    throw Error("Portrait source SHA1 missing or invalid");
  if (!/^Q\d+$/.test(id)) throw Error("Invalid portrait entity ID");
  const extension =
    new URL(url).pathname.match(/\.(png|gif|webp)$/i)?.[1].toLowerCase() ||
    "jpg";
  return `portraits/${id}-${createHash("sha256").update(`${url}\0${sourceHash}`).digest("hex").slice(0, 16)}.${extension}`;
}
export async function cachePortrait(
  id,
  url,
  sourceHash,
  fetcher = request,
  directory = path.join(root, "public"),
) {
  const relative = portraitPath(id, url, sourceHash);
  const destination = path.join(directory, relative);
  try {
    await fs.access(destination);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const bytes = await fetcher(url, true);
    await fs.writeFile(destination + ".tmp", bytes);
    await fs.rename(destination + ".tmp", destination);
  }
  return relative;
}
async function main() {
  const limit = boundedInteger(
    process.env.PEOPLE_LIMIT,
    4000,
    100,
    10000,
    "PEOPLE_LIMIT",
  );
  const portraitLimit = boundedInteger(
    process.env.PORTRAIT_LIMIT,
    250,
    0,
    1000,
    "PORTRAIT_LIMIT",
  );
  await fs.mkdir(cache, { recursive: true });
  await fs.mkdir(path.join(root, "public/data"), { recursive: true });
  await fs.mkdir(path.join(root, "public/portraits"), { recursive: true });
  const seeds =
    "Q42 Q937 Q5582 Q762 Q7186 Q8016 Q1035 Q1001 Q5593 Q868 Q859 Q8686 Q873 Q8023 Q9047 Q9682 Q254 Q7259 Q7207 Q1290 Q255 Q4724 Q7200 Q535 Q692 Q7620 Q17714 Q1339 Q906 Q7312 Q1511 Q13133 Q1305 Q5809 Q5705 Q567 Q991 Q1043 Q10225 Q34660 Q409 Q9441 Q7286 Q116 Q30487 Q7085 Q1048 Q8684 Q4235 Q317521 Q8011 Q571 Q159 Q3831 Q5879 Q8682 Q7302 Q1342 Q100 Q958 Q1339 Q1041 Q7728 Q7622 Q1201 Q19185 Q4431 Q1344 Q5580 Q1235 Q12191 Q2559 Q7315 Q8018 Q2054 Q1337 Q8017 Q9049 Q8743 Q935 Q903 Q1309 Q936 Q1317 Q1394 Q1046 Q6389 Q8723 Q11571 Q395 Q7742 Q1335 Q845 Q10261 Q7197 Q6921 Q15869 Q2736 Q402 Q7310 Q1899".split(
      " ",
    );
  const ids = new Set(seeds);
  for (let offset = 0; offset < limit; offset += 500) {
    const data = await cached(
      limit === 4000
        ? `selection-${offset}.json`
        : `selection-${limit}-${offset}.json`,
      () =>
        api({
          action: "query",
          list: "search",
          srsearch:
            "haswbstatement:P31=Q5 haswbstatement:P569 haswbstatement:P570",
          srlimit: String(Math.min(500, limit - offset)),
          sroffset: String(offset),
          srsort: "incoming_links_desc",
          srprop: "",
        }),
    );
    for (const row of data.query.search) ids.add(row.title);
    console.log(`Selected ${ids.size}`);
  }
  const entities = [];
  const list = [...ids];
  for (let start = 0; start < list.length; start += 40) {
    const group = list.slice(start, start + 40);
    const result = await cached(`entities-${group.join("-")}.json`, () =>
      api({
        action: "wbgetentities",
        ids: group.join("|"),
        props: "info|labels|descriptions|aliases|claims",
        languages: "en",
      }),
    );
    entities.push(...Object.values(result.entities));
    console.log(`Fetched ${entities.length}/${list.length}`);
    if (start === 80) {
      const people = entities
        .filter(
          (e) =>
            values(e, "P31").some((x) => x.id === "Q5") &&
            (e.labels?.en || e.labels?.mul) &&
            values(e, "P569").length,
        )
        .map((e) => normalize(e));
      await fs.writeFile(
        path.join(root, "public/data/slice.json"),
        JSON.stringify({ generatedAt: new Date().toISOString(), people }),
      );
    }
  }
  const strata = [
    ["ancient", "ancient", 300],
    ["medieval", "medieval", 150],
    ["women", "haswbstatement:P21=Q6581072", 300],
    ["india", "haswbstatement:P27=Q668", 120],
    ["china", "haswbstatement:P27=Q148", 120],
    ["japan", "haswbstatement:P27=Q17", 120],
    ["nigeria", "haswbstatement:P27=Q1033", 100],
    ["egypt", "haswbstatement:P27=Q79", 100],
    ["mexico", "haswbstatement:P27=Q96", 100],
    ["brazil", "haswbstatement:P27=Q155", 100],
    ["iran", "haswbstatement:P27=Q794", 100],
    ["south-africa", "haswbstatement:P27=Q258", 100],
  ];
  for (const [key, filter, count] of strata) {
    const selected = await cached(`stratum-${key}.json`, () =>
      api({
        action: "query",
        list: "search",
        srsearch: `haswbstatement:P31=Q5 haswbstatement:P569 haswbstatement:P570 ${filter}`,
        srlimit: String(count),
        srsort: "incoming_links_desc",
        srprop: "",
      }),
    );
    const additional = selected.query.search
      .map((row) => row.title)
      .filter((id) => !ids.has(id));
    additional.forEach((id) => ids.add(id));
    for (let start = 0; start < additional.length; start += 40) {
      const group = additional.slice(start, start + 40);
      const result = await cached(`entities-${group.join("-")}.json`, () =>
        api({
          action: "wbgetentities",
          ids: group.join("|"),
          props: "info|labels|descriptions|aliases|claims",
          languages: "en",
        }),
      );
      entities.push(...Object.values(result.entities));
    }
    console.log(`Stratum ${key}: ${additional.length} added`);
  }
  const labelIds = [
    ...new Set(
      entities
        .flatMap((e) =>
          ["P106", "P27", "P21"].flatMap((p) => values(e, p).map((v) => v.id)),
        )
        .filter(Boolean),
    ),
  ];
  const labels = {};
  for (let start = 0; start < labelIds.length; start += 50) {
    const group = labelIds.slice(start, start + 50);
    const result = await cached(`labels-${group.join("-")}.json`, () =>
      api({
        action: "wbgetentities",
        ids: group.join("|"),
        props: "labels",
        languages: "en",
      }),
    );
    for (const e of Object.values(result.entities))
      labels[e.id] = e.labels?.en?.value || e.labels?.mul?.value || e.id;
  }
  const missingNames = entities.filter((e) => !e.labels?.en).map((e) => e.id);
  for (let start = 0; start < missingNames.length; start += 50) {
    const group = missingNames.slice(start, start + 50);
    const result = await cached(`fallback-${group.join("-")}.json`, () =>
      api({
        action: "wbgetentities",
        ids: group.join("|"),
        props: "labels",
        languages: "en|mul",
        languagefallback: "1",
      }),
    );
    for (const e of Object.values(result.entities)) {
      const original = entities.find((row) => row.id === e.id);
      if (original) original.labels = { ...original.labels, ...e.labels };
    }
  }
  const people = [
    ...new Map(
      entities
        .filter(
          (e) =>
            values(e, "P31").some((x) => x.id === "Q5") &&
            (e.labels?.en || e.labels?.mul) &&
            values(e, "P569").length,
        )
        .map((e) => {
          const person = normalize(e, labels);
          return [person.id, person];
        }),
    ).values(),
  ];
  let portraits = 0;
  // Batch Commons metadata to avoid one API request for every portrait.
  const candidates = people
    .map((person) => {
      const e = entities.find((e) => `wd-${e.id}` === person.id);
      return { id: e.id, filename: values(e, "P18")[0] };
    })
    .filter((p) => p.filename)
    .slice(0, Math.ceil(portraitLimit * 1.5));
  const missing = [];
  for (const candidate of candidates) {
    try {
      const previous = JSON.parse(
        await fs.readFile(
          path.join(cache, `image-${candidate.id}.json`),
          "utf8",
        ),
      );
      if (!Object.values(previous.query.pages)[0]?.imageinfo?.[0]?.sha1)
        missing.push(candidate);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      missing.push(candidate);
    }
  }
  for (let offset = 0; offset < missing.length; offset += 20) {
    const group = missing.slice(offset, offset + 20);
    await sleep(2100);
    const result = await api(
      {
        action: "query",
        titles: group.map((p) => `File:${p.filename}`).join("|"),
        redirects: "1",
        prop: "imageinfo",
        iiprop: "url|extmetadata|sha1",
        iiurlwidth: "240",
      },
      "commons.wikimedia.org",
    );
    const pages = Object.values(result.query.pages);
    const renames = [
      ...(result.query.normalized || []),
      ...(result.query.redirects || []),
    ];
    for (const candidate of group) {
      let title = `File:${candidate.filename}`;
      for (let pass = 0; pass < 3; pass++)
        for (const rename of renames)
          if (rename.from === title) title = rename.to;
      const page = pages.find(
        (p) => p.title === title || p.title === title.replace(/_/g, " "),
      );
      if (page)
        await fs.writeFile(
          path.join(cache, `image-${candidate.id}.json`),
          JSON.stringify({ query: { pages: { [page.pageid || "-1"]: page } } }),
        );
    }
    console.log(
      `Portrait metadata ${Math.min(offset + 20, missing.length)}/${missing.length}`,
    );
  }
  for (const person of people) {
    if (portraits >= portraitLimit) break;
    const e = entities.find((e) => `wd-${e.id}` === person.id);
    const filename = values(e, "P18")[0];
    if (!filename) continue;
    try {
      const info = await cached(`image-${e.id}.json`, async () => {
        await sleep(2100);
        return api(
          {
            action: "query",
            titles: `File:${filename}`,
            prop: "imageinfo",
            iiprop: "url|extmetadata|sha1",
            iiurlwidth: "240",
          },
          "commons.wikimedia.org",
        );
      });
      const item = Object.values(info.query.pages)[0]?.imageinfo?.[0];
      const meta = item?.extmetadata;
      const license = meta?.LicenseShortName?.value || "";
      if (!/^(CC BY|CC0|Public domain)/i.test(license) || !item.thumburl)
        continue;
      let licenseUrl =
        meta.LicenseUrl?.value ||
        (/^CC0/i.test(license)
          ? "https://creativecommons.org/publicdomain/zero/1.0/"
          : /^Public domain/i.test(license)
            ? "https://creativecommons.org/publicdomain/mark/1.0/"
            : "");
      licenseUrl = licenseUrl.replace(
        /^http:\/\/(www\.)?creativecommons\.org\//i,
        "https://creativecommons.org/",
      );
      if (
        !licenseUrl.startsWith("https://") ||
        (/^CC BY/i.test(license) && !meta.Artist?.value)
      )
        continue;
      const thumbnailUrl = new URL(item.thumburl);
      if (
        thumbnailUrl.protocol !== "https:" ||
        ![
          "upload.wikimedia.org",
          "thumb.wikimedia.org",
          "commons.wikimedia.org",
        ].includes(thumbnailUrl.hostname)
      )
        continue;
      if (!item.sha1) continue;
      const imagePath = await cachePortrait(e.id, item.thumburl, item.sha1);
      const plain = (s) =>
        String(s || "")
          .replace(/<[^>]*>/g, "")
          .replace(/&amp;/g, "&");
      person.portrait = {
        path: imagePath,
        sourceHash: item.sha1,
        thumbnailUrl: item.thumburl,
        source: item.descriptionurl,
        artist: plain(meta.Artist?.value),
        license,
        licenseUrl,
        credit: plain(meta.Credit?.value),
      };
      portraits++;
      if (portraits % 25 === 0) console.log(`Portraits ${portraits}`);
    } catch (error) {
      if (error.code === "RETRY_LATER") throw error;
      console.warn(`Portrait skipped ${person.id}: ${error.message}`);
    }
  }
  let corrections = {};
  try {
    corrections = JSON.parse(
      await fs.readFile(path.join(root, "data/corrections.json"), "utf8"),
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (
    !corrections ||
    Array.isArray(corrections) ||
    typeof corrections !== "object"
  )
    throw Error("Corrections must be an object keyed by person ID");
  for (const person of people)
    if (corrections[person.id]) Object.assign(person, corrections[person.id]);
  const snapshot = {
    generatedAt: new Date().toISOString(),
    provider: "Wikidata",
    license: "CC0-1.0",
    selection:
      "Incoming-link-ranked humans with birth and death claims, plus ancient/medieval text, women, nine country strata, and introductory seeds; English or multilingual names required.",
    yearConvention:
      "Astronomical numbering; raw Wikidata JSON preserved in sourceValue. Calendar retained, not converted.",
    people,
  };
  await fs.writeFile(
    path.join(root, "public/data/people.tmp"),
    JSON.stringify(snapshot),
  );
  await fs.rename(
    path.join(root, "public/data/people.tmp"),
    path.join(root, "public/data/people.json"),
  );
  if (portraitLimit > 0) {
    const retained = new Set(
      people
        .filter((p) => p.portrait)
        .map((p) => path.basename(p.portrait.path)),
    );
    for (const file of await fs.readdir(path.join(root, "public/portraits"))) {
      if (
        /^Q\d+-[a-f0-9]{16}\.(jpg|png|gif|webp)$/.test(file) &&
        !retained.has(file)
      )
        await fs.unlink(path.join(root, "public/portraits", file));
    }
  }
  console.log(
    JSON.stringify({
      people: people.length,
      portraits,
      earliest: Math.min(
        ...people
          .flatMap((p) => p.birth.map((d) => parseInt(d.value)))
          .filter(Number.isFinite),
      ),
      regions: new Set(people.flatMap((p) => p.regions)).size,
    }),
  );
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
