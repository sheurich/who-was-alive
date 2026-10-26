# Historical data

The site reads a bundled snapshot. Browsing does not call Wikidata or Wikimedia APIs. Wikidata structured data is CC0. Every cached or linked portrait has its license, artist, source, and credit in the snapshot. Browsing can request thumbnail images directly from Wikimedia.

## Refresh

Use Node.js 22 or later from the repository root:

```sh
node scripts/import.mjs
node scripts/validate-data.mjs
```

To refresh only portraits while preserving all biographies and date corrections:

```sh
node scripts/import.mjs --refresh-portraits
node scripts/coverage.mjs
node scripts/validate-data.mjs
```

Remote metadata checkpoints in `work/cache/remote-image-*.json` are keyed by the exact Commons filename. Remove these checkpoints to refetch remote metadata. Existing cached portraits and their attribution remain unchanged.

The importer requests at most 4,000 base search results, plus introductory seeds, required inclusions, and at most 1,810 results across twelve supplementary searches. `PEOPLE_LIMIT` changes the search cap. Portrait metadata has no separate count cap; the importer checks all selected people with an image. Requests run sequentially, use a descriptive user agent, include `maxlag=15`, enforce 60-second request timeouts, and retry up to five times with backoff. HTTP 429 responses honor numeric or HTTP-date `Retry-After` values. A pause longer than two minutes stops the import with a resume-after time. Checkpoints in `work/cache/` allow interrupted runs to resume. Delete that directory for a fresh import; keep it to rebuild from the same responses. Never commit the cache.

`requiredPeople` in `scripts/import.mjs` permanently includes explicitly requested people alongside the search results. Christian Heurich (`Q1080305`) is included this way.

Selection uses the MediaWiki Action API search for humans with birth and death statements, ordered by incoming links. Supplementary searches cover ancient and medieval text matches, women, and citizenship in India, China, Japan, Nigeria, Egypt, Mexico, Brazil, Iran, and South Africa. Text matches are selection aids, not verified era classifications. Full entities arrive through `wbgetentities` in batches of 40. Separate batches resolve occupation, citizenship, and gender labels. This avoids downloading the full Wikidata dump. The query service was tested but failed to return within the bounded request; the Action API supplied the finished snapshot.

Incoming links measure connections inside Wikidata. They do not measure historical importance. This method overrepresents taxonomists, rulers, European figures, and well-documented modern people. English or multilingual name labels are required. Ancient societies, Indigenous people, women, and people without written records remain unevenly represented. Citizenship is a source label, not a complete geographic or cultural identity. Missing citizenship does not imply missing historical relevance.

Selection requires a recorded death, except for the introductory seeds. Current living people are therefore poorly covered. No missing death is converted into a living status. The importer never sets `livingAsOf`.

## Dates and sources

Every nondeprecated birth and death statement with a time value survives, including normal-rank alternatives when a preferred claim exists. The snapshot preserves precision, calendar, before/after values, qualifiers, references, rank, and statement ID. Unknown-value and no-value claims remain as sentinel entries with an empty `value`, `precision: 0`, and their original `snaktype`, qualifiers, and references. The empty value asserts no date. A mixed concrete and unresolved claim must not become a definite timeline interval. Source URLs include the entity. Revision links appear only when that same entity response includes a numeric revision. The initial cached base responses lack revision metadata, so those claims are timestamped imports, not revision-pinned records. Fresh imports request `info` with the claims to capture revisions together.

Wikidata JSON uses negative historical years: `-0001` means 1 BCE. The importer changes negative years by one for the app's astronomical year representation: `+0000` means 1 BCE and `-0001` means 2 BCE. `sourceValue` preserves the original time string. Calendar values remain unchanged; the importer does not silently convert Julian dates to Gregorian dates. Month and day placeholders remain zero when absent.

The importer sets `approximate` for explicit circa, approximately, and estimate qualifiers (`Q5727902`, `Q60070514`, `Q37113960` under `P1480` or `P5102`). It preserves every qualifier for interpretation. Calendar notes such as assumed Gregorian, assumed Julian, or a date specified in both calendars do not mean circa. Earliest and latest dates constrain the possible interval. Date refinements preserve the broader source precision. De facto, de jure, and most-precise-value notes do not invalidate the recorded years; alternative dates remain separate. Disputed, presumed, hypothetical, and unrecognized sourcing or statement qualifiers remain uncertain. Official and unofficial statement status preserve the recorded bounds. Source precision limits claims; it does not prove that a source is correct. Widely disputed ancient and religious biographies can remain in Wikidata's human classification. See the official definitions of [sourcing circumstances](https://www.wikidata.org/wiki/Property:P1480), [earliest date](https://www.wikidata.org/wiki/Property:P1319), [latest date](https://www.wikidata.org/wiki/Property:P1326), and [date refinement](https://www.wikidata.org/wiki/Property:P4241).

