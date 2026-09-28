# which-dialect

Translate words **between languages and between dialects**, meaning by meaning: Mexican Spanish *chido* into Southern Vietnamese, Northern Vietnamese *ngô* into Southern *bắp*, Spain's *coche* into Mexico's *carro*, US *truck* into UK *lorry*. Dictionary data comes from [Wiktionary](https://en.wiktionary.org/) (via [Kaikki.org](https://kaikki.org/)) and loads only when you need it.

```ts
import { createTranslator } from 'which-dialect'

const tr = createTranslator()

await tr.translate('chido', { from: 'es', fromRegion: 'Mexico', to: 'vi', toRegion: 'Southern' }) // bá cháy, chất, khét, ngầu
await tr.translate('ngô', { from: 'vi', fromRegion: 'Northern', to: 'vi', toRegion: 'Southern' }) // bắp
await tr.translate('coche', { from: 'es', fromRegion: 'Spain', to: 'es', toRegion: 'Mexico' })  // auto, carro, …
await tr.translate('truck', { from: 'en', fromRegion: 'US', to: 'en', toRegion: 'UK' })         // lorry
await tr.translate('cool', { from: 'en', to: 'vi', toRegion: 'Southern', meaning: 'awesome' })  // bá cháy, chất, khét, ngầu (not mát, "cool" the temperature)
```

Each result is a list of **groups, one per meaning** of the source word, each with its part of speech, its definitions and its translations, so a word's meanings never get mixed up.

You install one small package. Dictionary data is **not bundled**: each lookup fetches one small file (usually 5–100 kB compressed) from the language's data package on the jsDelivr CDN, and caches it.

## Languages

| Language | Code | Data package | Regions | Entries | Region-tagged senses |
|---|---|---|---|---|---|
| Spanish | `es` | [`which-dialect-es`](packages/es) | 23 countries, plus groups: Latin America, Central America, Caribbean, South America, Río de la Plata | 123,995 | 11,940 of 153,963 (7.8%) |
| Vietnamese | `vi` | [`which-dialect-vi`](packages/vi) | Northern, Central, Southern | 35,394 | 1,330 of 42,419 (3.1%) |
| English | `en` | [`which-dialect-en`](packages/en) | 15 countries/areas (US, UK, Australia, India, …), plus groups: North America, British Isles, Commonwealth, … | 594,544 | 35,393 of 751,515 (4.7%) |

Every pair of these languages can be translated in both directions, and between any of their regions, including between two dialects of one language.

More languages are planned. Each one is a config file in [`languages/`](languages) plus a data package in `packages/<code>`; see [Adding a language](#adding-a-language).

## Install

```sh
npm install which-dialect
```

Works in browsers and in Node 18+ (anywhere with `fetch`).

## Translating

### `createTranslator({ baseUrl?, load?, dictionary? })`

Loads each language's data on demand. The options are only needed to self-host the data: `baseUrl(lang)` returns where a language's data folder is served, and `load(lang)` returns a custom loader (e.g. reading from disk in Node).

### `translator.translate(word, options)`

| Option | Meaning |
|---|---|
| `from`, `to` | Language codes. They can be the same, to translate between dialects of one language. |
| `fromRegion`, `toRegion` | Region or region group, e.g. `'Mexico'`, `'Latin America'`, `'Southern'`, `'UK'`. `fromRegion` keeps only the word's senses used there; `toRegion` ranks words tagged for it first and leaves out words tagged only for other regions. |
| `pos` | Only source senses with this part of speech, e.g. `'noun'`. |
| `meaning` | A few words describing the meaning you want, e.g. `'awesome'` for *cool*. Matching senses and words rank first. |
| `exclude` | Labels to leave out (default: vulgar, offensive, derogatory, archaic, obsolete, dated, historical, rare, abbreviation). |
| `limit` | Translations per meaning (default 5). |
| `allSenses` | Return every meaning, including ones with no translation, instead of only useful ones. For letting users pick a meaning. |

It returns `TranslationGroup[]`, most relevant meaning first. Each group has:

- `source`: the meaning being translated: `lemma` (the base or standard word, e.g. *say* for *said*), `pos`, `glosses` (its English definitions), `regions`, `labels`, and `via` when the word led there ("simple past of say", "Southern Vietnam form of không").
- `translations`: target words, best first, each with its own `pos`, `gloss`, `regions`, `labels`, a `score`, and `bridge` (how it was found).

### `translator.senses(word, { from, fromRegion?, pos? })`

The meanings of a word, following forms and variant spellings: useful for letting a user pick which meaning they mean before translating.

## How translation works

Every language's data defines its words in English, so English is the bridge between any two languages. For each **meaning** of the source word:

1. **Forms and variants go to the word they belong to:** irregular forms from the data (*said* → *say*), regular English forms by rule (*walked* → *walk*, *running* → *run*), texting spellings (*dont* → *don't*), and regional variants (*hông* → *không*, keeping its Southern region).
2. **English terms carry the meaning:** the terms in its definition ("guagua": *bus*), or for English words the word itself and its synonyms.
3. **The target is searched with a compatible part of speech** (`compatiblePos`): a noun for a noun, but an English auxiliary verb may be a Vietnamese particle, and an adjective may be a verb in another language.
4. **Wiktionary's translation tables** give the usual translation of each English meaning in each language, often with region tags (*car* → Spanish *coche* [Spain], *carro* [Mexico…], *auto* [Argentina…]; *cool* "mildly low temperature" → Vietnamese *mát*). Listed words get a strong boost, more when tagged for the target region, less when tagged only for other regions. Between non-English languages, the English meaning whose table lists the source word bridges them (*coche* → *car* → *xe hơi*).
5. **Within one language, synonyms are direct equivalents.** Wiktionary lists dialect words as synonyms (*ngô* → *bắp*, *coche* → *carro*, *lift* → *elevator*), in either direction (*dạ* lists *vâng*).
6. **Ranking** favors **common words** ([word frequencies](#word-frequencies): *anh* over the niche *cô nương* for "you"), target words whose definition shares the source definition's details, whose *main* meaning is the match (*maíz* over *borona*, which mostly means millet), that are tagged for the target region, and that keep the **register**: a polite word translates to a polite word (Northern *vâng* → Southern *dạ*), slang to slang.

Meanings are ordered by `meaning` (if given), then by being tagged for `fromRegion`, then the dictionary's own order, which lists main meanings first. That order is a guess when a word has several parts of speech: Spanish *cerdo* is listed as an adjective ("dirty") before the noun ("pig"). Pass `pos` or `meaning` when you know which one you want.

### How accurate is it?

`npm run evaluate` runs known-correct translations across language pairs and dialect pairs (English → Vietnamese and Spanish by region, Spanish ↔ Vietnamese, Northern → Southern Vietnamese, Spain ↔ Mexico, US ↔ UK, into English). A case passes when a correct word is in the top 3 of the first meaning:

| Set | Correct word in top 3 | Correct word first |
|---|---|---|
| Tuning set (used while developing) | 74 / 76 (97%) | 68 / 76 (89%) |
| Held-out set (written afterwards, not tuned against) | 29 / 30 (97%) | 25 / 30 (83%) |

The held-out miss: Northern Vietnamese *bát* "bowl" (gives *mai*, not Southern *chén*).

## Looking words up

### `createDictionary({ lang, baseUrl?, load? })`

One language's dictionary. `baseUrl` defaults to `https://cdn.jsdelivr.net/npm/which-dialect-<lang>@0.1/data`.

- `dictionary.lookup(word)`: all entries for a word, with every sense's definitions, regions, labels, synonyms and variant links (`altOf`).
- `dictionary.searchEnglish(term, { region?, pos?, exclude?, limit? })`: words for an English term in this language, one per word, best first (no meaning handling: use the translator for that).
- `dictionary.meta()`: the language's name, regions, region groups, source, license, build date and counts.

## Parts of speech

Entries and results use Wiktionary's part-of-speech codes (`noun`, `verb`, `adj`, `adv`, `pron`, `det`, `prep`, `conj`, `intj`, `particle`, `classifier`, `num`, `phrase`, `contraction`, …).

- `POS_NAMES` / `posName(code)`: readable names and one-line explanations for learners (`posName('adj')` → "Adjective"; `particle`: "A small word that adds grammar or tone rather than meaning, e.g. Vietnamese đã (past)…").
- `compatiblePos(pos)`: the parts of speech that can translate one from any language.

## How regions work

Each language defines its regions: dialect areas for Vietnamese, countries for Spanish. Wiktionary tags some senses with a region; for example Spanish *guagua* "bus" is tagged Caribbean and Canary Islands. **Senses with no region tag are treated as used in every region**, and marked `regionTagged: false`, so you can tell a confirmed regional word from an assumed one.

- **Per sense, not per word:** Vietnamese *má* means "cheek" everywhere, but "mother" only in the South.
- **Groups:** a language can define groups of regions. Wiktionary's group tags (Spanish "Latin America", "Rioplatense") count for every region in the group, and you can search a group as a whole.
- **Variants:** words recorded as a variant of another ("Southern Vietnam form of *không*") are found by the other word's meanings, so "not" finds *hông*, and keep their region when translated.

## Limitations

This is a suggestion tool, not a curated translation dictionary. Check results before teaching them.

- **Few region tags.** Most senses carry no region (see the table), so they're assumed to be used everywhere, including some words that are really old-fashioned or local.
- **No word frequencies.** The source doesn't say how common a word or meaning is. Without `pos`/`meaning`, the first meaning follows the dictionary's order, which isn't always the most common one.
- **English is the bridge.** Translating between two non-English languages goes through English definitions, so nuance English doesn't mark can be lost.
- **`meaning` matches words, not ideas.** It compares your words with the dictionary's definitions (and the top translation's), so "awesome" won't find a sense defined as "Fashionable; trendy; hip." Use the definition's own wording, or let users pick from `senses()`.
- **Grammar words translate poorly.** Words defined by their function ("marks the future tense" for Vietnamese *sẽ*) aren't reached from English *will*; *the*, *is* or *gonna* may give nothing useful.
- **Base words only for Spanish.** Conjugations and plurals are left out; use *hablar*, not *hablamos*.

## Word frequencies

Translations are ranked partly by how common each word is, using **[wordfreq](https://github.com/rspeer/wordfreq)** by Robyn Speer (Robyn Speer. (2022). rspeer/wordfreq: v3.0 (v3.0.2). Zenodo. https://doi.org/10.5281/zenodo.7199437), licensed CC BY-SA 4.0. Only a single frequency score is stored for each word already in these dictionaries (`frequency` on entries and results), never wordfreq's word lists.

wordfreq's data comes from, and is credited to:

- Google Books Ngrams (<http://books.google.com/ngrams>) and Google Books Syntactic Ngrams.
- The Leeds Internet Corpus, from the University of Leeds Centre for Translation Studies (<http://corpus.leeds.ac.uk/list.html>).
- Wikipedia, the free encyclopedia (<http://www.wikipedia.org>).
- ParaCrawl, a multilingual Web crawl (<https://paracrawl.eu>).
- OPUS OpenSubtitles 2018 (<http://opus.nlpl.eu/OpenSubtitles.php>), whose data originates from the OpenSubtitles project (<http://www.opensubtitles.org/>).
- SUBTLEX word lists (SUBTLEX-US, SUBTLEX-UK, SUBTLEX-CH, SUBTLEX-DE, SUBTLEX-NL) created by **Marc Brysbaert et al.**; SUBTLEX is freely available data (<http://crr.ugent.be/programs-data/subtitle-frequencies>).
- Word statistics gathered from the Twitter streaming API (no Twitter content is included).

wordfreq measures commonness **worldwide**, so a regional word (Cuban *guagua*, "bus") can look rare even where it's the everyday word; the region bonus is kept separate from frequency for that reason.

## License and attribution

- **Code** (this repo, and the `which-dialect` package): [MIT](LICENSE).
- **Data** (the `which-dialect-<code>` packages): derived from Wiktionary via Kaikki.org's [wiktextract](https://github.com/tatuylonen/wiktextract) extraction, modified (filtered and reshaped) by this project, with word frequencies from [wordfreq](#word-frequencies), and licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

If your app **shows** this data, credit it where users can see it, for example:

> Translations from [Wiktionary](https://en.wiktionary.org/), [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), via which-dialect.

If you **redistribute modified data**, it has to stay under CC BY-SA 4.0. Using the API in your app doesn't change your app's own license. This project isn't affiliated with or endorsed by Wikimedia or Kaikki.org.

## Development

Requires Node 22.6+ (TypeScript scripts run with `--experimental-strip-types`).

```sh
npm install
npm run build:data -- es             # download Kaikki's file for a language (cached in .cache/) and build packages/<code>/data
npm run build:data -- es --refresh   # re-download first
npm test                             # unit tests, plus checks against whichever languages are built
npm run evaluate                     # translation accuracy on known-correct cases (-- --verbose to see every case)
npm run typecheck
npm run build                        # compile the API to packages/core/dist
```

Generated data isn't committed (it would bloat git history); it's built before publishing. Downloads: Vietnamese 79 MB, Spanish 1 GB, English 3.3 GB. Builds take seconds (English: about 25 s and 1.4 GB of memory).

### Adding a language

1. Add `languages/<code>.ts`: the Kaikki language name, the language's regions (and groups, if any), and how to read regions from Wiktionary's tags. See [`languages/vi.ts`](languages/vi.ts) (dialect areas), [`languages/es.ts`](languages/es.ts) (countries and groups) and [`languages/en.ts`](languages/en.ts) (trimming a very large language). Set `skipFormOf` for heavily inflected languages; for very large ones, see the trimming options in [`scripts/language-config.ts`](scripts/language-config.ts) (`dropTechnical`, `formOfPos`, `keepFormOf`, `maxSensesPerEntry`, `shardLength`, …).
2. Copy a data package (`packages/es`) to `packages/<code>` and update its `package.json` and `README.md`.
3. `npm run build:data -- <code>`, check the results, add a few real-data tests, and publish.

Languages in non-Latin scripts (Chinese, Arabic, Russian, …) will need a script-aware version of `shardKey` first: today files are split by the first two Latin letters.

### Publishing

```sh
npm run build:data -- en --refresh && npm run build:data -- es --refresh && npm run build:data -- vi --refresh && npm test
npm publish -w which-dialect-en
npm publish -w which-dialect-es
npm publish -w which-dialect-vi
npm publish -w which-dialect
```

The API loads data versions matching `DATA_VERSION` in `packages/core/src/index.ts` (currently `0.1`). Data-only updates can publish new 0.1.x data versions without touching the API; bump `DATA_VERSION` when the data format changes.
