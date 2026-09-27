# language-dialects-library

Find how people say things **in different regions and dialects** of a language: *coche* in Spain but *carro* in Mexico, *lợn* in Northern Vietnam but *heo* in the South. One small package covers every language in this repo, with dictionary data from [Wiktionary](https://en.wiktionary.org/) (via [Kaikki.org](https://kaikki.org/)) loaded only when you need it.

```ts
import { createDictionary } from 'language-dialects-library'

const es = createDictionary({ lang: 'es' })
await es.searchEnglish('car', { region: 'Spain' })              // coche, …
await es.searchEnglish('car', { region: 'Mexico' })             // carro, auto, …
await es.searchEnglish('computer', { region: 'Latin America' }) // computadora, computador, …

const vi = createDictionary({ lang: 'vi' })
await vi.searchEnglish('pig', { region: 'Southern' })           // heo, …
await vi.searchEnglish('not', { region: 'Southern' })           // hông, hổng (Southern forms of không), không, …
await vi.lookup('má') // "cheek" everywhere; "mother; mom" in the South
```

You install one small package (about 5 kB). Dictionary data is **not bundled**: each lookup fetches one small file (usually 5–100 kB compressed) from the language's data package on the jsDelivr CDN, and caches it.

## Languages

| Language | Code | Data package | Regions | Entries | Region-tagged senses |
|---|---|---|---|---|---|
| Spanish | `es` | [`language-dialects-library-es`](packages/es) | 23 countries, plus groups: Latin America, Central America, Caribbean, South America, Río de la Plata | 123,995 | 11,940 of 153,963 (7.8%) |
| Vietnamese | `vi` | [`language-dialects-library-vi`](packages/vi) | Northern, Central, Southern | 35,394 | 1,330 of 42,419 (3.1%) |

More languages are planned. Each one is a config file in [`languages/`](languages) plus a data package in `packages/<code>`; see [Adding a language](#adding-a-language).

## Install

```sh
npm install language-dialects-library
```

Works in browsers and in Node 18+ (anywhere with `fetch`).

## API

### `createDictionary({ lang, baseUrl?, load? })`

- `lang`: a language code from the table above.
- `baseUrl`: where the data folder is served. Defaults to `https://cdn.jsdelivr.net/npm/language-dialects-library-<lang>@0.1/data`. Point it at your own copy to self-host.
- `load`: a custom loader `(path) => Promise<json>`, e.g. to read files from disk in Node. Overrides `baseUrl`.

### `dictionary.searchEnglish(term, { region?, exclude?, limit? })`

Ways to say an English word or short phrase, best first, one result per word. Each result (`Hit`) has the `word`, `pos` (part of speech), the `gloss` it came from, `regions`, `regionTagged`, usage `labels`, and `altOf` when it's a variant of another word.

- `region`: only words used there. Use a region (`'Mexico'`, `'Southern'`) or a group (`'Latin America'`); `meta()` lists both. Words the source tags for that region rank first.
- `exclude`: labels to leave out. By default vulgar, offensive, derogatory, archaic, obsolete, dated, historical, rare and abbreviation words are excluded; pass `[]` to include everything.
- `limit`: maximum results (default 10).

Ranking, in order: the term is the gloss's main meaning → tagged for the requested region → plain word (no slang/literary labels) → common word (more senses in the dictionary) → earlier sense.

### `dictionary.lookup(word)`

All entries for a word in the language, with every sense's glosses, regions and labels.

### `dictionary.meta()`

The language's name, regions, region groups, source, license, build date and counts.

## How regions work

Each language defines its regions: dialect areas for Vietnamese, countries for Spanish. Wiktionary tags some senses with a region; for example Spanish *guagua* "bus" is tagged Caribbean and Canary Islands. **Senses with no region tag are treated as used in every region**, and marked `regionTagged: false`, so you can tell a confirmed regional word from an assumed one.

- **Per sense, not per word:** Vietnamese *má* means "cheek" everywhere, but "mother" only in the South.
- **Groups:** a language can define groups of regions. Wiktionary's group tags (Spanish "Latin America", "Rioplatense") count for every region in the group, and you can search a group as a whole.
- **Variants:** words recorded as a variant of another ("Southern Vietnam form of *không*") are found by the other word's meanings, so "not" finds *hông*.

## Limitations

This is a suggestion tool, not a curated translation dictionary. Check results before teaching them.

- **Few region tags.** Most senses carry no region (see the table), so they're assumed to be used everywhere, including some words that are really old-fashioned or local.
- **No word frequencies.** The source doesn't say how common a word is. Ranking uses the number of senses as a rough stand-in, so an obscure word can occasionally outrank an everyday one.
- **English search matches Wiktionary's wording.** It finds terms that appear in glosses ("car", "wait", "mother"), not paraphrases. Grammar words with no equivalent (like "the" in Vietnamese) return nothing.
- **Base words only for Spanish.** Conjugations and plurals are left out; look up *hablar*, not *hablamos*.

## License and attribution

- **Code** (this repo, and the `language-dialects-library` package): [MIT](LICENSE).
- **Data** (the `language-dialects-library-<code>` packages): derived from Wiktionary via Kaikki.org's [wiktextract](https://github.com/tatuylonen/wiktextract) extraction, modified (filtered and reshaped) by this project, and licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

If your app **shows** this data, credit it where users can see it, for example:

> Translations from [Wiktionary](https://en.wiktionary.org/), [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), via language-dialects-library.

If you **redistribute modified data**, it has to stay under CC BY-SA 4.0. Using the API in your app doesn't change your app's own license. This project isn't affiliated with or endorsed by Wikimedia or Kaikki.org.

## Development

Requires Node 22.6+ (TypeScript scripts run with `--experimental-strip-types`).

```sh
npm install
npm run build:data -- es             # download Kaikki's file for a language (cached in .cache/) and build packages/<code>/data
npm run build:data -- es --refresh   # re-download first
npm test                             # unit tests, plus checks against whichever languages are built
npm run typecheck
npm run build                        # compile the API to packages/core/dist
```

Generated data isn't committed (it would bloat git history); it's built before publishing. Spanish downloads about 1 GB; the build takes seconds and about 550 MB of memory.

### Adding a language

1. Add `languages/<code>.ts`: the Kaikki language name, the language's regions (and groups, if any), and how to read regions from Wiktionary's tags. See [`languages/vi.ts`](languages/vi.ts) (dialect areas) and [`languages/es.ts`](languages/es.ts) (countries and groups). Set `skipFormOf` for heavily inflected languages.
2. Copy a data package (`packages/es`) to `packages/<code>` and update its `package.json` and `README.md`.
3. `npm run build:data -- <code>`, check the results, add a few real-data tests, and publish.

Languages in non-Latin scripts (Chinese, Arabic, Russian, …) will need a script-aware version of `shardKey` first: today files are split by the first two Latin letters.

### Publishing

```sh
npm run build:data -- es --refresh && npm run build:data -- vi --refresh && npm test
npm publish -w language-dialects-library-es
npm publish -w language-dialects-library-vi
npm publish -w language-dialects-library
```

The API loads data versions matching `DATA_VERSION` in `packages/core/src/index.ts` (currently `0.1`). Data-only updates can publish new 0.1.x data versions without touching the API; bump `DATA_VERSION` when the data format changes.
