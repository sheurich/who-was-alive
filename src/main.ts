import "./style.css";
import type { Person, Snapshot } from "./types";
import {
  formatYear,
  parseYear,
  lifeBounds,
  isUncertain,
  statusAt,
  dateLabel,
  ageDifference,
  comparison,
  birthdayYear,
  yearOf,
  searchPeople,
} from "./history";
import { parseState, encodeState, MAX_PINS } from "./state";

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const esc = (text: unknown) =>
  String(text ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const MIN = -3500,
  MAX = 2026;
const colors = [
  "#5778cf",
  "#bb6790",
  "#47927e",
  "#b08136",
  "#8473b9",
  "#548ba6",
  "#b26953",
  "#749240",
];
let snapshot: Snapshot;
let people: Person[] = [];
let byId = new Map<string, Person>();
let year = 1850,
  pins: string[] = [],
  favorites = new Set<string>();
let favoritesOnly = false,
  limit = 48,
  rangeStart = 1800,
  rangeEnd = 1900;
let toastTimer: ReturnType<typeof setTimeout>;
let frame = 0;

function toast(message: string) {
  $("toast").textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    $("toast").textContent = "";
  }, 4500);
}
function safeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.href : "#";
  } catch {
    return "#";
  }
}
function portraitPath(person: Person): string | null {
  const path = person.portrait?.path.replace(/^\//, "");
  return path && /^portraits\/[\w.-]+$/.test(path)
    ? `${import.meta.env.BASE_URL}${path}`
    : null;
}
function initials(person: Person) {
  return person.name
    .split(/\s+/)
    .slice(0, 2)
    .map((n) => n[0])
    .join("");
}
function portrait(person: Person, small = false): string {
  const path = portraitPath(person);
  if (path)
    return `<img class="${small ? "tiny-portrait" : "portrait"}" src="${esc(path)}" alt="Portrait of ${esc(person.name)}" loading="lazy" decoding="async" />`;
  return small
    ? `<span class="tiny-portrait" aria-hidden="true"></span>`
    : `<span class="portrait-placeholder"><span class="initials" aria-hidden="true">${esc(initials(person))}</span><small>No portrait in this collection</small></span>`;
}
function syncUrl(replace = true) {
  const url = `${location.pathname}${encodeState(year, pins)}${location.hash}`;
  if (url !== `${location.pathname}${location.search}${location.hash}`)
    history[replace ? "replaceState" : "pushState"](null, "", url);
}
function recenter() {
  const span = Number($<HTMLSelectElement>("zoom").value);
  rangeStart =
    span >= MAX - MIN
      ? MIN
      : Math.max(MIN, Math.min(MAX - span, year - Math.floor(span / 2)));
  rangeEnd = Math.min(MAX, rangeStart + span);
  const slider = $<HTMLInputElement>("year-slider");
  slider.min = String(rangeStart);
  slider.max = String(rangeEnd);
  $("ruler-ticks").innerHTML = Array.from(
    { length: 5 },
    (_, i) =>
      `<span class="ruler-tick">${formatYear(Math.round(rangeStart + ((rangeEnd - rangeStart) * i) / 4))}</span>`,
  ).join("");
  slider.value = String(year);
}
function setYear(next: number, center = true, replace = true) {
  year = Math.max(MIN, Math.min(MAX, Math.trunc(next)));
  $("year-error").textContent = "";
  $<HTMLInputElement>("year-input").value = String(year <= 0 ? 1 - year : year);
  $<HTMLSelectElement>("era").value = year <= 0 ? "BCE" : "CE";
  if (center || year < rangeStart || year > rangeEnd) recenter();
  $<HTMLInputElement>("year-slider").value = String(year);
  $<HTMLInputElement>("year-slider").setAttribute(
    "aria-valuetext",
    formatYear(year),
  );
  limit = 48;
  syncUrl(replace);
  render();
}
function submitYear() {
  const next = parseYear(
    $<HTMLInputElement>("year-input").value,
    $<HTMLSelectElement>("era").value as "CE" | "BCE",
  );
  if (next === null || next < MIN || next > MAX) {
    $("year-error").textContent =
      `Enter a year from ${formatYear(MIN)} to ${formatYear(MAX)}. There is no year zero.`;
    return;
  }
  setYear(next, true, false);
}
function togglePin(id: string) {
  if (pins.includes(id)) pins = pins.filter((p) => p !== id);
  else if (pins.length >= MAX_PINS) {
    toast("Your timeline holds eight people. Remove one to add another.");
    return;
  } else pins.push(id);
  syncUrl(false);
  render();
}
function toggleFavorite(id: string) {
  favorites.has(id) ? favorites.delete(id) : favorites.add(id);
  try {
    localStorage.setItem(
      "lifetimes.favorites.v1",
      JSON.stringify([...favorites]),
    );
  } catch {
    toast(
      "Browser storage is unavailable. Favorites will last until this page closes.",
    );
  }
  renderPeople();
}
function renderTimeline() {
  const selected = pins.map((id) => byId.get(id)!).filter(Boolean);
  $("pin-count").textContent = `${selected.length} / ${MAX_PINS}`;
  $<HTMLButtonElement>("clear-pins").disabled = !selected.length;
  if (!selected.length) {
    $("timeline").innerHTML =
      '<div class="empty-timeline">Whose lives crossed? Choose “Pin to timeline” on any person below.</div>';
    $("comparisons").innerHTML = "";
    return;
  }
  const bounds = selected.map((p) => lifeBounds(p));
  const endpoints = bounds.flatMap((b) =>
    b
      ? [
          b.birth.min,
          b.birth.max,
          ...(b.death ? [b.death.min, b.death.max] : []),
        ]
      : [],
  );
  const lower = Math.min(year, ...endpoints),
    upper = Math.max(year + 1, ...endpoints);
  const padding = Math.max(5, (upper - lower) * 0.04);
  const start = Math.floor(lower - padding),
    end = Math.ceil(upper + padding);
  const pos = (y: number) =>
    Math.max(0, Math.min(100, ((y - start) / (end - start)) * 100));
  let html = `<div class="timeline-axis">${Array.from({ length: 5 }, (_, i) => `<span>${formatYear(Math.round(start + ((end - start) * i) / 4))}</span>`).join("")}</div>`;
  selected.forEach((person, i) => {
    const b = bounds[i],
      status = statusAt(person, year),
      color = colors[i];
    let bars = "";
    if (b) {
      const until = b.death?.max ?? b.birth.max;
      bars = `<span class="life-bar uncertain" style="left:${pos(b.birth.min)}%;width:${Math.max(0.3, pos(until) - pos(b.birth.min))}%;background-color:${color}"></span>`;
      const approximate = isUncertain(person);
      if (b.death && b.death.min > b.birth.max && !approximate)
        bars += `<span class="life-bar definite" style="left:${pos(b.birth.max)}%;width:${pos(b.death.min) - pos(b.birth.max)}%;background-color:${color}"></span>`;
    }
    html += `<div class="timeline-row"><div class="timeline-person">${portrait(person, true)}<button class="person-label-button" data-details="${esc(person.id)}"><div class="timeline-person-name">${esc(person.name)}</div><div class="timeline-person-label">${esc(status.label)}</div></button><button class="remove-pin" data-pin="${esc(person.id)}" aria-label="Unpin ${esc(person.name)}">×</button></div><div class="bar-track" role="img" aria-label="${esc(person.name)}: ${esc(dateLabel(person.birth))} to ${esc(dateLabel(person.death))}; ${esc(status.label)}">${bars}<span class="year-line" style="left:${pos(year)}%"></span></div></div>`;
  });
  $("timeline").innerHTML =
    html +
    `<p class="timeline-caption">The dark line marks ${formatYear(year)}. Solid: definite lifetime. Stripes: date uncertainty. Unknown death: birth marker only.</p>`;
  const pairs: string[] = [];
  selected.forEach((a, i) =>
    selected
      .slice(i + 1)
      .forEach((b) =>
        pairs.push(
          `<div class="pair"><strong>${esc(a.name)} &amp; ${esc(b.name)}</strong>${esc(ageDifference(a, b))}<br>${esc(comparison(a, b))}</div>`,
        ),
      ),
  );
  $("comparisons").innerHTML = pairs.length
    ? `<details ${pairs.length === 1 || $("comparisons").querySelector("details")?.open ? "open" : ""}><summary>Compare ${pairs.length === 1 ? "these two lives" : `all ${pairs.length} pairs`}</summary><div class="pair-list">${pairs.join("")}</div></details>`
    : "";
}
function rememberFocus(): () => void {
  const active = document.activeElement as HTMLElement | null;
  const parent = active?.closest("#people-grid, #timeline");
  const key = ["pin", "favorite", "details"].find(
    (key) => active?.dataset[key],
  );
  if (!parent || !key || !active) return () => {};
  const value = active.dataset[key];
  return () => {
    const replacement = [
      ...parent.querySelectorAll<HTMLButtonElement>("button"),
    ].find(
      (button) =>
        button.dataset[key] === value && button.className === active.className,
    );
    if (replacement) replacement.focus({ preventScroll: true });
    else {
      $("people-heading").tabIndex = -1;
      $("people-heading").focus({ preventScroll: true });
    }
  };
}
function renderPeople() {
  const restoreFocus = rememberFocus();
  const query = $<HTMLInputElement>("search").value.trim();
  const includePossible = $<HTMLInputElement>("possible").checked;
  let matches = query ? searchPeople(people, query) : people;
  if (favoritesOnly) matches = matches.filter((p) => favorites.has(p.id));
  if (!query && !favoritesOnly)
    matches = matches.filter((p) => {
      const status = statusAt(p, year).kind;
      return status === "alive" || (includePossible && status === "possible");
    });
  matches = [...matches].sort(
    $<HTMLSelectElement>("sort").value === "birth"
      ? (a, b) =>
          (yearOf(a.birth) ?? Infinity) - (yearOf(b.birth) ?? Infinity) ||
          a.name.localeCompare(b.name)
      : (a, b) =>
          ($<HTMLSelectElement>("sort").value === "featured"
            ? Number(!!b.portrait) - Number(!!a.portrait)
            : 0) || a.name.localeCompare(b.name),
  );
  $("people-heading").textContent = favoritesOnly
    ? "Your favorites"
    : query
      ? "Across all history"
      : `People in ${formatYear(year)}`;
  $("result-count").textContent =
    `${matches.length.toLocaleString()} ${matches.length === 1 ? "person" : "people"}${query || favoritesOnly ? ` · ages shown for ${formatYear(year)}` : " in this collection"}`;
  $("favorite-count").textContent = String(favorites.size);
  $("search-note").textContent =
    query || favoritesOnly
      ? "Search and favorites stay visible across years. Open a person to jump to their lifetime."
      : "An uncertain age can still mean definitely alive. Birth and death years are marked separately.";
  $("all-view").setAttribute("aria-pressed", String(!favoritesOnly));
  $("favorites-view").setAttribute("aria-pressed", String(favoritesOnly));
  $<HTMLInputElement>("possible").disabled = !!query || favoritesOnly;
  $("people-grid").innerHTML =
    matches
      .slice(0, limit)
      .map((person) => {
        const status = statusAt(person, year),
          isPinned = pins.includes(person.id),
          favorite = favorites.has(person.id);
        return `<article class="person-card"><button class="portrait-button" data-details="${esc(person.id)}" aria-label="Explore ${esc(person.name)}">${portrait(person)}<span class="status-badge ${status.kind}">${esc(status.label)}</span></button><div class="card-body"><button class="person-name" data-details="${esc(person.id)}">${esc(person.name)}</button><p class="person-dates">${esc(dateLabel(person.birth))} – ${esc(dateLabel(person.death))}</p><p class="description">${esc(person.description || person.occupations.filter((label) => !/^Q\d+$/.test(label)).join(", ") || "Explore this life and its source records.")}</p><div class="card-actions"><button class="pin-button" data-pin="${esc(person.id)}" aria-pressed="${isPinned}">${isPinned ? "Pinned ✓" : "+ Pin to timeline"}</button><button class="favorite-button" data-favorite="${esc(person.id)}" aria-pressed="${favorite}" aria-label="${favorite ? "Remove" : "Save"} ${esc(person.name)} ${favorite ? "from" : "to"} favorites">${favorite ? "★" : "☆"}</button></div></div></article>`;
      })
      .join("") ||
    `<div class="empty-results"><h3>${favoritesOnly ? "Keep a few lives close." : "A little further into the unknown."}</h3>${favoritesOnly ? "Use the star on a person to save a favorite." : query ? "No matches. Try a name, occupation, or another spelling." : "This collection has no matches for that year. Try another year, include possible matches, or search for someone."}</div>`;
  const more = $<HTMLButtonElement>("show-more");
  more.hidden = matches.length <= limit;
  more.textContent = `Show more (${Math.max(0, matches.length - limit).toLocaleString()} remaining)`;
  restoreFocus();
}
function render() {
  const restoreFocus = rememberFocus();
  renderTimeline();
  renderPeople();
  restoreFocus();
}
function showDetails(id: string) {
  const person = byId.get(id);
  if (!person) return;
  const path = portraitPath(person);
  const jump = (label: string, value: number | null) =>
    value !== null && value >= MIN && value <= MAX
      ? `<button data-jump="${value}">${label}</button>`
      : "";
  const credit = person.portrait;
  $("details-content").innerHTML =
    `${path ? `<img class="detail-portrait" src="${esc(path)}" alt="Portrait of ${esc(person.name)}" />` : ""}<h2>${esc(person.name)}</h2><p>${esc(person.description)}</p><p>${esc(statusAt(person, year).label)} in ${formatYear(year)}</p><table class="date-table"><tr><th>Born</th><td>${esc(dateLabel(person.birth))}</td></tr><tr><th>Died</th><td>${esc(dateLabel(person.death))}</td></tr><tr><th>Known for</th><td>${esc(person.occupations.filter((label) => !/^Q\d+$/.test(label)).join(", ") || "Not recorded")}</td></tr></table><div class="detail-actions">${jump("Birth year", yearOf(person.birth))}${jump("At age 12", birthdayYear(person, 12))}${jump("Death year", yearOf(person.death))}<button data-pin="${esc(id)}">${pins.includes(id) ? "Unpin" : "Pin to timeline"}</button></div><p class="attribution">Jumps use a representative year when dates vary. A jump to age 12 does not establish that a person lived to 12.</p><h3>Sources</h3><ul>${person.sources.map((s) => `<li><a href="${esc(safeUrl(s))}" target="_blank" rel="noopener noreferrer">${esc(s.replace(/^https?:\/\//, ""))}</a></li>`).join("")}</ul>${credit ? `<p class="attribution">Portrait: ${esc(credit.artist)}. <a href="${esc(safeUrl(credit.source))}" target="_blank" rel="noopener noreferrer">Original image</a>. <a href="${esc(safeUrl(credit.licenseUrl))}" target="_blank" rel="noopener noreferrer">${esc(credit.license)}</a>. ${esc(credit.credit || "")} Thumbnail resized; display may crop.</p>` : '<p class="attribution">No licensed portrait is cached for this person.</p>'}<details><summary>Date precision and source claims</summary><p>Dates retain their source precision, calendar, alternatives, and reference records. Approximate dates are estimates, not exact birthdays.</p><pre>${esc(JSON.stringify({ birth: person.birth, death: person.death }, null, 2))}</pre></details>`;
  $<HTMLDialogElement>("details").showModal();
}
function showAbout() {
  const portraits = people.filter((p) => p.portrait).length;
  const bce = people.filter((p) => (yearOf(p.birth) ?? 1) <= 0).length;
  const unknown = people.filter((p) => !p.death.length).length;
  $("about-content").innerHTML =
    `<h2>History is full of connections.</h2><p>Lifetimes is a place to explore them. Pick a year, search for anyone, and pin up to eight lives to one timeline.</p><h3>What is in this collection?</h3><p>${people.length.toLocaleString()} people, ${portraits.toLocaleString()} cached portraits, and ${bce.toLocaleString()} people with a representative birth year in BCE. Snapshot: ${esc(snapshot.generatedAt?.slice(0, 10) || "not recorded")}.</p><p>This is a sample of recorded history, not everyone who lived. Coverage favors well-documented people and English-language records. Ancient history, women, and many regions remain underrepresented.</p><h3>What do the dates mean?</h3><p>CE and BCE meet without a year zero: 1 BCE is followed by 1 CE. Ages describe a whole year, so a range is often more honest than one number.</p><p>Solid bars show definite lifetime spans supported by the imported dates. Stripes show uncertainty. A person can be definitely alive even when their age is uncertain. “Possibly alive” means the dates cannot establish life status for that year. Known birth and death years have their own labels. Calendar notes do not make an entire lifetime uncertain. Portraits may be later artistic representations.</p><p>${unknown.toLocaleString()} records have no death date. That does not prove someone is alive. These people remain searchable, with an unknown life status.</p><h3>Sources and privacy</h3><p>Biographical data comes from <a href="https://www.wikidata.org/" target="_blank" rel="noopener noreferrer">Wikidata</a>, available under CC0. Open a person for individual sources and <a href="https://commons.wikimedia.org/" target="_blank" rel="noopener noreferrer">Wikimedia Commons</a> image credits. Reviewed corrections are stored separately from imports.</p><p>Exploration uses bundled data and portraits. Favorites stay in this browser. Shared links contain the selected year and pinned IDs; they do not include favorites. No accounts or analytics.</p><p>Inspired by <a href="https://neal.fun/who-was-alive/" target="_blank" rel="noopener noreferrer">Neal Agarwal’s Who Was Alive?</a></p>`;
  $<HTMLDialogElement>("about").showModal();
}

document.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>("button");
  if (!target) return;
  if (target.dataset.pin) {
    togglePin(target.dataset.pin);
    if ($<HTMLDialogElement>("details").open)
      target.textContent = pins.includes(target.dataset.pin)
        ? "Unpin"
        : "Pin to timeline";
  }
  if (target.dataset.favorite) toggleFavorite(target.dataset.favorite);
  if (target.dataset.details) showDetails(target.dataset.details);
  if (target.dataset.jump) {
    $<HTMLDialogElement>("details").close();
    setYear(Number(target.dataset.jump), true, false);
  }
  if (target.dataset.step)
    setYear(year + Number(target.dataset.step), false, false);
  if (target.classList.contains("dialog-close"))
    target.closest("dialog")?.close();
});
$("year-form").addEventListener("submit", (e) => {
  e.preventDefault();
  submitYear();
});
$("year-input").addEventListener("change", submitYear);
$("era").addEventListener("change", submitYear);
$("year-slider").addEventListener("input", () => {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() =>
    setYear(Number($<HTMLInputElement>("year-slider").value), false),
  );
});
$("zoom").addEventListener("change", recenter);
$("recenter").addEventListener("click", recenter);
$("search").addEventListener("input", () => {
  limit = 48;
  renderPeople();
});
$("sort").addEventListener("change", renderPeople);
$("possible").addEventListener("change", () => {
  limit = 48;
  renderPeople();
});
$("show-more").addEventListener("click", () => {
  limit += 48;
  renderPeople();
});
$("all-view").addEventListener("click", () => {
  favoritesOnly = false;
  limit = 48;
  renderPeople();
});
$("favorites-view").addEventListener("click", () => {
  favoritesOnly = true;
  limit = 48;
  renderPeople();
});
$("clear-pins").addEventListener("click", () => {
  pins = [];
  syncUrl(false);
  render();
});
$("about-button").addEventListener("click", showAbout);
$("footer-about").addEventListener("click", showAbout);
$("surprise").addEventListener("click", () => {
  const candidates = people.filter((p) => {
    const b = yearOf(p.birth);
    return b !== null && b >= MIN && b + 12 <= MAX && p.death.length;
  });
  const p = candidates[Math.floor(Math.random() * candidates.length)];
  if (p) {
    $<HTMLInputElement>("search").value = "";
    favoritesOnly = false;
    setYear(birthdayYear(p, 12)!, true, false);
    toast(`A year near ${p.name}’s twelfth birthday.`);
  }
});
$("share").addEventListener("click", async () => {
  syncUrl();
  try {
    await navigator.clipboard.writeText(location.href);
    toast("Link copied. Your year and pinned people travel with it.");
  } catch {
    $("pin-notice").innerHTML =
      `Copy this link: <input class="fallback-link" aria-label="Shareable link" readonly value="${esc(location.href)}" />`;
    const field = $("pin-notice").querySelector("input");
    field?.select();
  }
});
window.addEventListener("popstate", () => {
  const state = parseState(location.search, new Set(byId.keys()));
  pins = state.pins;
  setYear(state.year, true);
});
async function start() {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}data/people.json`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    snapshot = (await response.json()) as Snapshot;
    if (!Array.isArray(snapshot.people) || !snapshot.people.length)
      throw new Error("Empty snapshot");
    people = snapshot.people;
    byId = new Map(people.map((p) => [p.id, p]));
    try {
      const saved: unknown = JSON.parse(
        localStorage.getItem("lifetimes.favorites.v1") || "[]",
      );
      if (Array.isArray(saved))
        favorites = new Set(
          saved.filter(
            (id): id is string => typeof id === "string" && byId.has(id),
          ),
        );
    } catch {
      /* Unavailable or malformed storage never blocks exploration. */
    }
    const state = parseState(location.search, new Set(byId.keys()));
    pins = state.pins;
    $("snapshot-info").textContent =
      `${people.length.toLocaleString()} lives to explore • Bundled snapshot`;
    setYear(state.year);
    document.querySelector("main")!.inert = false;
    $<HTMLButtonElement>("about-button").disabled = false;
    $<HTMLButtonElement>("footer-about").disabled = false;
  } catch (error) {
    $("result-count").textContent = "The collection could not load.";
    $("people-grid").innerHTML =
      '<div class="empty-results"><h3>Unable to open the bundled data.</h3>Reload this page. If you opened a file directly, serve the site with a static web server.</div>';
    console.error(error);
  }
}
void start();
