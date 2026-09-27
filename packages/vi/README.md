# language-dialects-library-vi

Vietnamese dictionary data for [language-dialects-library](https://github.com/nguyen18/language-dialects-library), with senses tagged **Northern**, **Central** and **Southern** where Wiktionary tags them. Senses without a region tag are listed under all three regions (`regionTagged: false`).

You normally don't install this package: `language-dialects-library` loads its files on demand from jsDelivr.

```ts
import { createDictionary } from 'language-dialects-library'
const vi = createDictionary({ lang: 'vi' })
await vi.searchEnglish('pig', { region: 'Southern' }) // heo, …
```

## Contents

- `data/meta.json`: regions, source, license, counts, and the list of files.
- `data/words/<xx>.json`: entries by Vietnamese headword, split by the first two letters without diacritics (`không` → `kh`).
- `data/en/<xx>.json`: English search terms → Vietnamese words.

About 35,000 entries; roughly 1,300 senses carry a region tag (Southern, Central or Northern). North Central Vietnamese counts as Central. Chinese-character (chữ Hán/chữ Nôm) entries and romanizations are left out.

## License and attribution

This data is derived from [Wiktionary](https://en.wiktionary.org/) through [Kaikki.org](https://kaikki.org/dictionary/Vietnamese/)'s wiktextract extraction, and modified (filtered and reshaped) by language-dialects-library. It is licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/); see [LICENSE](LICENSE).

Apps that show this data should credit it where users can see it, for example: "Translations from Wiktionary, CC BY-SA 4.0, via language-dialects-library". Modified versions of the data must stay under CC BY-SA 4.0. Not affiliated with or endorsed by Wikimedia or Kaikki.org.
