# Lifetimes project rules

## Tech stack

- Strict TypeScript targets ES2022 and uses ES modules.
- Vite 7 builds two static HTML entry points: `index.html` (Lifetimes) and `infinite-games.html` (Infinite Games).
- The UI uses native HTML, CSS, and browser APIs, with no runtime npm dependencies.
- Lifetimes reads a bundled Wikidata snapshot. Portraits use cached assets first and Wikimedia thumbnails as a fallback.
- Node.js 22.12+ and npm provide the development environment and run data import and validation scripts.
- Node’s built-in test runner executes TypeScript tests with `tsx`; `tsc --noEmit` checks application types before Vite builds.

## Library choices

| Task | Use | Preserve |
| --- | --- | --- |
| UI and styling | Semantic HTML, DOM methods, native controls and dialogs, and plain CSS | Keyboard navigation, focus, and reduced-motion support. Do not introduce React, component kits, or Tailwind. |
| Navigation and state | `URLSearchParams` and the History API for shared state; `localStorage` for favorites | Back/Forward behavior and existing shared links. Keep the two HTML entries rather than adding a router. |
| Historical data and search | Native `fetch` for the bundled JSON; project date and search logic in `src/history.ts` | BCE numbering and uncertain date ranges. Do not substitute JavaScript `Date` or a generic date library for historical interval logic. |
| Portraits | Native image elements, cached thumbnails, then Wikimedia images | Attribution, no-referrer requests, and initials when an image fails. Do not add an image service. |
| Tests and tooling | `node:test` and `node:assert/strict` for tests, `tsx` for loading TypeScript tests, and Vite for bundling | Keep tooling in `devDependencies`. Build with the relative base (`./`) so assets work on repository subpaths. |

Prefer existing project modules and standard platform APIs before proposing a dependency. Keep runtime exploration static: refresh historical records through the import workflow in [DATA.md](DATA.md), not through live queries from the browser.
