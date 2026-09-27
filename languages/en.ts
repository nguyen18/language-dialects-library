import type { LanguageConfig } from '../scripts/language-config.ts'

// English: regions are the countries and areas where Wiktionary tags English usage. Local varieties
// count as their country (Scotland, Cockney, Yorkshire -> UK; Appalachia, Southern US -> US;
// Singlish -> Singapore), and group tags such as "Commonwealth" or "South-Asia" expand to countries.
//
// English is also the helper language for translation: its entries give each English word's parts of
// speech, meanings and base forms ("said" -> "say", "dont" -> "don't"), which createTranslator uses.

const UK_AREAS = [
  'UK', 'British', 'England', 'English', 'Scotland', 'Scottish', 'Wales', 'Welsh', 'Northern-Ireland',
  'Northern-England', 'Northumbria', 'Geordie', 'Yorkshire', 'Lancashire', 'Cockney', 'West-Country',
  'Cornwall', 'Midlands', 'West-Midlands', 'East-Anglia', 'Multicultural-London-English', 'London', 'Liverpool',
  'Manchester', 'Oxford', 'Cambridge',
]
const US_AREAS = [
  'US', 'American', 'Southern-US', 'Appalachia', 'New-England', 'Hawaii', 'California', 'New-York',
  'Midwestern-US', 'Texas', 'Louisiana', 'Boston', 'Philadelphia', 'Pittsburgh', 'African-American-Vernacular',
]

const REGIONS = [
  'US', 'UK', 'Ireland', 'Canada', 'Australia', 'New Zealand', 'South Africa', 'India', 'Pakistan',
  'Philippines', 'Singapore', 'Malaysia', 'Hong Kong', 'Nigeria', 'Caribbean',
]

const regionGroups: Record<string, string[]> = {
  'North America': ['US', 'Canada'],
  'British Isles': ['UK', 'Ireland'],
  Oceania: ['Australia', 'New Zealand'],
  'South Asia': ['India', 'Pakistan'],
  'Southeast Asia': ['Philippines', 'Singapore', 'Malaysia'],
  Africa: ['South Africa', 'Nigeria'],
  Commonwealth: ['UK', 'Canada', 'Australia', 'New Zealand', 'South Africa', 'India', 'Pakistan', 'Singapore', 'Malaysia', 'Nigeria', 'Caribbean'],
}

// Wiktionary tag -> regions.
const TAG_REGIONS: Record<string, string[]> = {
  ...Object.fromEntries(UK_AREAS.map((t) => [t, ['UK']])),
  ...Object.fromEntries(US_AREAS.map((t) => [t, ['US']])),
  Ireland: ['Ireland'], Irish: ['Ireland'],
  Canada: ['Canada'], Canadian: ['Canada'], Newfoundland: ['Canada'],
  Australia: ['Australia'], Australian: ['Australia'],
  'New-Zealand': ['New Zealand'],
  'South-Africa': ['South Africa'],
  India: ['India'], Indian: ['India'],
  Pakistan: ['Pakistan'],
  Philippines: ['Philippines'],
  Singapore: ['Singapore'], Singlish: ['Singapore'],
  Malaysia: ['Malaysia'], Manglish: ['Malaysia'],
  'Hong-Kong': ['Hong Kong'],
  Nigeria: ['Nigeria'],
  Caribbean: ['Caribbean'], Jamaica: ['Caribbean'], Trinidad: ['Caribbean'], Barbados: ['Caribbean'],
  'North-America': regionGroups['North America'],
  'South-Asia': regionGroups['South Asia'],
  Commonwealth: regionGroups.Commonwealth,
}

// true when `form` is `lemma` plus a regular English ending: -s/-es/-ed/-d/-ing/-er/-est, with the
// usual spelling changes (y -> i after a consonant, dropped e, doubled final consonant). "said" (say)
// and "paid" (pay) keep y -> i after a vowel, so they count as irregular and are stored.
export function isRegularForm(form: string, lemma: string): boolean {
  if (form === lemma) return false
  const stems = [lemma]
  if (lemma.endsWith('e')) stems.push(lemma.slice(0, -1))
  if (/[^aeiou]y$/.test(lemma)) stems.push(`${lemma.slice(0, -1)}i`)
  const last = lemma.charAt(lemma.length - 1)
  if (/[bcdfgklmnprstvz]/.test(last)) stems.push(lemma + last)
  return stems.some((stem) => /^(s|es|ed|d|ing|er|est|r|st)$/.test(form.slice(stem.length)) && form.startsWith(stem))
}

const config: LanguageConfig = {
  lang: 'en',
  name: 'English',
  kaikkiName: 'English',
  regions: REGIONS,
  regionGroups,
  regionsFromTags(tags) {
    const found = new Set<string>()
    for (const tag of tags) for (const r of TAG_REGIONS[tag] ?? []) found.add(r)
    return [...found]
  },
  // English Wiktionary is huge (1.5 million entries, 3.3 GB), so it's trimmed to what learners and
  // the translator need.
  skipPos: ['name', 'symbol', 'character', 'punct', 'infix', 'interfix', 'circumfix', 'proverb'],
  // Up to two words ("ice cream", "going to"), no longer phrases.
  keepWord: (word) => word.trim().split(/\s+/).length <= 2,
  // Specialist vocabulary (every sense is biology, law, chemistry…) isn't what learners translate.
  dropTechnical: true,
  // Keep inflected forms where they're irregular or useful ("said" -> "say", "better" -> "good",
  // "was" -> "be", "them" -> "they"); regular noun plurals are left out.
  formOfPos: ['verb', 'adj', 'adv', 'pron', 'det', 'contraction'],
  // Regular forms ("walked", "bigger") are undone by rule in the translator (see regularBaseForms),
  // so only irregular ones ("said", "went", "better") are stored.
  keepFormOf: (form, lemma) => !isRegularForm(form.toLowerCase(), lemma.toLowerCase()),
  dropLabels: ['obsolete', 'archaic'],
  maxSensesPerEntry: 6,
  maxGlossLength: 140,
  englishIndex: false,
  shardLength: 3,
}

export default config
