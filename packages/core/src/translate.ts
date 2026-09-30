// Translating between any two languages and dialects, meaning by meaning.
//
// Every language's data defines its words in English (Wiktionary glosses), so English is the bridge:
// a source word's senses each give English terms ("guagua" -> "bus"), and the target language is searched
// for those terms with a compatible part of speech, in the target region. Each source sense is translated
// on its own, so a word's meanings don't get mixed up ("cool" the temperature vs. "cool" the compliment).

import { compatiblePos } from './pos.ts'
import {
  displayGloss,
  glossTerms,
  normalizeEnglish,
  type Example,
  type Hit,
  type LanguageMeta,
  PRONOUN_PERSONS,
  type PronounChoice,
  type PronounPerson,
  type PronounRow,
  type Sense,
  type TableTranslation,
} from './types.ts'
import {
  createDictionary,
  DEFAULT_EXCLUDED_LABELS,
  resolveRegion,
  type Dictionary,
  type LoadJson,
} from './index.ts'

/** One meaning of the source word, with its own part of speech and definitions. */
export type SourceSense = {
  /** The word as given. */
  word: string
  /** The word this sense belongs to: the base form or standard spelling ("say" for "said", "không" for "hông"). */
  lemma: string
  pos: string
  /** English definitions of this sense. */
  glosses: string[]
  regions: string[]
  regionTagged: boolean
  labels: string[]
  /** How `word` leads to `lemma` when they differ, e.g. "simple past of say" or "Southern Vietnam form of không". */
  via?: string
  /** Same-language words with this meaning (often other dialects' words). */
  synonyms?: string[]
  /** Example sentences for this meaning. */
  examples?: Example[]
  /** English senses only: Wiktionary's translation table for this meaning (see Sense.translations). */
  translations?: Record<string, TableTranslation[]>
}

/** A target-language word for a source sense. */
export type Translation = Hit & {
  /** Higher is better. Comparable within one group. */
  score: number
  /**
   * How this word was found: the English term that linked it, "synonym" for a same-language synonym,
   * "table" for Wiktionary's translation table, or "pronouns" for a pronoun-table row's words (the
   * `listener`'s or `about`'s row, or the default row).
   */
  bridge: string
  /** Example sentences for this word in the matched sense, when the dictionary has them. */
  examples?: Example[]
  /** For pronoun-table words: the relationship it's for, e.g. "Your parents". */
  relationship?: string
}

/**
 * A relationship the source word is used in as "I", "you", "he/she", "we", plural "you" or "they", from the
 * source language's pronoun table (Vietnamese "em": I, talking to someone a bit older; you, talking to
 * someone younger).
 */
export type PronounUse = {
  /** Row id, e.g. "older-male". */
  id: string
  /** Who you're talking to (or about), e.g. "Someone a bit older (man)". */
  label: string
  /** The table column: 'self' ("I"), 'addressee' ("you"), 'third' ("he/she"), or their plurals. */
  person: PronounPerson
  /** Only said by a male or female speaker. */
  speaker?: 'male' | 'female'
  /** The gender of the person the word refers to, when it has one. */
  gender?: 'male' | 'female'
  regions: string[]
  regionTagged: boolean
  note?: string
  warning?: string
}

/** The words for one person ("I", "you", "he"…) in one relationship, from the target's pronoun table. */
export type RelationshipWords = {
  /** Row id, usable as `listener` (I/you/we) or `about` (he/she/they). */
  id: string
  /** Who you're talking to, e.g. "Your parents". */
  label: string
  words: PronounChoice[]
  warning?: string
}

export type TranslationGroup = {
  source: SourceSense
  /** English terms used to bridge this sense, main meaning first. */
  bridge: string[]
  /** Best first. */
  translations: Translation[]
  /**
   * For personal-pronoun senses ("I", "you", "he/she", "we", "they"), when the target language has a
   * pronoun table (Vietnamese): the word to use for each relationship, filtered by `toRegion`, `speaker`,
   * `exclude`, and the pronoun's gender (he/she) or inclusiveness (we). Pass one's `id` as `listener`
   * (I/you/we) or `about` (he/she/they) to put its words first.
   */
  relationships?: RelationshipWords[]
  /**
   * When the source word is in the source language's pronoun table: the relationships it's used in with
   * this meaning. Uses no definition covers get a group of their own, translated as "I", "you", "he"…
   * (Vietnamese "em" is only defined as "younger sibling" and "refers to any person described by em").
   */
  pronounUses?: PronounUse[]
}

export type TranslateOptions = {
  /** Source language code, e.g. "vi". */
  from: string
  /** Target language code, e.g. "en". Can equal `from` to translate between dialects of one language. */
  to: string
  /** Region or region group the source word is from, e.g. "Mexico". Keeps only senses used there. */
  fromRegion?: string
  /** Region or region group to translate into, e.g. "Southern". Words tagged for it rank first. */
  toRegion?: string
  /** Only source senses with this part of speech. */
  pos?: string
  /** Words describing the meaning you want, e.g. "awesome" for "cool". Matching senses and words rank first. */
  meaning?: string
  /**
   * The register you want translations in, instead of the source sense's own: 'casual' prefers
   * colloquial words (Southern "tui" for "I"), 'polite' polite/formal ones, 'neutral' plain ones.
   */
  register?: 'casual' | 'neutral' | 'polite'
  /**
   * Who you're talking to, as a pronoun-table row id of the target language (e.g. Vietnamese "parent",
   * "older-male", "friend"; see Dictionary.pronouns). For "I", "you", "we" and plural "you", that
   * relationship's words come first. Without it, the table's default row's words do (Vietnamese "tôi",
   * "bạn"). Ignored for targets without a pronoun table; unknown ids throw, listing the valid ones.
   */
  listener?: string
  /** Who you're talking about, as a row id like `listener`: for "he", "she", "him", "her", "they", "them". */
  about?: string
  /** The speaker's gender, for pronoun-table words that depend on it ("anh" vs "chị" toward someone younger). */
  speaker?: 'male' | 'female'
  /** Labels to leave out of translations (default DEFAULT_EXCLUDED_LABELS). */
  exclude?: string[]
  /** Maximum translations per source sense (default 5). */
  limit?: number
  /**
   * Return every sense, including ones with no translation (empty `translations`) and ones whose
   * translations repeat another sense's. Default false. Useful for letting users pick a meaning.
   */
  allSenses?: boolean
}

