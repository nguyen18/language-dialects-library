# which-dialect-en

English dictionary data for [which-dialect](https://github.com/nguyen18/which-dialect). It has two jobs:

1. **Regional English**: senses tagged by country where Wiktionary tags them (US, UK, Australia, Canada, India, …). Senses without a region tag are listed under every region (`regionTagged: false`).
2. **Context for translation**: each English word's parts of speech, meanings, synonyms and base forms (*said* → *say*, *dont* → *don't*), which `createTranslator` uses when translating from or into English, and between US, UK and other varieties.

You normally don't install this package: `which-dialect` loads its files on demand from jsDelivr.

```ts
import { createDictionary, createTranslator } from 'which-dialect'

const en = createDictionary({ lang: 'en' })
await en.lookup('lorry') // noun: "a large and heavy motor vehicle designed to carry goods…; a truck" (UK, Ireland, India, Pakistan)

const tr = createTranslator()
await tr.translate('said', { from: 'en', to: 'vi', toRegion: 'Southern' })     // say (verb) → nói
await tr.translate('truck', { from: 'en', fromRegion: 'US', to: 'en', toRegion: 'UK' }) // lorry
```

## Regions

US, UK, Ireland, Canada, Australia, New Zealand, South Africa, India, Pakistan, Philippines, Singapore, Malaysia, Hong Kong, Nigeria, Caribbean.

**Groups:** North America, British Isles, Oceania, South Asia, Southeast Asia, Africa, Commonwealth. Local varieties count as their country: Scotland, Cockney, Yorkshire and other UK areas → UK; Appalachia, Southern US and other US areas → US; Singlish → Singapore; Manglish → Malaysia; Newfoundland → Canada.

## What's included

English Wiktionary has about 1.5 million entries (3.3 GB), so this package keeps what learners and the translator need:

- Up to two-word headwords ("ice cream", "going to"); no proper names, symbols or proverbs.
- No purely technical entries (every sense is biology, law, chemistry, …), and no obsolete or archaic senses.
- Every sense of a word is kept (no cap), with long definitions shortened and one example sentence per sense.
- **Irregular forms only** (*said*, *went*, *better*, *was*). Regular forms (*walked*, *cities*, *running*) are left out; the translator undoes them by rule (`regularBaseForms`).
- The English search index covers **regional** senses only ("truck" in the UK → "lorry"); words used everywhere are found with `lookup`.
- Sense synonyms are kept (up to 8), which is how US/UK pairs like *lift*/*elevator* are linked.

About 595,000 entries; roughly 35,000 senses carry a region tag. Files are split by the first three letters without accents (`running` → `run`).

## Word frequencies

Each entry's `frequency` (and each search result's) is a Zipf score from **[wordfreq](https://github.com/rspeer/wordfreq)** by Robyn Speer (https://doi.org/10.5281/zenodo.7199437), CC BY-SA 4.0. wordfreq's data comes from Google Books Ngrams (http://books.google.com/ngrams), the Leeds Internet Corpus (University of Leeds Centre for Translation Studies), Wikipedia, ParaCrawl, OPUS OpenSubtitles 2018 (data from the OpenSubtitles project, opensubtitles.org), SUBTLEX word lists by Marc Brysbaert et al. (SUBTLEX is freely available data: http://crr.ugent.be/programs-data/subtitle-frequencies), and word statistics from the Twitter streaming API. Only one score per word in this dictionary is included, not wordfreq's word lists.

## License and attribution

This data is derived from [Wiktionary](https://en.wiktionary.org/) through [Kaikki.org](https://kaikki.org/dictionary/English/)'s wiktextract extraction, and modified (filtered and reshaped) by which-dialect, with word frequencies from wordfreq (see above). It is licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/); see [LICENSE](LICENSE).

Apps that show this data should credit it where users can see it, for example: "Translations from Wiktionary, CC BY-SA 4.0, via which-dialect". Modified versions of the data must stay under CC BY-SA 4.0. Not affiliated with or endorsed by Wikimedia or Kaikki.org.
