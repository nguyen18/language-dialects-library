# language-dialects-library — Architecture & Context

Reference for future sessions/agents. Read this before changing the repo. The user-facing overview is `README.md`.

## What this is and why

An open-source library for looking up words by **regional dialect** (e.g. Southern Vietnamese *heo* vs. Northern *lợn* for "pig"). It started as a data source for **Language Helper** (`~/dev/Language-Helper`), which teaches a language by building on how the learner already talks and targets Southern Vietnamese first. The owner (GitHub `nguyen18`) wants this one repo to eventually hold **many languages** behind a single import.

Decisions (2026-09-27, with the owner):
- **Source:** Kaikki.org's JSONL extraction of English Wiktionary (wiktextract). Chosen over the Free Vietnamese Dictionary Project (no dialect tags) and research corpora (sentences, not dictionaries).
- **Region rule (owner's):** senses with no region tag count as used in **every** region. We also keep `regionTagged` so apps can tell confirmed from assumed; the owner agreed.
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

- `data/meta.json`: `LanguageMeta`: lang, name, regions, source (URL, retrieved, Last-Modified), license, counts, and `shards` (which files exist).
- `data/words/<xx>.json`: `WordShard`, headword → `Entry[]` (`{ word, pos, senses: Sense[] }`).
- `data/en/<xx>.json`: `EnglishShard`, normalized English term → `Hit[]`.
- `Sense`: `glosses`, `regions`, `regionTagged`, `labels`, optional `altOf`.
- `Hit`: word, pos, gloss, regions, regionTagged, labels, altOf, `senseIndex`, `senses` (the word's total sense count), `primary`.
- **Sharding:** `shardKey()` = first two letters, lowercased, diacritics stripped, đ → d, non a–z → `_` (`không` → `kh`, `ở` → `o_`). Two letters (not one) keep files small: typical en shard ≈ 13 kB gzipped, largest ≈ 51 kB (one-letter shards were up to 163 kB). The same function is used to write and read, so **changing it requires a data rebuild and a `DATA_VERSION` bump**.

## Build pipeline (`scripts/build-language.ts`)

1. Download `https://kaikki.org/dictionary/<Name>/kaikki.org-dictionary-<Name>.jsonl` to `.cache/kaikki-<lang>.jsonl` (+ `.info.json` with Last-Modified). Cached; `--refresh` re-downloads.
2. Per entry: skip `config.skipPos` and words failing `config.keepWord`. Per sense: skip empty glosses; regions from `config.regionsFromTags(tags, raw_tags)`, else all regions with `regionTagged: false`; labels = tags in the `LABELS` allowlist; `altOf` from `alt_of`/`form_of`.
3. English index: terms come from glosses via `termsOf()`: drop `(...)` notes and quotes; if there's a colon, use only the text after the last one ("Negates …: not"); split on `; , /`; normalize (`normalizeEnglish`: lowercase, drop leading to/a/an/the); keep ≤ 4 words of plain letters; also index the bare verb without a trailing particle ("wait for" → "wait"), sharing its position. `primary` = the term is the gloss's first meaning.
4. Variant senses (`altOf`) are indexed under the **target word's** non-variant glosses, preferring the same part of speech (pronoun *tui* → pronoun senses of *tôi*, not its noun "servant").
5. `pos: 'name'` entries are kept in words/ but not in the English index.
6. Writes shards + meta, prints counts and total size.

Vietnamese (`languages/vi.ts`): regions Northern/Central/Southern. Tags `Southern`/`Central`/`Northern`; `Central`+`North` = North Central → Central; free-text raw tags mentioning Vietnam/dialect are parsed too. Skips `character`/`romanization` POS and headwords without Latin letters (chữ Hán). Build of 2026-09-27 (Kaikki file dated 2026-09-25): 35,394 entries, 42,419 senses, 1,330 region-tagged (≈3%), ≈29k English terms, ≈19.6 MB raw / 2.6 MB npm tarball across ~617 files.

## API (`packages/core/src/index.ts`)

`createDictionary({ lang, baseUrl?, load? })` → `{ meta, lookup, searchEnglish }`.
- Default loader: `fetch` from `dataUrl(lang)` = `https://cdn.jsdelivr.net/npm/language-dialects-library-<lang>@<DATA_VERSION>/data`. `DATA_VERSION` is a jsDelivr range (`'0.1'`).
- Every file loads at most once per dictionary (promise cache); failed loads are evicted for retry. Shards not listed in `meta.shards` aren't requested (no 404s).
- `searchEnglish`: filter out `exclude` labels (default `DEFAULT_EXCLUDED_LABELS`: vulgar, offensive, derogatory, archaic, obsolete, dated, historical, rare, abbreviation) and other regions; sort by `primary` → tagged for the requested region → label penalty (mild register labels 1, others 2) → `senses` (more = more common) → `senseIndex`; one hit per word; `limit` (10). Unknown region throws.

## Known limitations / tuning notes

- No frequency data; `senses` is a proxy and sometimes wrong (e.g. "wait" ranks rare *dàng* first; "mother" ranks *mẫu* above *mẹ*).
- Region-tagged words rank above untagged ones when a region is given, so region searches surface regional/kinship words first ("I", Southern → con, tao, ngộ, tui before tôi). Intentional for dialect learning, but not "most common first".
- Capitalized duplicates (Mẹ/mẹ) appear as separate words.
- Glosses with no plain term ("thank you" is glossed "to thank") or grammar words ("the") return nothing.
- The real-data tests assert specific results (hông, lợn/heo, chừ, má) and may need updating after a Kaikki refresh if Wiktionary changes.

## Publishing (not yet done as of 2026-09-27)

`npm run build:data -- vi --refresh && npm test`, then `npm publish -w language-dialects-library-vi` and `npm publish -w language-dialects-library` (needs `npm login`). Unscoped names were free on npm on 2026-09-27. Data-only updates: bump the data package's patch version within `DATA_VERSION`'s range.

## Working conventions

- Keep code MIT and data CC BY-SA; keep attribution in READMEs and `packages/<lang>/LICENSE`.
- `npm test` and `npm run typecheck` clean before committing.
- Never commit generated data or `.cache/`.
- Update this file after major changes.
