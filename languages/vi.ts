import type { LanguageConfig } from '../scripts/language-config.ts'

// Vietnamese: three dialect regions. The source tags senses with "Northern", "Central" and "Southern";
// "Central" + "North" together means North Central Vietnam, which counts as Central here.
const config: LanguageConfig = {
  lang: 'vi',
  name: 'Vietnamese',
  kaikkiName: 'Vietnamese',
  regions: ['Northern', 'Central', 'Southern'],
  regionsFromTags(tags, rawTags) {
    const found = new Set<string>()
    if (tags.includes('Southern')) found.add('Southern')
    if (tags.includes('Central')) found.add('Central')
    if (tags.includes('Northern') || (tags.includes('North') && !tags.includes('Central'))) found.add('Northern')
    // A few senses spell the region out in free text instead, e.g. "in Central Vietnam and Southern Vietnam".
    for (const raw of rawTags) {
      if (!/vietnam|dialect/i.test(raw)) continue
      if (/south/i.test(raw)) found.add('Southern')
      if (/central/i.test(raw)) found.add('Central')
      if (/north(ern)? vietnam|northern dialect/i.test(raw) && !/north central/i.test(raw)) found.add('Northern')
    }
    return [...found]
  },
  // Chinese characters (chữ Hán/chữ Nôm) and romanizations aren't words a learner looks up.
  skipPos: ['character', 'romanization'],
  keepWord: (word) => /[a-zA-ZÀ-ỹđĐ]/.test(word),
  // wordfreq only has a "small" Vietnamese list (the most common ~25k tokens, which are syllables).
  wordfreq: 'small',
}

export default config
