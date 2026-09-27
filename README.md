# language-dialects-library

Look up words across a language's **regional dialects**, like Northern, Central and Southern Vietnamese, with data from [Wiktionary](https://en.wiktionary.org/) (via [Kaikki.org](https://kaikki.org/)).

```ts
import { createDictionary } from 'language-dialects-library'

const vi = createDictionary({ lang: 'vi' })

await vi.searchEnglish('pig', { region: 'Southern' }) // heo (tagged Southern), …
await vi.searchEnglish('pig', { region: 'Northern' }) // lợn (tagged Northern), …
await vi.searchEnglish('not', { region: 'Southern' }) // hông, hổng (Southern forms of không), không, …
await vi.lookup('má') // "cheek" everywhere; "mother; mom" in the South
```

You install one small package (about 5 kB). Dictionary data is **not bundled**: each lookup fetches one small file (usually 5–50 kB compressed) from the language's data package on the jsDelivr CDN, and caches it.

## Languages

| Language | Data package | Regions | Entries | Region-tagged senses |
|---|---|---|---|---|
| Vietnamese (`vi`) | [`language-dialects-library-vi`](packages/vi) | Northern, Central, Southern | 35,394 | 1,330 of 42,419 |

The repo is built to hold many languages: each one is a config file in [`languages/`](languages) plus a data package in `packages/<lang>`.

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

- `region`: only words used there. Words the source tags for that region rank first.
- `exclude`: labels to leave out. By default vulgar, offensive, derogatory, archaic, obsolete, dated, historical, rare and abbreviation words are excluded; pass `[]` to include everything.
- `limit`: maximum results (default 10).

Ranking, in order: the term is the gloss's main meaning → tagged for the requested region → plain word (no slang/literary labels) → common word (more senses in the dictionary) → earlier sense.

### `dictionary.lookup(word)`

All entries for a word in the language, with every sense's glosses, regions and labels.

### `dictionary.meta()`

The language's name, regions, source, license, build date and counts.

## How regions work

Wiktionary tags some senses with a region, e.g. *heo* "pig" is tagged Central and Southern Vietnamese. **Senses with no region tag are treated as used in every region**, and marked `regionTagged: false` so you can tell a confirmed regional word from an assumed one.

Regions are per **sense**, not per word: *má* means "cheek" everywhere, but "mother" only in the South.

Variants that point at a standard word (Wiktionary: "Southern Vietnam form of *không*") are searchable by the standard word's meanings, so "not" finds *hông*.

## Limitations

This is a suggestion tool, not a curated translation dictionary. Check results before teaching them.

- **Few region tags.** Only about 3% of Vietnamese senses carry a region; everything else is assumed to be everywhere, including some words that are really old-fashioned or local.
- **No word frequencies.** The source doesn't say how common a word is. Ranking uses the number of senses as a rough stand-in, so an obscure word can occasionally outrank an everyday one.
- **English search matches Wiktionary's wording.** It finds terms that appear in glosses ("wait", "not", "mother"), not paraphrases. Grammar words with no equivalent (like "the") return nothing.

## License and attribution

- **Code** (this repo, and the `language-dialects-library` package): [MIT](LICENSE).
- **Data** (the `language-dialects-library-<lang>` packages): derived from Wiktionary via Kaikki.org's [wiktextract](https://github.com/tatuylonen/wiktextract) extraction, modified (filtered and reshaped) by this project, and licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

If your app **shows** this data, credit it where users can see it, for example:

> Translations from [Wiktionary](https://en.wiktionary.org/), [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), via language-dialects-library.

If you **redistribute modified data**, it has to stay under CC BY-SA 4.0. Using the API in your app doesn't change your app's own license. This project isn't affiliated with or endorsed by Wikimedia or Kaikki.org.

## Development

Requires Node 22.6+ (TypeScript scripts run with `--experimental-strip-types`).

```sh
npm install
npm run build:data -- vi   # download Kaikki's Vietnamese file (cached in .cache/) and build packages/vi/data
npm run build:data -- vi --refresh   # re-download first
npm test                   # unit tests, plus checks against the built data
npm run typecheck
npm run build              # compile the API to packages/core/dist
```

Generated data isn't committed (it would bloat git history); it's built before publishing.

### Adding a language

1. Add `languages/<code>.ts` with the Kaikki language name, the language's regions, and how to read regions from Wiktionary's tags (see [`languages/vi.ts`](languages/vi.ts)).
2. Copy `packages/vi` to `packages/<code>` and update its `package.json` and `README.md`.
3. `npm run build:data -- <code>`, check the results, and publish.

### Publishing

```sh
npm run build:data -- vi --refresh && npm test
npm publish -w language-dialects-library-vi
npm publish -w language-dialects-library
```

The API loads data versions matching `DATA_VERSION` in `packages/core/src/index.ts` (currently `0.1`). Data-only updates can publish new 0.1.x data versions without touching the API; bump `DATA_VERSION` when the data format changes.
