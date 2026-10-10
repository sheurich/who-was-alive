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
export function validThumbnail(value) {
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      ["upload.wikimedia.org", "thumb.wikimedia.org"].includes(u.hostname)
    );
  } catch {
    return false;
  }
}
export function remotePortrait(item) {
  const meta = item?.extmetadata;
  const license = meta?.LicenseShortName?.value || "";
  if (
    !/^(CC BY(?:-SA)?(?: |$)|CC0(?: |$)|Public domain(?: |$))/i.test(license) ||
    !validThumbnail(item?.thumburl)
  )
    return null;
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
  const plain = (s) =>
    String(s || "")
      .replace(/<[^>]*>/g, "")
      .replace(/&amp;/g, "&")
      .trim();
  const artist = plain(meta.Artist?.value);
  try {
    const source = new URL(item.descriptionurl);
    if (
      source.protocol !== "https:" ||
      source.hostname !== "commons.wikimedia.org" ||
      source.username ||
      source.password ||
      source.port
    )
      return null;
    if (
      new URL(licenseUrl).protocol !== "https:" ||
      (/^CC BY/i.test(license) && !artist)
    )
      return null;
  } catch {
    return null;
  }
  return {
    thumbnailUrl: item.thumburl,
    ...(item.sha1 ? { sourceHash: item.sha1 } : {}),
    source: item.descriptionurl,
    artist,
    license,
    licenseUrl,
    credit: plain(meta.Credit?.value),
  };
}
export function acceptPortraitCandidate(candidate, portrait, queue) {
  if (portrait) {
    candidate.person.portrait = portrait;
    return "added";
  }
  if (candidate.alternatives.length) {
    queue.push({
      person: candidate.person,
      id: candidate.id,
      filename: candidate.alternatives[0],
      alternatives: candidate.alternatives.slice(1),
    });
    return "retry";
  }
  return "skipped";
}
export function resetRemotePortrait(person) {
  if (person.portrait?.path) return false;
  delete person.portrait;
  return true;
}
export function retainPortrait(person, existing) {
  if (existing.has(person.id)) person.portrait = existing.get(person.id);
}
async function readSnapshot() {
  try {
    return JSON.parse(
      await fs.readFile(path.join(root, "public/data/people.json"), "utf8"),
    );
  } catch (error) {
    if (error.code === "ENOENT") return { people: [] };
    throw error;
  }
}
async function enrichPortraits(people, entities) {
  const counts = {
    people: people.length,
    retained: people.filter((p) => p.portrait?.path).length,
    candidates: 0,
    added: 0,
    noImage: 0,
    skipped: 0,
  };
  const candidates = [];
  for (const person of people) {
    if (!resetRemotePortrait(person)) continue;
    const id = person.id.replace(/^wd-/, "");
    if (!entities.has(id) || !entities.get(id).claims)
      throw Error(
        `Missing entity claims for ${id}; preserve the prior snapshot and retry`,
      );
    const filenames = [
      ...new Set(
        values(entities.get(id), "P18").filter(
          (v) => typeof v === "string" && v,
        ),
      ),
    ];
    if (!filenames.length) {
      counts.noImage++;
      continue;
    }
    candidates.push({
      person,
      id,
      filename: filenames[0],
      alternatives: filenames.slice(1),
    });
  }
  counts.candidates = candidates.length;
  // Twenty files per request, below the 50-thumbnail API limit; requests are paced.
  for (let offset = 0; offset < candidates.length; ) {
    const group = candidates.slice(offset, offset + 20);
    const missing = [];
    for (const c of group) {
      const key = createHash("sha256").update(c.filename).digest("hex");
      c.cachePath = path.join(cache, `remote-image-${key}.json`);
      try {
        c.page = JSON.parse(await fs.readFile(c.cachePath, "utf8"));
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        missing.push(c);
      }
    }
    if (missing.length) {
      await sleep(1100);
      const result = await api(
        {
          action: "query",
          titles: missing.map((c) => `File:${c.filename}`).join("|"),
          redirects: "1",
          prop: "imageinfo",
          iiprop: "url|extmetadata|sha1",
          iiurlwidth: "240",
          iiextmetadatafilter: "Artist|Credit|LicenseShortName|LicenseUrl",
        },
        "commons.wikimedia.org",
      );
      const renames = [
        ...(result.query.normalized || []),
        ...(result.query.redirects || []),
      ];
      for (const c of missing) {
        let title = `File:${c.filename}`;
        for (let pass = 0; pass < 5; pass++)
          for (const r of renames) if (r.from === title) title = r.to;
        c.page =
          Object.values(result.query.pages).find(
            (p) => p.title === title || p.title === title.replace(/_/g, " "),
          ) || {};
        await fs.writeFile(c.cachePath, JSON.stringify(c.page));
      }
    }
    for (const c of group) {
      const portrait = remotePortrait(c.page.imageinfo?.[0]);
      const outcome = acceptPortraitCandidate(c, portrait, candidates);
      if (outcome === "added") counts.added++;
      if (outcome === "skipped") counts.skipped++;
    }
    if (offset % 100 === 0)
      console.log(
        `Portrait metadata ${offset + group.length}/${candidates.length}`,
      );
    offset += group.length;
  }
  if (counts.added + counts.skipped !== counts.candidates)
    throw Error("Portrait candidate processing incomplete");
  counts.filesAttempted = candidates.length;
  console.log(JSON.stringify(counts));
  return counts;
}
async function refreshPortraits() {
  await fs.mkdir(cache, { recursive: true });
  const snapshot = await readSnapshot();
  const entities = new Map();
  for (const file of await fs.readdir(cache)) {
    if (!file.startsWith("entities-") || !file.endsWith(".json")) continue;
    const data = JSON.parse(await fs.readFile(path.join(cache, file), "utf8"));
    for (const e of Object.values(data.entities || {}))
      if (e.claims) entities.set(e.id, e);
  }
  const missing = snapshot.people.filter(
    (p) => !entities.has(p.id.replace(/^wd-/, "")),
  );
  for (let start = 0; start < missing.length; start += 40) {
    const ids = missing
      .slice(start, start + 40)
      .map((p) => p.id.replace(/^wd-/, ""));
    const result = await cached(`portrait-entities-${ids.join("-")}.json`, () =>
      api({ action: "wbgetentities", ids: ids.join("|"), props: "claims" }),
    );
    for (const e of Object.values(result.entities)) entities.set(e.id, e);
  }
  const counts = await enrichPortraits(snapshot.people, entities);
  snapshot.portraitRefresh = { at: new Date().toISOString(), ...counts };
  const target = path.join(root, "public/data/people.json");
  await fs.writeFile(target + ".tmp", JSON.stringify(snapshot));
  await fs.rename(target + ".tmp", target);
}
async function main() {
  const limit = boundedInteger(
    process.env.PEOPLE_LIMIT,
    4000,
    100,
    10000,
    "PEOPLE_LIMIT",
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
  const previous = await readSnapshot();
  const existing = new Map(
    previous.people.map((p) => [p.id, p.portrait]).filter(([, p]) => p?.path),
  );
  for (const person of people) retainPortrait(person, existing);
  await enrichPortraits(people, new Map(entities.map((e) => [e.id, e])));
  const portraits = people.filter((p) => p.portrait).length;
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
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--refresh-portraits")) await refreshPortraits();
  else await main();
}