export type Translator = {
  /** The senses of a word, following forms and variant spellings to the words they belong to. */
  senses(word: string, options: { from: string; fromRegion?: string; pos?: string }): Promise<SourceSense[]>
  /** Translations grouped by source sense, most relevant sense first. */
  translate(word: string, options: TranslateOptions): Promise<TranslationGroup[]>
}

export type TranslatorOptions = {
  /** Returns the dictionary for a language. Defaults to createDictionary with the options below. */
  dictionary?: (lang: string) => Dictionary
  /** Where each language's data is served (see DictionaryOptions.baseUrl). */
  baseUrl?: (lang: string) => string
  /** Custom loader per language (see DictionaryOptions.load). */
  load?: (lang: string) => LoadJson
}

/**
 * Possible base words for a regularly inflected English word, most likely first: "walked" -> walk,
 * "cities" -> city, "making" -> make, "stopped" -> stop. The English data package only stores irregular
 * forms ("said", "went"), so regular ones are undone here.
 */
export function regularBaseForms(word: string): string[] {
  const w = word.toLowerCase()
  const out: string[] = []
  const add = (base: string) => base.length > 1 && base !== w && !out.includes(base) && out.push(base)
  const undouble = (stem: string) => (/([bdfgklmnprstvz])\1$/.test(stem) ? stem.slice(0, -1) : null)
  for (const [suffix, replacements] of [
    ['ies', ['y']], ['ied', ['y']], ['ier', ['y']], ['iest', ['y']],
    ['es', ['', 'e']], ['ing', ['', 'e']], ['ed', ['', 'e']], ['er', ['', 'e']], ['est', ['', 'e']],
    ['s', ['']], ['d', ['']],
  ] as const) {
    if (!w.endsWith(suffix) || w.length <= suffix.length + 1) continue
    const stem = w.slice(0, -suffix.length)
    for (const r of replacements) add(stem + r)
    const single = undouble(stem)
    if (single) add(single)
  }
  return out
}

// Base-form rules for languages whose data leaves regular forms out.
const BASE_FORMS: Record<string, (word: string) => string[]> = { en: regularBaseForms }

// A variant sense whose gloss points at another word ("simple past of say", "misspelling of don't",
// "Southern Vietnam form of không") rather than defining it. Variants with their own definition are kept.
const FORM_GLOSS = /\b(of|for)\b/

// How much being a common word counts: points per Zipf step above RARE_ZIPF (so "anh", Zipf 6.3,
// gets about +3.4 and "tía", Zipf 3.9, about +0.5). Words missing from a language's frequency list count
// as RARE_ZIPF - 1. Languages without frequency data fall back to a small bonus for having many senses.
export const FREQUENCY_WEIGHT = 1.2
const RARE_ZIPF = 3.5

// The region bonus is deliberately NOT scaled by frequency: wordfreq counts worldwide text, where
// regional words are rare even when they're the everyday word in their region (Cuban "guagua" for bus).
// Scaling it was tried (2026-09-27) and lost those words.

function commonness(hit: { frequency?: number; senses: number }, hasFrequencies: boolean): number {
  if (!hasFrequencies) return Math.min(hit.senses, 10) * 0.05
  return ((hit.frequency ?? RARE_ZIPF - 1) - RARE_ZIPF) * FREQUENCY_WEIGHT
}

// Wiktionary's translation tables list the usual translation of each English meaning, per language,
// with region tags (car → es: coche [Spain], carro [Mexico, …]). Being listed for the matched meaning is
// the strongest evidence a word is the right, common translation.
const TABLE_BONUS = 4
const TABLE_REGION_BONUS = 1.5
const TABLE_OTHER_REGION_PENALTY = 2

