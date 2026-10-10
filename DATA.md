# Historical data

The site reads a bundled snapshot. Browsing does not call Wikidata or Wikimedia APIs. Wikidata structured data is CC0. Each cached portrait has its own license, artist, source, and credit in the snapshot.

## Refresh

Use Node.js 22 or later from the repository root:

```sh
node scripts/import.mjs
node scripts/validate-data.mjs
```

The importer requests at most 4,000 base search results, plus introductory seeds and at most 1,810 results across twelve supplementary searches. `PEOPLE_LIMIT` changes the search cap. `PORTRAIT_LIMIT` changes the thumbnail cap, which defaults to 250. Requests run sequentially, use a descriptive user agent, include `maxlag=15`, enforce 60-second request timeouts, and retry up to five times with backoff. HTTP 429 responses honor numeric or HTTP-date `Retry-After` values. A pause longer than two minutes stops the import with a resume-after time. Checkpoints in `work/cache/` allow interrupted runs to resume. Delete that directory for a fresh import; keep it to rebuild from the same responses. Never commit the cache.

Selection uses the MediaWiki Action API search for humans with birth and death statements, ordered by incoming links. Supplementary searches cover ancient and medieval text matches, women, and citizenship in India, China, Japan, Nigeria, Egypt, Mexico, Brazil, Iran, and South Africa. Text matches are selection aids, not verified era classifications. Full entities arrive through `wbgetentities` in batches of 40. Separate batches resolve occupation, citizenship, and gender labels. This avoids downloading the full Wikidata dump. The query service was tested but failed to return within the bounded request; the Action API supplied the finished snapshot.

Incoming links measure connections inside Wikidata. They do not measure historical importance. This method overrepresents taxonomists, rulers, European figures, and well-documented modern people. English or multilingual name labels are required. Ancient societies, Indigenous people, women, and people without written records remain unevenly represented. Citizenship is a source label, not a complete geographic or cultural identity. Missing citizenship does not imply missing historical relevance.

Selection requires a recorded death, except for the introductory seeds. Current living people are therefore poorly covered. No missing death is converted into a living status. The importer never sets `livingAsOf`.

## Dates and sources

Every nondeprecated birth and death statement with a time value survives, including normal-rank alternatives when a preferred claim exists. The snapshot preserves precision, calendar, before/after values, qualifiers, references, rank, and statement ID. Unknown-value and no-value claims remain as sentinel entries with an empty `value`, `precision: 0`, and their original `snaktype`, qualifiers, and references. The empty value asserts no date. A mixed concrete and unresolved claim must not become a definite timeline interval. Source URLs include the entity. Revision links appear only when that same entity response includes a numeric revision. The initial cached base responses lack revision metadata, so those claims are timestamped imports, not revision-pinned records. Fresh imports request `info` with the claims to capture revisions together.

Wikidata JSON uses negative historical years: `-0001` means 1 BCE. The importer changes negative years by one for the app's astronomical year representation: `+0000` means 1 BCE and `-0001` means 2 BCE. `sourceValue` preserves the original time string. Calendar values remain unchanged; the importer does not silently convert Julian dates to Gregorian dates. Month and day placeholders remain zero when absent.

Any sourcing-circumstances qualifier marks a date as approximate. The UI must interpret all alternatives and qualifiers conservatively. Source precision is a limit on claims, not proof that the source is correct. Widely disputed ancient and religious biographies can remain in Wikidata's human classification.

Stable app IDs have the form `wd-Q123`. This namespace prevents collisions with future providers. Names use English Wikidata labels, with multilingual labels as a fallback. Descriptions use the English Wikidata field. No generated biography or invented date fills missing data.

## Corrections

`data/corrections.json` is a separate map from app IDs to reviewed field replacements. The importer applies it after source conversion and never overwrites it. Include the reason and a source URL in any correction record; an empty map means no local corrections exist. Corrections can replace entire arrays, so reviewers must preserve supported alternatives unless evidence excludes them.

## Portraits

Commons `imageinfo` supplies thumbnail URLs and `extmetadata` license details. The importer batches up to twenty file titles per metadata query; staged thumbnails are 240–250 pixels wide. The importer caches only images identified as CC BY, CC BY-SA, CC0, or public domain. It stores plain-text attribution, a Commons file page, and the license URL. Portrait filenames include a hash of the thumbnail URL and Commons source-file SHA1. A replacement under the same Commons filename therefore gets new cached bytes. Metadata without a source SHA1 is refreshed before use. Thumbnails are resized representations; historical portraits may be later depictions. Missing or rejected images leave the person available with a placeholder. Filenames preserve supported raster extensions from the thumbnail URL, and validation checks file signatures.

## Snapshot coverage: 10 October 2026

The bundled snapshot contains 5,255 people and 250 licensed portraits. Births range from 3200 BCE to 2000 CE, using each record's first concrete birth claim for these counts. Alternatives and uncertainty may span other eras. All concrete representative births fit the interface range.

| Birth era | People |
| --- | ---: |
| Before 1 CE | 232 |
| 1–499 | 82 |
| 500–999 | 116 |
| 1000–1499 | 195 |
| 1500–1799 | 692 |
| 1800–1899 | 1,791 |
| 1900 onward | 2,147 |

The sample remains uneven: 4,760 records have a male-only gender label, and 480 have a female-only label. Historical and present-day citizenship labels cover 342 distinct values; these are not 342 modern countries. Nine records lack a death date, 29 retain unresolved date claims, and 41 lack an English description. Twenty-seven occupation IDs lack English or multilingual labels, affecting 50 people; the IDs remain in the data, and the interface hides those codes.

Birth dates have multiple claims for 962 people; death dates have multiple claims for 811. For 337 people, no birth claim has a statement reference; for 394, no death claim has one. Their Wikidata entity links remain available, but these gaps do not count as independent historical verification. Exactly 807 records include a revision captured with their claims; the other 4,448 have an entity link without a revision pin.

The snapshot is about 39 MB before compression because it retains raw date qualifiers and references. `public/data/coverage.json` contains the measured counts. Regenerate it with `node scripts/coverage.mjs` after an import. No contemporary living roster or balanced regional census is claimed.

## Official documentation checked

- [Wikidata data access](https://www.wikidata.org/wiki/Wikidata:Data_access)
- [MediaWiki API etiquette](https://www.mediawiki.org/wiki/API:Etiquette)
- [Wikidata date model and BCE JSON convention](https://www.wikidata.org/wiki/Help:Dates)
- [Wikibase entity API](https://www.wikidata.org/w/api.php?action=help&modules=wbgetentities)
- [Commons image information and metadata](https://www.mediawiki.org/wiki/API:Imageinfo)