Stable app IDs have the form `wd-Q123`. This namespace prevents collisions with future providers. Names use English Wikidata labels, with multilingual labels as a fallback. Descriptions use the English Wikidata field. No generated biography or invented date fills missing data.

## Corrections

`data/corrections.json` is a separate map from app IDs to reviewed field replacements. The importer applies it after source conversion and never overwrites it. Include the reason and a source URL in any correction record;  Corrections can replace entire arrays, so reviewers must preserve supported alternatives unless evidence excludes them.

Christian Heurich has two retained death claims: Wikidata revision 2558857230 records 4 March 1945; [English Wikipedia revision 1361594613](https://en.wikipedia.org/w/index.php?title=Christian_Heurich&oldid=1361594613) records 7 March 1945. The correction preserves both claims and their references. Both imply age 102. His addition uses a targeted import so that existing records remain unchanged.

## Portraits

Commons `imageinfo` supplies thumbnail URLs and `extmetadata` license details. The importer requests twenty file titles per metadata query; thumbnails are 240–250 pixels wide. It retains existing cached portraits, tries alternative recorded images when the first fails validation, and links additional images identified as CC BY, CC BY-SA, CC0, or public domain. It stores plain-text attribution, a Commons file page, and the license URL. Portrait filenames include a hash of the thumbnail URL and Commons source-file SHA1. Cached portrait bytes and their attribution stay together. Linked images can change or become unavailable on Wikimedia. Thumbnails are resized representations; historical portraits may be later depictions. Missing, rejected, or failed images leave the person available with a placeholder. The browser prefers local files, permits remote thumbnails only from HTTPS upload.wikimedia.org or thumb.wikimedia.org, loads card portraits lazily, and sends no referrer. Artist, source, and license links appear in the person details. Filenames preserve supported raster extensions from the thumbnail URL, and validation checks file signatures.

## Snapshot coverage: 26 October 2026

The bundled snapshot contains 5,256 people and 3,310 licensed portraits: 250 cached files and 3,060 Wikimedia thumbnail links. Of the remaining people, 1,878 have no recorded image and 68 have no image accepted under the supported license and attribution checks. The import checked 3,135 file candidates for 3,127 people; alternate images recovered seven portraits. Births range from 3200 BCE to 2000 CE, using each record's first concrete birth claim for these counts. Alternatives and uncertainty may span other eras. All concrete representative births fit the interface range.

| Birth era | People |
| --- | ---: |
| Before 1 CE | 232 |
| 1–499 | 82 |
| 500–999 | 116 |
| 1000–1499 | 195 |
| 1500–1799 | 692 |
| 1800–1899 | 1,792 |
| 1900 onward | 2,147 |

The sample remains uneven: 4,761 records have a male-only gender label, and 480 have a female-only label. Historical and present-day citizenship labels cover 342 distinct values; these are not 342 modern countries. Nine records lack a death date, 29 retain unresolved date claims, and 41 lack an English description. Twenty-seven occupation IDs lack English or multilingual labels, affecting 50 people; the IDs remain in the data, and the interface hides those codes.

Birth dates have multiple claims for 962 people; death dates have multiple claims for 812. For 337 people, no birth claim has a statement reference; for 394, no death claim has one. Their Wikidata entity links remain available, but these gaps do not count as independent historical verification. Exactly 808 records include a revision captured with their claims; the other 4,448 have an entity link without a revision pin.

The original snapshot was imported on 10 October 2026; Christian Heurich was added on 26 October 2026. Portrait acquisition counts above describe the original full import; his additional portrait uses the same license and attribution checks.

The snapshot is about 39 MB before compression because it retains raw date qualifiers and references. `public/data/coverage.json` contains the measured counts. Regenerate it with `node scripts/coverage.mjs` after an import. No contemporary living roster or balanced regional census is claimed.

## Official documentation checked

- [Wikidata data access](https://www.wikidata.org/wiki/Wikidata:Data_access)
- [MediaWiki API etiquette](https://www.mediawiki.org/wiki/API:Etiquette)
- [Wikidata date model and BCE JSON convention](https://www.wikidata.org/wiki/Help:Dates)
- [Wikibase entity API](https://www.wikidata.org/w/api.php?action=help&modules=wbgetentities)
- [Commons image information and metadata](https://www.mediawiki.org/wiki/API:Imageinfo)