// Which pronoun-table column a personal-pronoun sense is. English pronouns are known by the word
// (English "him" is defined by grammar: "With dative effect or as an indirect object"); other languages'
// by their definitions ("I/me, your …", "you, my …", "he; him", "we/us (exclusive)", "they/them").
type Person = { person: PronounPerson; gender?: 'male' | 'female'; inclusive?: boolean }
const ENGLISH_PERSONS: Record<string, Person> = {
  i: { person: 'self' }, me: { person: 'self' },
  you: { person: 'addressee' },
  he: { person: 'third', gender: 'male' }, him: { person: 'third', gender: 'male' },
  she: { person: 'third', gender: 'female' }, her: { person: 'third', gender: 'female' },
  we: { person: 'selfPlural' }, us: { person: 'selfPlural' },
  they: { person: 'thirdPlural' }, them: { person: 'thirdPlural' },
  "y'all": { person: 'addresseePlural' }, 'you guys': { person: 'addresseePlural' }, yous: { person: 'addresseePlural' },
}
// English senses that aren't about people: "It; an animal whose gender is unknown", "A ship or boat",
// generic "you" ("Anyone, one").
const NOT_A_PERSON = /^(?:it\b|a genderless|a ship|a country|a thing|anyone\b|a dummy)/i
const INCLUSIVE = /\binclusive\b|\bincluding the (?:person|listener)/i
const EXCLUSIVE = /\bexclusive\b|\bexcluding the (?:person|listener)/i
function personOf(sense: SourceSense, from: string): Person | null {
  if (sense.pos !== 'pron') return null
  const gloss = displayGloss(sense.glosses)
  const clusivity = INCLUSIVE.test(gloss) ? { inclusive: true } : EXCLUSIVE.test(gloss) ? { inclusive: false } : {}
  if (from === 'en') {
    const known = ENGLISH_PERSONS[sense.lemma.toLowerCase()]
    if (!known || NOT_A_PERSON.test(gloss)) return null
    if (known.person === 'addressee' && /\bpeople\b|yourselves|\bplural\b/i.test(gloss)) return { person: 'addresseePlural' }
    // Singular "they": "One whose gender is unknown…".
    if (known.person === 'thirdPlural' && /^one\b/i.test(gloss)) return { person: 'third' }
    return { ...known, ...(known.person === 'selfPlural' ? clusivity : {}) }
  }
  if (/^(?:we|us)\b/i.test(gloss)) return { person: 'selfPlural', ...clusivity }
  if (/^you\b.*\b(?:plural|guys|y'all)\b/i.test(gloss)) return { person: 'addresseePlural' }
  if (/^(?:they|them)\b/i.test(gloss)) return { person: 'thirdPlural' }
  if (/^(?:I|me)\b|\bfirst[- ]person singular\b/i.test(gloss)) return { person: 'self' }
  if (/^you\b|\bsecond[- ]person singular\b/i.test(gloss)) return { person: 'addressee' }
  if (/^(?:he|him)\b/i.test(gloss)) return { person: 'third', ...(/\b(?:she|her)\b/i.test(gloss) ? {} : { gender: 'male' as const }) }
  if (/^(?:she|her)\b/i.test(gloss)) return { person: 'third', ...(/\b(?:he|him)\b/i.test(gloss) ? {} : { gender: 'female' as const }) }
  return null
}
// A pronoun sense whose definition names a relationship ("I/me, your father", "used by children when
// talking to their parents") isn't a plain "I": the default row's neutral words don't apply to it.
const RELATIONAL = /\b(?:your|my)\b|\bused (?:by|when|to)\b|\btalking to\b|\btowards?\b/i

// Which option picks the row: who you're talking to, or who you're talking about.
const ABOUT_PERSONS = new Set<PronounPerson>(['third', 'thirdPlural'])
const SINGULAR_PERSONS = new Set<PronounPerson>(['self', 'addressee', 'third'])

// A row's words for a pronoun sense: its gender (he/she) and inclusiveness (we) filter them.
function fits(c: PronounChoice, p: Person): boolean {
  return (!p.gender || !c.gender || c.gender === p.gender) && (p.inclusive === undefined || c.inclusive === undefined || c.inclusive === p.inclusive)
}

// Matches scoring below this are dropped. A real match gets at least ~2 (a main-meaning or first-term match).
const MIN_SCORE = 1

// A variant that's only another spelling of a different word ("yeah": pronunciation spelling of "year")
// ranks below the word's own meanings.
const SPELLING_VIA = /pronunciation spelling|misspelling|eye dialect|nonstandard spelling|dated spelling|informal spelling/i

// Senses whose labels are all in this set rank after mainstream senses.
const MARGINAL_LABELS = new Set(['informal', 'slang', 'colloquial', 'dialectal', 'rare', 'nonstandard', 'Internet', 'humorous'])
const LABEL_PENALTY = new Set(['slang', 'Internet', 'humorous', 'literary', 'dialectal', 'uncommon', 'rare', 'euphemistic'])

// Register: a polite source word should translate to a polite word, a casual one to a casual one.
const POLITE = new Set(['polite', 'formal', 'honorific', 'literary'])
const CASUAL = new Set(['informal', 'colloquial', 'slang', 'familiar', 'vulgar', 'Internet'])
function register(labels: string[]): 'polite' | 'casual' | null {
  if (labels.some((l) => POLITE.has(l))) return 'polite'
  if (labels.some((l) => CASUAL.has(l))) return 'casual'
  return null
}
function registerFit(source: string[], target: string[], wanted?: 'casual' | 'neutral' | 'polite'): number {
  const a = wanted ? (wanted === 'neutral' ? null : wanted) : register(source)
  const b = register(target)
  if (!b) return 0
  // A neutral meaning ("cool" the temperature) prefers neutral words over slang ("chất": cool, informal),
  // since frequency is per word, not per meaning, and a common word's slang sense can otherwise win.
  if (!a) return b === 'casual' ? -1.5 : 0
  return a === b ? 1 : -2
}

// Words too common to say anything about a meaning, and dictionary jargon: words that describe how a
// definition is written ("the speaker or writer, referred to as the grammatical subject") rather than
// what the word means. Without the jargon, Vietnamese "con" ("used when talking to someone older than
// the speaker") matched English "I" ("the speaker or writer") on "speaker".
const STOPWORDS = new Set(
  ('a an the to of or and in on for with by as at from that this be is are was it its used use any some one ' +
    'something someone very more most usually especially often also who which what when being having into ' +
    'speaker speakers writer referred refer refers referring grammatical subject object sentence clause ' +
    'word words form forms term expression phrase talking speaking addressed addressing person people ' +
    'particular certain various generally sense usage meaning').split(' '),
)

function contentWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z' ]+/g, ' ')
      .split(' ')
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  )
}

function overlap(a: Set<string>, text: string): number {
  let n = 0
  for (const w of contentWords(text)) if (a.has(w)) n++
  return n
}

function intersects(regions: string[], wanted: Set<string> | null): boolean {
  return !wanted || regions.some((r) => wanted.has(r))
}

/**
 * English terms that carry a sense's meaning: for English, the word itself first and its synonyms last
 * ("lift" -> "elevator"); then the terms in its definitions.
 */
