# language-dialects-library — Architecture & Context

Reference for future sessions/agents. Read this before changing the repo. The user-facing overview is `README.md`.

## What this is and why

An open-source library for looking up words by **region or dialect**, across many languages (e.g. Spanish *coche* in Spain vs. *carro* in Mexico; Vietnamese *lợn* in the North vs. *heo* in the South). Languages so far: **Vietnamese** (`vi`, 2026-09-27) and **Spanish** (`es`, 2026-09-27). It started as a data source for **Language Helper** (`~/dev/Language-Helper`), which teaches a language by building on how the learner already talks and targets Southern Vietnamese first. The owner (GitHub `nguyen18`) wants this one repo to eventually hold **many languages** behind a single import.

Decisions (2026-09-27, with the owner):
- **Source:** Kaikki.org's JSONL extraction of English Wiktionary (wiktextract). Chosen over the Free Vietnamese Dictionary Project (no dialect tags) and research corpora (sentences, not dictionaries).
- **Region rule (owner's):** senses with no region tag count as used in **every** region. We also keep `regionTagged` so apps can tell confirmed from assumed; the owner agreed.
- **Descriptions are language-general** (owner's request when Spanish was added): the README, package descriptions and GitHub description/topics describe a multi-language library, not a Vietnamese one.
- **Shape:** monorepo; one tiny API package plus one data package per language; data fetched on demand from jsDelivr, never bundled. Generated data is published to npm, not committed to git.
- **Licensing:** code MIT; data CC BY-SA 4.0 (required by Wiktionary's license). Apps that show the data must credit it.

## Layout

```
languages/<lang>.ts          per-language build config (regions, tag → region mapping, filters)
scripts/build-language.ts    Kaikki JSONL → packages/<lang>/data
scripts/language-config.ts   LanguageConfig type
packages/core/               npm "language-dialects-library": the API (src/index.ts) + shared types (src/types.ts)
packages/core/test/          node:test tests (fake-data ranking tests + real-data checks when built)
packages/<lang>/             npm "language-dialects-library-<lang>": data/ (generated), LICENSE (CC BY-SA 4.0 text), README
.cache/                      downloaded Kaikki files (gitignored)
```

npm workspaces; TypeScript everywhere. Scripts and tests run directly with `node --experimental-strip-types` (Node 22.6+), so they use only erasable TS syntax (`erasableSyntaxOnly`) and `.ts` import extensions. The core package compiles with `tsc` (`rewriteRelativeImportExtensions` turns `./types.ts` into `./types.js`) to `dist/` (ESM + .d.ts).

## Data format (`packages/core/src/types.ts`)

- `data/meta.json`: `LanguageMeta`: lang, name, regions, optional `regionGroups` (group name → member regions), source (URL, retrieved, Last-Modified), license, counts, and `shards` (which files exist).
- `data/words/<xx>.json`: `WordShard`, headword → `StoredEntry[]`.
- `data/en/<xx>.json`: `EnglishShard`, normalized English term → `StoredHit[]`.
- **Stored vs. full form:** files store `StoredSense`/`StoredHit`, where an **untagged sense omits `regions`** (meaning every region, `regionTagged: false`) and empty `labels` are omitted. `toStored()` (build) and `fromStored(item, meta.regions)` (API) convert. Consumers only ever see full `Sense`/`Entry`/`Hit`. This matters for Spanish: listing 23 countries on every untagged sense bloated the data; Vietnamese also shrank from 19.6 to 12.2 MB.
- `Sense`: `glosses`, `regions`, `regionTagged`, `labels`, optional `altOf`.
- `Hit`: word, pos, gloss, regions, regionTagged, labels, altOf, `senseIndex`, `senses` (the word's total sense count), `primary`.
- **Sharding:** `shardKey()` = first two letters, lowercased, diacritics stripped (so ñ → n), đ → d, non a–z → `_` (`không` → `kh`, `ở` → `o_`, `ñame` → `na`). Latin-script only: non-Latin languages would all land in `__` and need a script-aware key (a format change → `DATA_VERSION` bump). Two letters (not one) keep files small: typical en shard ≈ 13 kB gzipped, largest ≈ 51 kB (one-letter shards were up to 163 kB). The same function is used to write and read, so **changing it requires a data rebuild and a `DATA_VERSION` bump**.

## Build pipeline (`scripts/build-language.ts`)

1. Download `https://kaikki.org/dictionary/<Name>/kaikki.org-dictionary-<Name>.jsonl` to `.cache/kaikki-<lang>.jsonl` (+ `.info.json` with Last-Modified). Cached; `--refresh` re-downloads.
2. Validate that every `regionGroups` member is in `regions`. Per entry: skip `config.skipPos` and words failing `config.keepWord`. Per sense: skip empty glosses; with `config.skipFormOf`, skip inflection senses (`form-of` tag, unless also `alt-of`); regions from `config.regionsFromTags(tags, raw_tags)`, else all regions with `regionTagged: false`; labels = tags in the `LABELS` allowlist; `altOf` from `alt_of`/`form_of`.
3. English index: terms come from glosses via `termsOf()`: drop `(...)` notes and quotes; if there's a colon, use only the text after the last one ("Negates …: not"); split on `; , /`; normalize (`normalizeEnglish`: lowercase, drop leading to/a/an/the); keep ≤ 4 words of plain letters; also index the bare verb without a trailing particle ("wait for" → "wait"), sharing its position. `primary` = the term is the gloss's first meaning.
4. Variant senses (`altOf`) are indexed under the **target word's** non-variant glosses, preferring the same part of speech (pronoun *tui* → pronoun senses of *tôi*, not its noun "servant").
5. `pos: 'name'` entries are kept in words/ but not in the English index.
6. Writes shards + meta, prints counts and total size.

### Languages

Vietnamese (`languages/vi.ts`): regions Northern/Central/Southern. Tags `Southern`/`Central`/`Northern`; `Central`+`North` = North Central → Central; free-text raw tags mentioning Vietnam/dialect are parsed too. Skips `character`/`romanization` POS and headwords without Latin letters (chữ Hán). Build of 2026-09-27 (Kaikki file dated 2026-09-25): 35,394 entries, 42,419 senses, 1,330 region-tagged (≈3%), ≈29k English terms, 12.2 MB raw across ~617 files (after the stored-form change).

Spanish (`languages/es.ts`): regions are 23 **countries** (Spain, Mexico, the Central American, Caribbean and South American countries, United States, Philippines, Equatorial Guinea). `regionGroups`: Latin America, Central America, Caribbean, South America, Río de la Plata (Argentina + Uruguay). Tag mapping: country tags (hyphenated, e.g. `El-Salvador`) → country; `US`/`Louisiana` → United States; areas of Spain (`Andalusia`, `Canary-Islands`, `Aragon`, …) → Spain; group tags (`Latin-America`, `Central-America`, `Caribbean`, `South-America`, `Rioplatense`, `Lunfardo`) → all their countries; raw tags starting "in …" are matched by name. `skipFormOf: true`: 721,628 of 875,726 source senses are conjugations/plurals. Build of 2026-09-27 (Kaikki file dated 2026-09-25, 1.05 GB): 123,995 entries, 153,963 senses, 11,940 region-tagged (7.8%), 92,137 English terms, 38.3 MB raw across 928 files; largest shard ≈111 kB gzipped; ~7 s and ~550 MB memory. Spot checks: car → coche (Spain) / carro (Mexico); bus → camión (Mexico), guagua (Cuba, Canary Islands); computer → ordenador (Spain) / computadora (Latin America); cool → guay (Spain) / chido (Mexico); popcorn → pochoclo (Argentina); you → vos (Río de la Plata).

## API (`packages/core/src/index.ts`)

`createDictionary({ lang, baseUrl?, load? })` → `{ meta, lookup, searchEnglish }`.
- Default loader: `fetch` from `dataUrl(lang)` = `https://cdn.jsdelivr.net/npm/language-dialects-library-<lang>@<DATA_VERSION>/data`. `DATA_VERSION` is a jsDelivr range (`'0.1'`).
- Every file loads at most once per dictionary (promise cache); failed loads are evicted for retry. Shards not listed in `meta.shards` aren't requested (no 404s).
- `searchEnglish`: `region` may be a region or a `regionGroups` name (a group = any of its regions); unknown names throw, listing regions and groups. Then filter out `exclude` labels (default `DEFAULT_EXCLUDED_LABELS`: vulgar, offensive, derogatory, archaic, obsolete, dated, historical, rare, abbreviation) and hits outside the wanted regions; sort by `primary` → tagged for the requested region → label penalty (mild register labels 1, others 2) → `senses` (more = more common) → `senseIndex`; one hit per word; `limit` (10). Unknown region throws.

## Known limitations / tuning notes

- No frequency data; `senses` is a proxy and sometimes wrong (e.g. "wait" ranks rare *dàng* first; "mother" ranks *mẫu* above *mẹ*).
- Region-tagged words rank above untagged ones when a region is given, so region searches surface regional/kinship words first ("I", Southern → con, tao, ngộ, tui before tôi). Intentional for dialect learning, but not "most common first".
- Capitalized duplicates (Mẹ/mẹ) appear as separate words.
- Glosses with no plain term ("thank you" is glossed "to thank") or grammar words ("the") return nothing.
- The real-data tests assert specific results (vi: hông, lợn/heo, chừ, má; es: coche/carro, ordenador/computadora, vos, pochoclo, no inflected forms) and may need updating after a Kaikki refresh if Wiktionary changes. Real-data suites skip when that language isn't built.
- Spanish: "guagua" appears for Spain because Canary Islands counts as Spain. Correct, but it's a regional word within Spain.

## Publishing (not yet done as of 2026-09-27)

Rebuild each language with `--refresh`, `npm test`, then publish each data package (`npm publish -w language-dialects-library-es`, `-vi`) and the API (`npm publish -w language-dialects-library`). Needs `npm login`. `language-dialects-library-es` was also free on npm on 2026-09-27 (checked when adding Spanish). Unscoped names were free on npm on 2026-09-27. Data-only updates: bump the data package's patch version within `DATA_VERSION`'s range.

## Working conventions

- Keep code MIT and data CC BY-SA; keep attribution in READMEs and `packages/<lang>/LICENSE`.
- `npm test` and `npm run typecheck` clean before committing.
- Never commit generated data or `.cache/`.
- Update this file after major changes.
