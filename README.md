# Lifetimes

A static timeline playground for exploring people, ages, and overlapping lives. Built with TypeScript and Vite. Runtime dependencies: none. The browser reads a bundled Wikidata snapshot, uses cached portraits first, and loads additional thumbnails directly from Wikimedia.

## Run locally

Use Node.js 22.12 or newer and npm.

```sh
npm ci
npm run dev
```

Open the loopback address printed by Vite. Year entry accepts `44 BCE` or a positive number with the era selector. The slider supports 20-year, century, millennium, and full-history windows. Arrow keys move one year. Search includes names, aliases, descriptions, and occupations across all years.

Pin up to eight people. Open a person for birth, age-12, and death jumps, source records, and portrait credits. Favorites persist in this browser. “Copy link” includes the year and pinned IDs. Browser Back and Forward restore those values.

## Check and build

```sh
npm test
npm run validate
npm run build
npm run preview
```

`dist/` is the complete static website. Serve its contents through an ordinary HTTP server; opening `index.html` as a `file:` URL does not support the data fetch. Exploration makes no live data API calls. Additional portraits load from Wikimedia on demand, with no referring page URL sent. Cached portraits and historical data remain usable without Wikimedia access. Failed images show initials; no accounts, external fonts, or analytics are used. Open a person for the image artist, source, and license.

## Deployment

Publish the contents of `dist/` to any static host. No server functions, credentials, environment variables, or rewrite rules are required.

GitHub Pages serves [Lifetimes](https://sheurich.github.io/who-was-alive/) from the build of `main` in [sheurich/who-was-alive](https://github.com/sheurich/who-was-alive). Every push to `main` runs tests, validates the bundled data, builds the site, and deploys `dist/` through `.github/workflows/pages.yml`. A failed check prevents deployment. The workflow also supports manual runs from the repository's Actions tab. The old `gh-pages` branch is no longer a publishing source.

The build uses Vite's relative base (`./`). Scripts, styles, data, and portraits work at both a domain root and a repository subpath such as `/lifetimes/`. Use the trailing slash for a hosted directory. Query strings preserve share state without requiring path rewrites.

## Data and corrections

See [DATA.md](DATA.md) for acquisition, refresh commands, attribution, and coverage. The snapshot records source links, date precision, calendars, qualifiers, alternate claims, and references. Revision links appear only when the same entity response supplied a revision ID. `data/corrections.json` stores reviewed overrides separately from imported records.

The app uses provider-independent person and date interfaces in `src/types.ts`. Stable IDs currently retain a namespaced Wikidata mapping (`wd-Q…`). A future provider adapter can use the same interface. It must preserve IDs or provide redirects for shared URLs and saved favorites.

## Dates and uncertainty

Internal year zero means 1 BCE. It never appears as a displayed year. Original Wikidata date strings remain in `sourceValue`; normalized date strings use astronomical numbering.

The app compares whole-year intervals. Displayed age while alive is the birthday reached during the selected year. Death labels show completed years when all source claims agree on complete Gregorian dates. Otherwise, bounded dates produce an approximate age; insufficient evidence gives an unknown age. When birth dates vary, “about” marks a single estimate from the representative birth year. Different source dates widen the interval. Coarse century and millennium dates follow historical calendar boundaries. Julian dates receive conservative margins rather than an exact day conversion.

Calendar notes do not imply approximate lifetimes. Earliest and latest dates constrain the interval; all alternative dates remain represented. A person can be definitely alive while their age remains uncertain. Known birth and death years have separate labels. Unbounded approximate claims and unresolved temporal qualifiers cannot establish definite overlap. Their striped chart extents illustrate the recorded estimates, not a source-defined confidence interval. People with missing death dates have unknown life status and remain searchable. The importer does not certify living people.

A birthday jump uses a representative birth year plus twelve. It does not establish that the person survived to that age. “Definite” means supported by all imported date bounds, not independently verified historical truth.

## Structure

- `src/main.ts`: interface, native controls, dialogs, favorites, and browser history.
- `src/history.ts`: date bounds, ages, status, comparisons, and search.
- `src/state.ts`: validated URL state.
- `scripts/`: import, snapshot validation, and coverage measurement.
- `public/data/people.json`: bundled normalized snapshot.
- `public/portraits/`: cached thumbnails with per-person attribution in the snapshot.
- `tests/`: date, uncertainty, import, and URL regressions.

The layout supports desktop and tablet, with a smaller-screen fallback. Native buttons and inputs support keyboard use. Focus survives card updates. Dialogs close with Escape. Reduced-motion preferences disable the optional hover transitions.