function bridgeTerms(sense: SourceSense, from: string): { terms: string[]; synonymsFrom: number; main: Set<string> } {
  const terms: string[] = []
  // Main terms get the full "main meaning" bonus: the English word itself, and the first term of the
  // definition ("will": "Used to express the future tense" → "future tense", which is what "sẽ" means).
  const main = new Set<string>()
  if (from === 'en') {
    terms.push(normalizeEnglish(sense.lemma))
    main.add(normalizeEnglish(sense.lemma))
    // The base form too, since definitions usually use it ("thanks" -> "thank": "to thank").
    const [base] = regularBaseForms(sense.lemma)
    if (base) terms.push(base)
  }
  // Headings ("As a copulative verb:") carry no meaning, so the specific definitions are used.
  const glosses = sense.glosses.filter((g) => !g.trim().endsWith(':'))
  glosses.slice(0, 2).forEach((gloss, gi) => {
    for (const [term, position] of glossTerms(gloss)) {
      terms.push(term)
      if (gi === 0 && position === 0) main.add(term)
    }
  })
  const unique = [...new Set(terms)]
  const synonymsFrom = unique.length
  // Synonyms last: they're looser (English lists "cheers" as a synonym of "thanks"), so they score lower.
  if (from === 'en') {
    for (const syn of sense.synonyms ?? []) {
      const t = normalizeEnglish(syn)
      if (/^[a-z][a-z' -]*$/.test(t) && !unique.includes(t)) unique.push(t)
    }
  }
  return { terms: unique.slice(0, 8), synonymsFrom, main }
}

export function createTranslator(options: TranslatorOptions = {}): Translator {
  const cache = new Map<string, Dictionary>()
  const dict = (lang: string) => {
    let d = cache.get(lang)
    if (!d) {
      d = options.dictionary?.(lang) ?? createDictionary({ lang, baseUrl: options.baseUrl?.(lang), load: options.load?.(lang) })
      cache.set(lang, d)
    }
    return d
  }

  async function collectSenses(
    lang: string,
    word: string,
    depth: number,
    via: string | undefined,
    inherit: string[] | undefined,
  ): Promise<SourceSense[]> {
    const d = dict(lang)
    const w = word.trim()
    const entries = [...(await d.lookup(w)), ...(w !== w.toLowerCase() ? await d.lookup(w.toLowerCase()) : [])]
    // A regular form ("walked", "running") is also read as its base word, after the word's own entries.
    // Of the candidates the dictionary knows, the one with the most senses wins ("running" -> "run", not "runn").
    let base: { word: string; entries: typeof entries } | null = null
    const rules = BASE_FORMS[lang]
    if (rules && depth === 0) {
      let best = 0
      for (const candidate of rules(w)) {
        const found = await d.lookup(candidate)
        const count = found.reduce((n, e) => n + e.senses.length, 0)
        if (count > best) {
          best = count
          base = { word: candidate, entries: found }
        }
      }
    }

    const out: SourceSense[] = []
    const sources = [
      ...entries.map((entry) => ({ entry, via })),
      ...(base?.entries ?? []).map((entry) => ({ entry, via: via ?? `form of ${base!.word}` })),
    ]
    for (const { entry, via: entryVia } of sources) {
      for (const sense of entry.senses) {
        // Follow variants to the word they belong to (at most two hops: dont -> don't -> do not). A tagged
        // variant keeps its region: "hông" is Southern even though "không" is used everywhere.
        if (sense.altOf && depth < 2 && FORM_GLOSS.test(sense.glosses[0] ?? '')) {
          const followed = await collectSenses(
            lang,
            sense.altOf,
            depth + 1,
            entryVia ?? sense.glosses[0],
            sense.regionTagged ? sense.regions : inherit,
          )
          // Prefer the same part of speech: the pronoun "tui" takes the pronoun senses of "tôi".
          const same = followed.filter((f) => f.pos === entry.pos)
          out.push(...(same.length ? same : followed))
          continue
        }
        out.push({
          word: w,
          lemma: entry.word,
          pos: entry.pos,
          glosses: sense.glosses,
          regions: inherit ?? sense.regions,
          regionTagged: inherit ? true : sense.regionTagged,
          labels: sense.labels,
          ...(entryVia ? { via: entryVia } : {}),
          ...(sense.synonyms ? { synonyms: sense.synonyms } : {}),
          ...(sense.examples ? { examples: sense.examples } : {}),
          ...(sense.translations ? { translations: sense.translations } : {}),
        })
      }
    }
    // The same sense reached twice (e.g. through two spellings) is kept once. The key uses all the
    // glosses: nested senses share their first line (a heading like "As a copulative verb:"), and keying
    // on it alone dropped every sense after the first under a heading.
    const seen = new Set<string>()
    return out
      .map((s) => ({ ...s, word: w }))
      .filter((s) => {
        const key = `${s.lemma}\u0000${s.pos}\u0000${s.glosses.join('\u0001')}`
        return !seen.has(key) && seen.add(key)
      })
  }

  async function senses(word: string, { from, fromRegion, pos }: { from: string; fromRegion?: string; pos?: string }) {
    const wanted = resolveRegion(await dict(from).meta(), fromRegion)
    return (await collectSenses(from, word, 0, undefined, undefined)).filter(
      (s) => intersects(s.regions, wanted) && (!pos || s.pos === pos),
    )
  }

  // English target: the bridge terms are English words already. Keep those the English dictionary has
  // with a compatible part of speech and used in the target region, plus regional words for them
  // ("truck" in the UK -> "lorry").
  async function englishCandidates(
    term: string,
    posList: string[],
    toMeta: LanguageMeta,
    toRegion: string | undefined,
    exclude: string[],
  ): Promise<Hit[]> {
    const en = dict('en')
    const wanted = resolveRegion(toMeta, toRegion)
    const hits: Hit[] = []
    // Terms are lowercase, so the capitalized word too ("i" is the letter; the pronoun is "I"). When the
    // exact part of speech is there, other compatible ones are left out (the letter "i" for pronoun "I").
    const capitalized = term.charAt(0).toUpperCase() + term.slice(1)
    let entries = [...(await en.lookup(term)), ...(capitalized !== term ? await en.lookup(capitalized) : [])]
    const usable = (s: Sense) => !s.altOf && intersects(s.regions, wanted) && !s.labels.some((l) => exclude.includes(l))
    if (entries.some((e) => e.pos === posList[0] && e.senses.some(usable))) entries = entries.filter((e) => e.pos === posList[0])
    for (const entry of entries) {
      if (!posList.includes(entry.pos)) continue
      const index = entry.senses.findIndex(usable)
      if (index < 0) continue
      const s = entry.senses[index]
      hits.push({
        word: entry.word,
        pos: entry.pos,
        gloss: s.glosses[0],
        regions: s.regions,
        regionTagged: s.regionTagged,
        labels: s.labels,
        senseIndex: index,
        senses: entry.senses.length,
        ...(entry.frequency !== undefined ? { frequency: entry.frequency } : {}),
        primary: true,
      })
    }
    if (toRegion) hits.push(...(await en.searchEnglish(term, { region: toRegion, pos: posList, exclude, limit: 10 })))
    return hits
  }

  // Translating between dialects of one language: the sense's synonyms are candidates themselves
  // ("ngô" -> "bắp"). Each is looked up for its sense closest to the source meaning, and kept if it's
  // used in the target region.
  async function synonymCandidates(
    sense: SourceSense,
    lang: string,
    posList: string[],
    wanted: Set<string> | null,
    exclude: string[],
    context: Set<string>,
  ): Promise<Hit[]> {
    const hits: Hit[] = []
    for (const syn of sense.synonyms ?? []) {
      let best: { hit: Hit; fit: number } | null = null
      for (const entry of await dict(lang).lookup(syn)) {
        if (!posList.includes(entry.pos)) continue
        entry.senses.forEach((s, index) => {
          if (s.altOf || !intersects(s.regions, wanted) || s.labels.some((l) => exclude.includes(l))) return
          // Prefer the sense that lists the source word back, then the one whose definition overlaps most.
          const fit = (s.synonyms?.includes(sense.lemma) ? 5 : 0) + overlap(context, s.glosses.join(' ')) - index * 0.1
          if (!best || fit > best.fit) {
            best = {
              fit,
              hit: {
                word: entry.word, pos: entry.pos, gloss: s.glosses[0], regions: s.regions, regionTagged: s.regionTagged,
                labels: s.labels, senseIndex: index, senses: entry.senses.length, primary: index === 0,
                ...(entry.frequency !== undefined ? { frequency: entry.frequency } : {}),
              },
            }
          }
        })
      }
      if (best) hits.push((best as { hit: Hit }).hit)
    }
    return hits
  }

  // The translation-table words for a source sense in the target language. English senses carry their
  // table; for other languages, the English sense whose table lists the source word (in the source
  // language) is the same meaning, and its target-language list applies.
  async function tableFor(sense: SourceSense, from: string, to: string, bridge: string[]): Promise<TableTranslation[]> {
    if (from === 'en') return to === 'en' ? [] : (sense.translations?.[to] ?? [])
    const found: TableTranslation[] = []
    const add = (list: TableTranslation[] | undefined) => {
      for (const t of list ?? []) if (!found.some((f) => f.word === t.word)) found.push(t)
    }
    for (const term of bridge.slice(0, 3)) {
      for (const entry of await dict('en').lookup(term)) {
        for (const s of entry.senses) {
          const own = s.translations?.[from]
          if (!own?.some((t) => t.word === sense.lemma || t.word === sense.word)) continue
          // Into English, the English word whose table lists the source word is itself the translation.
          if (to === 'en') add([{ word: entry.word }])
          else add(s.translations?.[to])
        }
      }
    }
    return found
  }

  // Which of the target's regions a table tag names ("Latin-America" -> its countries), if any.
  function tagRegions(tags: string[] | undefined, meta: LanguageMeta): Set<string> | null {
    const out = new Set<string>()
    for (const tag of tags ?? []) {
      const name = tag.replace(/-/g, ' ')
      // Tables sometimes shorten the region name ("South" for Vietnamese "Southern"): a tag that begins
      // exactly one region's name counts as that region.
      const prefixed = name.length >= 4 ? meta.regions.filter((r) => r.startsWith(name)) : []
      if (meta.regions.includes(name)) out.add(name)
      else if (meta.regionGroups?.[name]) for (const r of meta.regionGroups[name]) out.add(r)
      else if (prefixed.length === 1) out.add(prefixed[0])
    }
    return out.size ? out : null
  }

  // A table word the index didn't find: look it up in the target dictionary for its details. A compatible
  // part of speech is preferred, but the table is evidence for this exact meaning, so any part of speech
  // will do ("thanks" is an interjection; Vietnamese files "cám ơn" as a verb, "to thank"). A usable sense
  // whose definition contains a bridge term comes first, from any entry ("ta" is listed for "I": its
  // "I/me" sense, not its first, "we; us"), then the first usable sense.
  async function tableHit(word: string, to: string, posList: string[], wanted: Set<string> | null, exclude: string[], bridge: string[]): Promise<Hit | null> {
    const entries = await dict(to).lookup(word)
    const ordered = [...entries.filter((e) => posList.includes(e.pos)), ...entries.filter((e) => !posList.includes(e.pos))]
    const usable = (s: Sense) => !s.altOf && intersects(s.regions, wanted) && !s.labels.some((l) => exclude.includes(l))
    const matches = (s: Sense) => s.glosses.some((g) => glossTerms(g).some(([t]) => bridge.includes(t)))
    const pick = (test: (s: Sense) => boolean) => {
      for (const entry of ordered) {
        const index = entry.senses.findIndex(test)
        if (index >= 0) return { entry, index }
      }
      return null
    }
    const found = pick((s) => usable(s) && matches(s)) ?? pick(usable) ?? pick(() => true)
    if (!found) return null
    const { entry, index } = found
    const s = entry.senses[index]
    return {
      word: entry.word, pos: entry.pos, gloss: s.glosses[0], regions: s.regions, regionTagged: s.regionTagged,
      labels: s.labels, senseIndex: index, senses: entry.senses.length, primary: true,
      ...(entry.frequency !== undefined ? { frequency: entry.frequency } : {}),
    }
  }

  // The source word's uses in a pronoun table, with the definition each came from.
  function pronounUses(rows: PronounRow[], word: string): { gloss?: string; use: PronounUse }[] {
    const w = word.trim()
    const out: { gloss?: string; use: PronounUse }[] = []
    for (const r of rows) {
      for (const person of PRONOUN_PERSONS) {
        for (const c of r[person]) {
          if (c.word !== w && c.word !== w.toLowerCase()) continue
          out.push({
            gloss: c.gloss,
            use: {
              id: r.id, label: r.label, person, regions: c.regions, regionTagged: c.regionTagged,
              ...(c.speaker ? { speaker: c.speaker } : {}), ...(c.gender ? { gender: c.gender } : {}),
              ...(c.note ? { note: c.note } : {}), ...(r.warning ? { warning: r.warning } : {}),
            },
          })
        }
      }
    }
    return out
  }

  // English words for a pronoun-table column (he/him or she/her by gender).
  function englishWords(person: PronounPerson, gender?: 'male' | 'female'): string[] {
    switch (person) {
      case 'self': return ['I', 'me']
      case 'addressee': case 'addresseePlural': return ['you']
      case 'third': return gender === 'male' ? ['he', 'him'] : gender === 'female' ? ['she', 'her'] : ['he', 'she']
      case 'selfPlural': return ['we', 'us']
      case 'thirdPlural': return ['they', 'them']
    }
  }

  // The target's words for a pronoun: the English words themselves, else the English word translated
  // (with the caller's listener/about, so Vietnamese gets the right relationship word).
  async function pronounTranslations(
    person: PronounPerson,
    gender: 'male' | 'female' | undefined,
    o: { to: string; toMeta: LanguageMeta; toRegion?: string; register?: TranslateOptions['register']; listener?: string; about?: string; speaker?: 'male' | 'female'; exclude: string[]; limit: number },
  ): Promise<Translation[]> {
    const words = englishWords(person, gender)
    if (o.to === 'en') {
      const hits = (await Promise.all(words.map((w) => englishCandidates(w.toLowerCase(), ['pron'], o.toMeta, o.toRegion, o.exclude)))).flat()
      const seen = new Set<string>()
      return hits
        .filter((h) => h.pos === 'pron' && !seen.has(h.word) && seen.add(h.word))
        .map((h, i) => ({ ...h, score: 10 - i, bridge: 'pronouns' }))
    }
    const groups = await api.translate(words[0], {
      from: 'en', to: o.to, toRegion: o.toRegion, register: o.register, listener: o.listener, about: o.about, speaker: o.speaker, exclude: o.exclude, limit: o.limit,
    })
    const found = (groups.find((g) => personOf(g.source, 'en')?.person === person) ?? groups[0])?.translations ?? []
    // Pronouns only, when there are any (English "I" into Spanish also finds the letter, "i latina").
    const pronouns = found.filter((t) => t.pos === 'pron')
    return pronouns.length ? pronouns : found
  }

  const api: Translator = {
    senses,

    async translate(word, { from, to, fromRegion, toRegion, pos, meaning, register: wantedRegister, listener, about, speaker, exclude = DEFAULT_EXCLUDED_LABELS, limit = 5, allSenses = false }) {
      const [sourceSenses, toMeta, fromMeta] = await Promise.all([senses(word, { from, fromRegion, pos }), dict(to).meta(), dict(from).meta()])
      // The target's pronoun table, for personal-pronoun senses (throws for an unknown listener/about).
      const pronounRows: PronounRow[] =
        toMeta.pronouns && sourceSenses.some((s) => personOf(s, from))
          ? await dict(to).pronouns({ region: toRegion, speaker, exclude })
          : []
      if (listener && toMeta.pronouns) await dict(to).pronouns({ listener })
      if (about && toMeta.pronouns) await dict(to).pronouns({ listener: about })
      const toWanted = resolveRegion(toMeta, toRegion)
      const hasFrequencies = Boolean(toMeta.frequencySource)
      const meaningWords = meaning ? contentWords(meaning) : null

      const groups: TranslationGroup[] = []
      for (const sense of sourceSenses) {
        const { terms: bridge, synonymsFrom, main } = bridgeTerms(sense, from)
        if (bridge.length === 0) {
          if (allSenses) groups.push({ source: sense, bridge, translations: [] })
          continue
        }
        const posList = compatiblePos(sense.pos)
        const context = contentWords(`${sense.glosses.join(' ')} ${meaning ?? ''}`)
        const scored = new Map<string, Translation>()
        const keep = (hit: Hit, score: number, bridgeTerm: string) => {
          const existing = scored.get(hit.word)
          if (!existing || existing.score < score) scored.set(hit.word, { ...hit, score, bridge: bridgeTerm })
        }

        if (to === from) {
          for (const hit of await synonymCandidates(sense, to, posList, toWanted, exclude, context)) {
            if (hit.word === sense.lemma) continue
            // A synonym is a direct equivalent, so it starts ahead of words found through English.
            keep(
              hit,
              5 + (toWanted && hit.regionTagged ? 3 : 0) + commonness(hit, hasFrequencies) +
                registerFit(sense.labels, hit.labels, wantedRegister) -
                hit.labels.filter((l) => LABEL_PENALTY.has(l)).length * 0.5,
              'synonym',
            )
          }
        }

        for (const [termIndex, term] of bridge.entries()) {
          // The term's own words say nothing about which meaning matched, so they don't count as overlap.
          const termWords = contentWords(term)
          const ctx = new Set([...context].filter((w) => !termWords.has(w)))
          const hits =
            to === 'en'
              ? await englishCandidates(term, posList, toMeta, toRegion, exclude)
              // A generous limit: the dictionary's quick ranking puts region-tagged words first, and the
              // full scoring below should decide (English "I" has 40+ Vietnamese pronoun candidates, and a
              // limit of 25 cut off the most common, "tôi").
              // Every matching sense, so each word is scored by its best-fitting one (plain "tôi" is formal
              // or neutral; its first-listed "I" sense is informal and Northern).
              : await dict(to).searchEnglish(term, { region: toRegion, pos: posList, exclude, limit: 100, allSenses: true })
          // Rank is the word's place in the dictionary's ranking, not the sense's.
          const wordRank = new Map<string, number>()
          for (const h of hits) if (!wordRank.has(h.word)) wordRank.set(h.word, wordRank.size)
          hits.forEach((hit) => {
            const rank = wordRank.get(hit.word)!
            // Translating between dialects of one language: the word itself only counts if it's tagged for the target region.
            if (to === from && hit.word === sense.lemma && toWanted && !hit.regionTagged) return
            // A word found through a secondary sense ("borona": millet, and also corn) is a weaker match
            // than one whose main sense is the bridge term ("maíz": corn). With frequency data this matters
            // less (common words win anyway), and kinship words list "you" after "I/me" (Vietnamese "anh"),
            // so the penalty is small then.
            const score =
              3 * overlap(ctx, hit.gloss) +
              (main.has(term) || termIndex === 0 ? 2 : termIndex === 1 ? 1 : 0) +
              (hit.primary ? 1 : 0) +
              // Tagged for the target region: a full bonus when the match is the word's main meaning, a
              // small one otherwise ("bá cháy" is Southern for "awesome", not for "cool" the temperature).
              (toWanted && hit.regionTagged && intersects(hit.regions, toWanted) ? (hit.primary ? 2 : 0.5) : 0) +
              (hit.pos === sense.pos ? 0.5 : 0) +
              commonness(hit, hasFrequencies) -
              Math.min(hit.senseIndex, 4) * (hasFrequencies ? 0.15 : 0.4) +
              registerFit(sense.labels, hit.labels, wantedRegister) -
              (termIndex >= synonymsFrom ? 1 : 0) -
              hit.labels.filter((l) => LABEL_PENALTY.has(l)).length * 0.5 -
              // A tiebreaker only, capped: the dictionary's quick ranking puts every labelled word after the
              // unlabelled ones, and labels are already scored above (formal "tôi" came ~30th for "I").
              Math.min(rank, 10) * 0.1
            keep(hit, score, term)
          })
        }
        // Translation-table evidence: boost words listed as the usual translation of this meaning, more
        // when the table tags them for the target region, less when it tags them only for other regions.
        const table = await tableFor(sense, from, to, bridge)
        for (const t of table) {
          if (to === from && t.word === sense.lemma && !tagRegions(t.tags, toMeta)?.size) continue
          const places = tagRegions(t.tags, toMeta)
          const otherRegion = Boolean(toWanted && places && ![...places].some((r) => toWanted.has(r)))
          let hit: Hit | null | undefined = scored.get(t.word)
          // Another region's word that the dictionary didn't find for this region isn't looked up: its
          // senses here are likely something else (Peruvian "cancha", popcorn, is a pitch in Mexico).
          if (!hit && !otherRegion) hit = await tableHit(t.word, to, posList, toWanted, exclude, bridge)
          if (!hit) continue
          const regionFit = !toWanted || !places ? 0 : otherRegion ? -TABLE_OTHER_REGION_PENALTY : TABLE_REGION_BONUS
          // The table's register tags count when the dictionary sense has no register of its own (the
          // table marks "ta" and "tớ" informal for "I"; their dictionary senses don't say).
          const tagFit = register(hit.labels) ? 0 : registerFit(sense.labels, t.tags ?? [], wantedRegister)
          // A word only the table found (e.g. the dictionary tags "auto" Mexico but the table says
          // Argentina) starts like a main-meaning match from the first bridge term (2 + 1).
          const base = scored.get(t.word)?.score ?? 3 + commonness(hit, hasFrequencies) + registerFit(sense.labels, hit.labels, wantedRegister)
          scored.set(t.word, { ...hit, score: base + TABLE_BONUS + regionFit + tagFit, bridge: 'table' })
        }

        // Nothing matched a whole term: try the last word of phrases ("fresh ear of corn" -> "corn"), scored lower.
        if (scored.size === 0) {
          const heads = [...new Set(bridge.filter((t) => t.includes(' ')).map((t) => t.split(' ').pop()!))]
          for (const head of heads.filter((h) => h.length > 2 && !STOPWORDS.has(h))) {
            const hits =
              to === 'en'
                ? await englishCandidates(head, posList, toMeta, toRegion, exclude)
                : await dict(to).searchEnglish(head, { region: toRegion, pos: posList, exclude, limit: 10 })
            hits.forEach((hit, rank) => keep(hit, 1 + (hit.primary ? 1 : 0) + (toWanted && hit.regionTagged ? 1 : 0) - rank * 0.1, head))
          }
        }

        // Within one language, a candidate that lists the source word as a synonym is a direct
        // equivalent even when the source doesn't list it back ("dạ" lists "vâng").
        if (to === from) {
          const top = [...scored.values()].sort((a, b) => b.score - a.score).slice(0, 10)
          for (const t of top) {
            const reverse = (await dict(to).lookup(t.word)).some((e) => e.senses.some((s) => s.synonyms?.includes(sense.lemma)))
            if (reverse && t.bridge !== 'synonym') scored.set(t.word, { ...t, score: t.score + 4, bridge: 'synonym' })
          }
        }

        // Personal pronouns: the chosen row's words go first (the `listener`'s for I/you/we, the `about`'s
        // for he/she/they, else the default row's), fitted to the pronoun's gender (he/she) and
        // inclusiveness (we). Words tagged for the target region, then those fitting the register, lead.
        const person = personOf(sense, from)
        const rowId = person ? (ABOUT_PERSONS.has(person.person) ? about : listener) : undefined
        const plain = !RELATIONAL.test(displayGloss(sense.glosses))
        const row = person ? (rowId ? pronounRows.find((r) => r.id === rowId) : plain ? pronounRows.find((r) => r.default) : undefined) : undefined
        if (person && row) {
          const words = row[person.person]
            .filter((c) => fits(c, person))
            .map((c, i) => ({ c, i, region: toWanted && c.regionTagged && intersects(c.regions, toWanted) ? 1 : 0, fit: registerFit(sense.labels, c.labels, wantedRegister) }))
            .sort((a, b) => b.region - a.region || b.fit - a.fit || a.i - b.i)
            .map((x) => x.c)
          const top = Math.max(0, ...[...scored.values()].map((t) => t.score))
          words.forEach((c, i) => {
            const found = scored.get(c.word)
            scored.set(c.word, {
              word: c.word, pos: found?.pos ?? 'pron', gloss: c.gloss ?? c.note ?? row.label,
              regions: c.regions, regionTagged: c.regionTagged, labels: c.labels,
              senseIndex: found?.senseIndex ?? 0, senses: found?.senses ?? 1, primary: true,
              ...(found?.frequency !== undefined ? { frequency: found.frequency } : {}),
              score: top + 1 + (words.length - i) * 0.1, bridge: 'pronouns', relationship: row.label,
            })
          })
        }
        const relationships = person
          ? pronounRows
              .map((r) => ({ id: r.id, label: r.label, words: r[person.person].filter((c) => fits(c, person)), ...(r.warning ? { warning: r.warning } : {}) }))
              .filter((r) => r.words.length)
          : []

        // Below this score a match is noise (an unrelated word that happened to share a term).
        const translations = [...scored.values()]
          .filter((t) => t.score >= MIN_SCORE)
          .sort((a, b) => b.score - a.score)
          .slice(0, limit)
        // Examples for the translations that made the cut: from the matched sense of each word.
        for (const t of translations) {
          const entry = (await dict(to).lookup(t.word)).find((e) => e.pos === t.pos && e.senses[t.senseIndex]?.glosses[0] === t.gloss)
          const examples = entry?.senses[t.senseIndex]?.examples
          if (examples) t.examples = examples
        }
        if (translations.length || allSenses) {
          groups.push({ source: sense, bridge, translations, ...(relationships.length ? { relationships } : {}) })
        }
      }

      // The source word's uses in its own language's pronoun table ("em": I to someone older, you to
      // someone younger). A use goes to the group of the definition it came from; the rest get a group
      // per person, translated as the target's "I", "you", "he"….
      const uses = fromMeta.pronouns && (!pos || pos === 'pron') ? pronounUses(await dict(from).pronouns({ region: fromRegion, speaker, exclude }), word) : []
      for (const person of PRONOUN_PERSONS) {
        const leftover: PronounUse[] = []
        for (const { gloss, use } of uses.filter((x) => x.use.person === person)) {
          const home = groups.filter((g) => gloss && personOf(g.source, from)?.person === person && g.source.glosses.includes(gloss))
          for (const g of home) g.pronounUses = [...(g.pronounUses ?? []), use]
          if (!home.length) leftover.push(use)
        }
        if (!leftover.length) continue
        const genders = new Set(leftover.map((u) => u.gender))
        const gender = genders.size === 1 ? leftover[0].gender : undefined
        const tagged = leftover.every((u) => u.regionTagged)
        const who = leftover.map((u) => u.label.charAt(0).toLowerCase() + u.label.slice(1) + (u.speaker ? ` (said by a ${u.speaker === 'male' ? 'man' : 'woman'})` : ''))
        const source: SourceSense = {
          word, lemma: word.trim(), pos: 'pron',
          glosses: [`${englishWords(person, gender).join('/')}${person === 'addresseePlural' ? ' (plural)' : ''}, when talking ${ABOUT_PERSONS.has(person) ? 'about' : 'to'}: ${who.join('; ')}`],
          regions: tagged ? [...new Set(leftover.flatMap((u) => u.regions))] : fromMeta.regions,
          regionTagged: tagged,
          labels: [],
        }
        const translations = await pronounTranslations(person, gender, { to, toMeta, toRegion, register: wantedRegister, listener, about, speaker, exclude, limit })
        groups.push({ source, bridge: [], translations, pronounUses: leftover })
      }

      // Most relevant sense first: one matching `meaning`; then one tagged for the source region (the
      // regional sense is what makes the word worth asking about); then mainstream before slang;
      // otherwise the dictionary's order. Pass `pos` or `meaning` when you know the sense you want.
      // Translation scores aren't used to order senses: definition overlap inflates minor senses
      // ("coche": carriage, coach), so the dictionary's order (main meanings first) decides.
      const ownSenses = sourceSenses.some((s) => !s.via)
      // `meaning` is matched against the sense's own definitions, and also against its top translation's
      // definition: English words the source definition doesn't use can still describe the target word
      // ("cool": "Fashionable; trendy; hip" never says "awesome", but its translation "guay" is "cool, great").
      // Personal pronouns into a language with a pronoun table: a listener/about says the caller means
      // that person. A word with both singular and plural person senses ("you": Wiktionary lists the
      // plural first) puts the plural ones after the others. Singular ones aren't raised: "bố" is
      // "father" first, "I/me, your father" after.
      const personGroups = groups.map((g) => (g.relationships ? personOf(g.source, from) : null))
      const hasSingular = personGroups.some((p) => p && SINGULAR_PERSONS.has(p.person))
      const pronounRelevance = (g: TranslationGroup) => {
        const p = personGroups[groups.indexOf(g)]
        if (!p) return 0
        const chosen = ABOUT_PERSONS.has(p.person) ? about : listener
        return (chosen ? 10 : 0) - (hasSingular && !SINGULAR_PERSONS.has(p.person) ? 3 : 0)
      }
      const relevance = (g: TranslationGroup) =>
        (meaningWords
          ? 10 * overlap(meaningWords, g.source.glosses.join(' ')) + 5 * overlap(meaningWords, g.translations[0]?.gloss ?? '')
          : 0) -
        (ownSenses && g.source.via && SPELLING_VIA.test(g.source.via) ? 2 : 0) +
        (fromRegion && g.source.regionTagged ? 3 : 0) +
        pronounRelevance(g) -
        (g.source.labels.length && g.source.labels.every((l) => MARGINAL_LABELS.has(l)) ? 1 : 0)
      const ordered = groups
        .map((g, i) => ({ g, i, r: relevance(g) }))
        .sort((a, b) => b.r - a.r || a.i - b.i)
        .map((x) => x.g)
      if (allSenses) return ordered
      // Senses that translate to the same words add nothing; keep the first.
      const seen = new Set<string>()
      return ordered.filter((g) => {
        const key = g.translations.slice(0, 3).map((t) => t.word).join('\u0000')
        return !seen.has(key) && seen.add(key)
      })
    },
  }
  return api
}
