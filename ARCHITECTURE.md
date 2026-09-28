# which-dialect — Architecture & Context

Reference for future sessions/agents. Read this before changing the repo. The user-facing overview is `README.md`.

## What this is and why

An open-source library for looking up words by **region or dialect**, across many languages (e.g. Spanish *coche* in Spain vs. *carro* in Mexico; Vietnamese *lợn* in the North vs. *heo* in the South). Languages so far: **Vietnamese** (`vi`), **Spanish** (`es`) and **English** (`en`), all added 2026-09-27. The main feature is `createTranslator`: **any language → any language, any dialect → any dialect** (including dialect → dialect across languages, e.g. Mexican Spanish → Southern Vietnamese), translating **meaning by meaning** with the correct part of speech and definition (owner's requests, 2026-09-27).

Renamed twice on 2026-09-27, both before anything was published: `language-dialects-library` → `which-dialect-tool` → **`which-dialect`** (owner's choices). npm packages `which-dialect` (API) and `which-dialect-<lang>` (data); GitHub `nguyen18/which-dialect` (GitHub redirects both old URLs); local folder `~/dev/which-dialect`.

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
packages/core/               npm "which-dialect": the API (src/index.ts), shared types (src/types.ts),
                             parts of speech (src/pos.ts), translator (src/translate.ts)
packages/core/test/          node:test tests (fake-data ranking tests + real-data checks when built)
packages/<lang>/             npm "which-dialect-<lang>": data/ (generated), LICENSE (CC BY-SA 4.0 text), README
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
- **Sharding:** `shardKey(term, length = 2)` = first `length` letters (English uses 3, recorded as `meta.shardLength`; omitted means 2), lowercased, diacritics stripped (so ñ → n), đ → d, non a–z → `_` (`không` → `kh`, `ở` → `o_`, `ñame` → `na`). Latin-script only: non-Latin languages would all land in `__` and need a script-aware key (a format change → `DATA_VERSION` bump). Two letters (not one) keep files small: typical en shard ≈ 13 kB gzipped, largest ≈ 51 kB (one-letter shards were up to 163 kB). The same function is used to write and read, so **changing it requires a data rebuild and a `DATA_VERSION` bump**.

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

### Large-language trimming (English)

`LanguageConfig` options added for English (1.49M entries, 3.3 GB): `dropTechnical` (drop entries whose every sense has a Wiktionary `topics` field), `formOfPos` (keep inflection senses only for these POS), `keepFormOf(form, lemma, pos)` (English: drop regular forms via `isRegularForm` in `languages/en.ts`; y→i only after a consonant so *said*/*paid* stay), `dropLabels` (obsolete, archaic), `maxSensesPerEntry` (unset for English: no cap, owner's request), `maxGlossLength` (140), `englishIndex: 'regional'` (en/ index of region-tagged senses only, for US ↔ UK etc.), `shardLength: 3`, plus `keepWord` ≤ 2 words and `skipPos` (name, symbol, proverb, …). English regions: 15 countries/areas with groups (North America, British Isles, Oceania, South Asia, Southeast Asia, Africa, Commonwealth); local varieties map to their country. Build of 2026-09-27 (Kaikki file dated 2026-09-25): 594,544 entries, 751,515 senses, 35,393 region-tagged (4.7%), 92.5 MB across 9,598 files, npm tarball 20 MB; largest shard ≈184 kB gzipped; ~25 s, ~1.4 GB memory.

## API (`packages/core/src/index.ts`)

`createDictionary({ lang, baseUrl?, load? })` → `{ meta, lookup, searchEnglish }`.
- Default loader: `fetch` from `dataUrl(lang)` = `https://cdn.jsdelivr.net/npm/which-dialect-<lang>@<DATA_VERSION>/data`. `DATA_VERSION` is a jsDelivr range (`'0.1'`).
- Every file loads at most once per dictionary (promise cache); failed loads are evicted for retry. Shards not listed in `meta.shards` aren't requested (no 404s).
- `searchEnglish`: optional `pos` filter (exact POS codes). `region` may be a region or a `regionGroups` name (a group = any of its regions); unknown names throw, listing regions and groups. Then filter out `exclude` labels (default `DEFAULT_EXCLUDED_LABELS`: vulgar, offensive, derogatory, archaic, obsolete, dated, historical, rare, abbreviation) and hits outside the wanted regions; sort by `primary` → tagged for the requested region → label penalty (mild register labels 1, others 2) → `senses` (more = more common) → `senseIndex`; one hit per word; `limit` (10). Unknown region throws.

## Parts of speech (`src/pos.ts`)

`POS_NAMES` (code → readable name + one-line learner explanation), `posName()`, and `COMPATIBLE_POS`/`compatiblePos()`: which target POS can translate a POS from any language (including Vietnamese particle/classifier) (verb → verb/particle/phrase, adj → adj/verb, …), because languages don't align one to one.

## Translator (`src/translate.ts`)

`createTranslator({ dictionary?, baseUrl?(lang), load?(lang) })` → `{ senses(word, { from, fromRegion?, pos? }), translate(word, { from, to, fromRegion?, toRegion?, pos?, meaning?, exclude?, limit? }) }`. Dictionaries are created per language on demand and cached. translate.ts imports from index.ts and index.ts re-exports it at the end (circular import is fine: only used at call time).

**English is the bridge:** every language's glosses are English, so any pair works through them.

1. **Source senses** (`collectSenses`): lookup (+ lowercase); for English (`BASE_FORMS.en = regularBaseForms`) also the regular-form base word with the most senses (*running* → *run*, not *runn*), read after the word's own entries. Variant senses whose first gloss contains "of"/"for" are followed (≤ 2 hops, recording `via`), preferring the same POS; a **region-tagged variant passes its region to the senses it leads to** (*hông* → *không*'s senses, but Southern). Deduped by lemma+pos+first gloss. `fromRegion` (region or group via `resolveRegion`) and `pos` filter them.
2. **Bridge terms** per sense: English source → the lemma first, then `glossTerms` of its first 2 glosses, then its synonyms; other sources → `glossTerms` of the glosses. Max 8.
3. **Candidates:**
   - Non-English target: `searchEnglish(term, { region: toRegion, pos: compatiblePos(source.pos) })`.
   - English target (`englishCandidates`): the term itself if the English dictionary has it with a compatible POS and a sense used in `toRegion`, plus `searchEnglish` on the English **regional** index when `toRegion` is given.
   - Same language (`to === from`): the source sense's **synonyms**, each looked up for its best-fitting sense (prefers a sense that lists the source back, then definition overlap) and kept if used in `toRegion`. Scored from 5 (+3 if tagged for `toRegion`), ahead of English-bridged words. Then a **reverse check**: top-10 candidates whose senses list the source word as a synonym get +4 (*dạ* lists *vâng*).
   - Nothing matched a whole term: the last word of multi-word terms, scored low ("fresh ear of corn" → *corn*).
4. **Scoring** a bridged hit: 3 × definition overlap (content words of the source glosses + `meaning`, minus the term's own words) + term position (2/1/0) + `primary` (1) + tagged for `toRegion` (2) + same POS (0.5) + min(senses, 10) × 0.05 − min(senseIndex, 4) × 0.4 (a word whose main meaning isn't the match: *borona* is mostly "millet") + `registerFit` (polite↔polite / casual↔casual +1, mismatch −2) − 0.5 per slang/literary/… label − rank × 0.1. Best score per word; `limit` per sense. When `to === from` and `toRegion` is set, the source word itself only counts if tagged for the target region.
5. **`allSenses: true`** returns every sense, including ones with no translation (empty `translations`) and ones whose translations repeat another's; used by Language Helper to let users pick any meaning. Default false (the dedupe below applies).
6. **Sense order:** `meaning` overlap × 10, +3 if tagged for `fromRegion`, −1 if all its labels are informal/slang/…, then dictionary order. **Translation scores are deliberately not used to order senses:** tried 2026-09-27 and definition overlap inflated minor senses (*coche* "carriage, coach", *chờ* "letter Ch"). A "main POS = most senses" rule was also tried and reverted (Wiktionary gives *dog* the verb and *bố* the pronoun more senses). Senses whose top-3 translations repeat an earlier sense's are dropped.

**Examples** (added 2026-09-27): `Sense.examples` (`{ text, translation? }`), up to `maxExamples` (2; English 1) per sense, ≤ 160 characters, everyday "example" type before quotations and translated ones first. ~18% of Vietnamese senses have one. Translations get `examples` from their matched sense (looked up for the final `limit` hits only). English `maxSensesPerEntry` raised 6 → 14 (common words list everyday informal senses late: *cool* "fashionable" is sense 9 of 13), then removed entirely at the owner's request; together +4.4 MB. English data is now 130.7 MB (npm tarball 33 MB) (jsDelivr's npm package limit is ~150 MB, so watch it). Region bonus is +2 only when the hit is `primary`, else +0.5 (*bá cháy* is Southern for "awesome", so it shouldn't win *cool* "low temperature").

**Synonyms** (added to the data 2026-09-27): `Sense.synonyms` from Kaikki sense-level `synonyms` (entry-level ones without a sense go to the first sense), max 8. They're Wiktionary's dialect equivalents (vi *ngô* → *bắp*, *lợn* → *heo*; es *coche* → *carro*, *zumo* → *jugo*; en *lift* ↔ *elevator*). ~10% of Vietnamese senses have them. Sizes after: vi 12.5 MB, es 39.5 MB, en 104.3 MB (en also has the regional index: `englishIndex: 'regional'`, 26,909 terms).

**Noise fixes (2026-09-27, found generating Language Helper's Cheatsheet):** `glossTerms` drops "etc" (it matched every gloss containing "etc": *there* → nhiệt); senses reached through a spelling variant of a different word (`SPELLING_VIA`: pronunciation spelling, misspelling, …) rank −2 when the word has its own senses (*yeah* ≠ "year"); English bridge terms add the regular base form after the lemma (*thanks* → *thank*); English synonyms are bridge terms only if plain English and score −1 (*thanks* ↛ "cheers" → *dzô*); translations below `MIN_SCORE` (1) are dropped as noise.

**Translation tables (added 2026-09-27, the owner asked to boost "the word most commonly used for that word in the proper context"):** English Wiktionary lists, per English sense, the usual translation in each language, often with region/register tags. The English build keeps them (`translationLangs: ['vi', 'es']` in `languages/en.ts`; `Sense.translations: Record<lang, { word, tags? }[]>`, max 12 per language, parenthesized notes stripped, "various" placeholders dropped, only place tags (capitalized) and register tags kept). Coverage: 60,520 English senses have a Spanish table, 13,301 a Vietnamese one. English data is now **139.8 MB — close to jsDelivr's ~150 MB package limit**; trim (e.g. English examples) before adding more languages' tables. In the translator, `tableFor()` gets the table for a source sense: English senses carry it; for other sources, the English sense (from the first 3 bridge terms) whose `translations[from]` lists the source lemma is the same meaning, and its `translations[to]` applies (into English, that English word itself). Each table word gets `TABLE_BONUS` (+4), `TABLE_REGION_BONUS` (+1.5) when its tags name a target region/group, −`TABLE_OTHER_REGION_PENALTY` (2) when they name only other regions. Table words the index missed are added via `tableHit()` (compatible POS first, else any POS: *thanks* (intj) → *cám ơn* (verb)), starting at 3 + commonness + register fit. Results: correct word **first** went 63/76 → 68/76 on the tuning set (held-out unchanged at 25/30; top-3 unchanged); spot checks: car → Mexico *carro*, → Argentina *auto*; computer → *máy tính*; thanks → *cám ơn*; es *coche* → vi *xe hơi*. The evaluation now reports top-1 as well as top-3. Tables don't help "you" → Vietnamese (the table says "various"); that needs relationship context. Common words' main senses sometimes have no table in the data (e.g. *pig*), so *cerdo* still fails without `pos`.

**Word frequencies (added 2026-09-27, owner's choice of "option 1" for more context-accurate ranking):** `scripts/frequency.ts` loads **wordfreq** lists (`languages/*.ts` `wordfreq`: vi `small` — wordfreq has no large Vietnamese list; es/en `large`), downloaded to `.cache/wordfreq-<list>_<lang>.msgpack.gz` and decoded with `@msgpack/msgpack` (cBpack: header, then buckets; bucket *i* = frequency 10^(−i/100), Zipf = 9 − i/100). Each entry gets `frequency` (Zipf, one decimal); multi-word terms combine parts as 1/f = Σ 1/fᵢ, minus one Zipf point per extra token (Vietnamese lists are syllables, and *cô nương* otherwise looked as common as *cô*). Hits carry the word's `frequency`; `meta.frequencySource` holds the credit. Coverage: vi 31,981/35,394 entries, es 84,088/123,995, en 253,705/594,544. Sizes: vi 15.5 MB, es 44.5 MB, en 135.3 MB.
- **Licensing:** wordfreq's data is CC BY-SA 4.0, and its author asks that it not be converted to formats that drop attribution. We store only one score per word already in our dictionaries, and credit wordfreq and its sources (Google Books Ngrams, Leeds Internet Corpus, Wikipedia, ParaCrawl, OpenSubtitles, SUBTLEX by Brysbaert et al. — "freely available data" — and Twitter statistics) in every README and in meta.json. Keep those credits.
- **Ranking:** `commonness()` = (Zipf − 3.5) × `FREQUENCY_WEIGHT` (1.2); words missing from a language's list count as Zipf 2.5; languages without frequency data keep the old min(senses, 10) × 0.05. The secondary-sense penalty drops from 0.4 to 0.15 per index with frequency data (kinship words list "you" after "I/me"). `searchEnglish` sorts by frequency before sense count.
- **Frequency is per word, not per meaning**, so a common word's slang sense could win a neutral meaning (*cool* the temperature → *chất*, common because it also means "substance"). Fix: `registerFit` now also gives a **neutral** source sense −1.5 against a casual (informal/colloquial/slang/…) target, so *cool* (temperature) → *mát* again and plain "you" demotes blunt *mày*. Polite↔polite / casual↔casual +1 and mismatches −2 are unchanged.
- `meaning` is also matched against each group's top translation's gloss (×5, vs ×10 for the source's own glosses), for targets whose definitions use different words than the source's. It's still word overlap, not semantics: English defines *cool* = "Fashionable; trendy; hip." and Spanish defines *guay* only as "cool", so `meaning: 'awesome'` can't reach it. The evaluation case "cool [awesome great] → Spain guay" had passed by luck (slang *guay* was winning inside the temperature sense) and now uses `meaning: 'fashionable'`.
- **The region bonus is deliberately not scaled by frequency.** Tried and reverted: wordfreq is worldwide, so regional words (Cuban *guagua*) look rare and lost to general words (*autobús*).
- **Effect:** evaluation unchanged (tuning 73/75, held-out 29/30). English "you" → Vietnamese: *anh* moved from 20th to 8th and *chị* from 11th to 14th; the top is now everyday *bạn*, *con*, *mày*, *ông*, but niche Southern-tagged *út*/*tía* still rank above *anh*. Picking the right pronoun needs relationship context (older/younger, male/female, family), the planned next step ("option 2"). Two unit tests were loosened: frequency legitimately reorders equally correct words (Mexico *auto* before *carro*; *chất* before *ngầu* for cool = awesome).

## Evaluation (`scripts/evaluate.ts`, `npm run evaluate`)

Known-correct cases; pass = a correct word in the top 3 of the first (most relevant) sense group. `CASES` (tuning set, 75) was used while developing; `HOLDOUT` (30) was written afterwards and **must not be tuned against** (add new holdout cases instead if it gets used). Results 2026-09-27: tuning **73/75 (97%)**, held-out **29/30 (97%)**. Failures: *cerdo* without `pos` (es lists the adjective "dirty" first; with `pos: 'noun'` → heo) and held-out *bát* (vi N→S gives *mai*, not *chén*). Note: held-out *sleep* started passing after a general bug fix ("etc" was being used as a search term), which was found while generating Language Helper's Cheatsheet, not by looking at *sleep*; still, the held-out set is no longer perfectly clean, so add fresh cases before relying on it again. Progression while tuning: 91% → 93% (synonyms, secondary-sense penalty) → 95% (dictionary order restored) → 97% (reverse synonyms, phrase heads). Unit tests (`npm test`, 24) include translator checks on real data when en, es and vi are built.

## Known limitations / tuning notes

- Without `pos`/`meaning`, the first sense follows the dictionary's order, which isn't frequency (e.g. *just* the adjective "fair" before the adverb; *cerdo* "dirty" before "pig"). Callers should pass context.
- Non-English → non-English goes through English definitions, so distinctions English doesn't make can be lost.
- Grammar words defined by function ("marks the future tense" for *sẽ*) aren't reachable from English *will*; *will* → *biết*. *gonna*, *would*, *wanna*, *didnt* still return nothing.

- No frequency data; `senses` is a proxy and sometimes wrong (e.g. "wait" ranks rare *dàng* first; "mother" ranks *mẫu* above *mẹ*).
- Region-tagged words rank above untagged ones when a region is given, so region searches surface regional/kinship words first ("I", Southern → con, tao, ngộ, tui before tôi). Intentional for dialect learning, but not "most common first".
- Capitalized duplicates (Mẹ/mẹ) appear as separate words.
- Glosses with no plain term ("thank you" is glossed "to thank") or grammar words ("the") return nothing.
- The real-data tests assert specific results (vi: hông, lợn/heo, chừ, má; es: coche/carro, ordenador/computadora, vos, pochoclo, no inflected forms) and may need updating after a Kaikki refresh if Wiktionary changes. Real-data suites skip when that language isn't built.
- Spanish: "guagua" appears for Spain because Canary Islands counts as Spain. Correct, but it's a regional word within Spain.

## Publishing (not yet done as of 2026-09-27)

Rebuild each language with `--refresh`, `npm test`, then publish each data package (`npm publish -w which-dialect-en`, `-es`, `-vi`) and the API (`npm publish -w which-dialect`). Needs `npm login`. `which-dialect-es` and `-en` were also free on npm on 2026-09-27. Unscoped names were free on npm on 2026-09-27. Data-only updates: bump the data package's patch version within `DATA_VERSION`'s range.

## Working conventions

- Keep code MIT and data CC BY-SA; keep attribution in READMEs and `packages/<lang>/LICENSE`.
- `npm test` and `npm run typecheck` clean before committing.
- Never commit generated data or `.cache/`.
- Update this file after major changes.
