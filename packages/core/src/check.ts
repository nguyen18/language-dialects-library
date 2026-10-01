// Checking text in one language: spelling and accents, words from another region, and pronouns and
// polite endings that fit who you're talking to.
//
// Every rule reads only the language's data: its dictionary, pronoun table, checker.json and
// syllables.json (see CheckerConfig). Adding a language means adding data and settings in
// languages/<lang>.ts, not code here. A rule whose data a language doesn't have is skipped, so a language
// without checker settings is still checked for words from another region.
//
// The checker only speaks up when it's confident and stays silent otherwise, so no issues means none of
// the checks found anything, not that the text is correct.

import { createDictionary, resolveRegion, type Dictionary } from './index.ts'
import { createTranslator, type TranslatorOptions } from './translate.ts'
import {
  PRONOUN_PERSONS,
  type CheckerConfig,
  type Entry,
  type LanguageMeta,
  type PronounPerson,
  type PronounRow,
} from './types.ts'

export type CheckRule = 'spelling' | 'dialect' | 'pronoun-relationship' | 'pronoun-pair' | 'polite-ending'

export type CheckIssue = {
  rule: CheckRule
  /**
   * 'error': almost certainly wrong (not a word of the language). 'warning': wrong for the chosen region
   * or relationship. 'suggestion': often better; worth a look.
   */
  severity: 'error' | 'warning' | 'suggestion'
  /** Character offsets of `text` in the checked text (`CheckResult.text`, the input in Unicode NFC form). */
  start: number
  end: number
  /** The text the issue is about. */
  text: string
  /** One sentence for the learner, e.g. “khong” isn't a Vietnamese syllable. Did you mean “không”? */
  message: string
  /** Replacements for `text`, best first; empty when there's nothing specific to suggest. */
  suggestions: string[]
}

export type CheckOptions = {
  /** Language code of the text, e.g. "vi". */
  lang: string
  /** Region or region group the text should be in, e.g. "Southern". Without it, mixed regions are flagged. */
  region?: string
  /** Who you're talking to, as a pronoun-table row id (see Dictionary.pronouns), e.g. "parent". */
  listener?: string
  /** Who you're talking about, as a pronoun-table row id, for "he/she" and "they" pronouns. */
  about?: string
  /** The speaker's gender, for pronouns that depend on it. */
  speaker?: 'male' | 'female'
  /** Turn rules off, e.g. { 'polite-ending': false }. All are on by default. */
  rules?: Partial<Record<CheckRule, boolean>>
}

export type CheckResult = {
  /** The checked text: the input in Unicode NFC form, which the issues' offsets refer to. */
  text: string
  /** Sorted by position. */
  issues: CheckIssue[]
}

export type Checker = {
  check(text: string, options: CheckOptions): Promise<CheckResult>
}

/** Same as the translator's: where each language's data comes from. */
export type CheckerOptions = TranslatorOptions

// How each pronoun-table column is named in messages.
const PERSON_NAMES: Record<PronounPerson, string> = {
  self: 'I', addressee: 'you', third: 'he/she', selfPlural: 'we', addresseePlural: 'you (plural)', thirdPlural: 'they',
}
// Columns chosen by `about` (who you're talking about); the rest by `listener`.
const ABOUT_PERSONS = new Set<PronounPerson>(['third', 'thirdPlural'])
const SELF_PERSONS = new Set<PronounPerson>(['self', 'selfPlural'])
const ADDRESSEE_PERSONS = new Set<PronounPerson>(['addressee', 'addresseePlural'])

// A run of letters (with their accents), digits and apostrophes: a word, or a syllable in syllable languages.
const UNIT = /[\p{L}\p{M}\p{N}'’]+/gu
const SENTENCE_END = /[.!?…]+|\n+/g

type Unit = { text: string; start: number; end: number }
type Word = { text: string; lower: string; start: number; end: number; units: Unit[]; entries: Entry[] }
type Sentence = { units: Unit[]; words: Word[] }
type PronounMatch = { text: string; lower: string; start: number; end: number; person: PronounPerson; sentence: number }

type Context = {
  text: string
  options: CheckOptions
  meta: LanguageMeta
  config: CheckerConfig
  sentences: Sentence[]
  dict: Dictionary
  rows: () => Promise<PronounRow[]>
  pronounMatches: () => PronounMatch[]
  suggestRegional: (word: Word, region: string) => Promise<string[]>
}

const quote = (s: string) => `“${s}”`
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
const listOf = (items: string[], conjunction = 'and') =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} ${conjunction} ${items[items.length - 1]}`
// Keeps a capital first letter when replacing a capitalized word ("Tôi" → "Con").
const matchCase = (original: string, replacement: string) =>
  original.charAt(0) !== original.charAt(0).toLowerCase() ? replacement.charAt(0).toUpperCase() + replacement.slice(1) : replacement
// Without accents, for finding the accented forms of a syllable: "không" → "khong", "đi" → "di".
const plain = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').normalize('NFC')
const unique = <T>(items: T[]) => [...new Set(items)]

function units(text: string): Unit[] {
  return [...text.matchAll(UNIT)].map((m) => ({ text: m[0], start: m.index!, end: m.index! + m[0].length }))
}

function sentencesOf(text: string, all: Unit[]): Unit[][] {
  const ends = [...text.matchAll(SENTENCE_END)].map((m) => m.index!)
  const out: Unit[][] = [[]]
  let next = 0
  for (const u of all) {
    while (next < ends.length && ends[next] < u.start) {
      if (out[out.length - 1].length) out.push([])
      next++
    }
    out[out.length - 1].push(u)
  }
  return out.filter((s) => s.length)
}

// Units join into one word only when just spaces separate them ("thịt heo", not "thịt, heo").
const joined = (text: string, a: Unit, b: Unit) => /^[^\S\n]+$/.test(text.slice(a.end, b.start))

// Longest match against the dictionary: at each position, the longest run of units that's a headword
// ("kết quả" is one word, so its "quả" isn't checked on its own). Unknown single units become words with
// no entries.
async function segment(text: string, list: Unit[], maxUnits: number, lookup: (phrase: string) => Promise<Entry[]>) {
  const words: Word[] = []
  for (let i = 0; i < list.length; ) {
    let taken: Word | null = null
    for (let k = Math.min(maxUnits, list.length - i); k >= 1; k--) {
      const span = list.slice(i, i + k)
      if (span.some((u, j) => j > 0 && !joined(text, span[j - 1], u))) continue
      const phrase = span.map((u) => u.text).join(' ')
      const entries = /\d/.test(phrase) ? [] : await lookup(phrase)
      if (entries.length || k === 1) {
        const start = span[0].start
        const end = span[k - 1].end
        taken = { text: text.slice(start, end), lower: phrase.toLowerCase(), start, end, units: span, entries }
        break
      }
    }
    words.push(taken!)
    i += taken!.units.length
  }
  return words
}

// --- Rules -----------------------------------------------------------------------------------------------

// Spelling and accents, for languages written in syllables with a syllable list: a syllable that isn't in
// the language is flagged, with the accented forms it could be ("khong" → "không"). Plain-letter
// syllables with no accented form are left alone: usually a name or a foreign word ("email").
async function spelling(ctx: Context): Promise<CheckIssue[]> {
  if (ctx.config.units !== 'syllables' || !ctx.meta.syllables) return []
  const syllables = await ctx.dict.syllables()
  const byPlain = new Map<string, string[]>()
  for (const s of Object.keys(syllables)) byPlain.set(plain(s), [...(byPlain.get(plain(s)) ?? []), s])
  for (const list of byPlain.values()) list.sort((a, b) => syllables[b] - syllables[a])
  const issues: CheckIssue[] = []
  for (const word of ctx.sentences.flatMap((s) => s.words)) {
    if (word.entries.length) continue
    for (const u of word.units) {
      const lower = u.text.toLowerCase().replace(/[’']/g, '')
      if (/\d/.test(lower) || lower in syllables) continue
      const candidates = (byPlain.get(plain(lower)) ?? []).slice(0, 3)
      const accented = lower !== plain(lower)
      if (!candidates.length && !accented) continue
      issues.push({
        rule: 'spelling',
        // Missing accents on plain letters is the common learner slip; a wrong accent is more surely wrong.
        severity: accented ? 'error' : 'warning',
        start: u.start,
        end: u.end,
        text: u.text,
        message: candidates.length
          ? `${quote(u.text)} isn't a ${ctx.meta.name} syllable. Did you mean ${listOf(candidates.map((c) => quote(matchCase(u.text, c))), 'or')}?`
          : `${quote(u.text)} isn't a ${ctx.meta.name} syllable. Check the spelling and accents.`,
        suggestions: candidates.map((c) => matchCase(u.text, c)),
      })
    }
  }
  return issues
}

// Words from another region: a word whose main meaning (its first sense) is tagged for regions that don't
// include the text's region. With `region`, against that; without, against the regions most of the text's
// regional words share (so "lợn" stands out in otherwise Southern text). Words with an untagged main
// meaning are never flagged (Vietnamese "má" is "cheek" everywhere, "mother" only in the South).
async function dialect(ctx: Context): Promise<CheckIssue[]> {
  const all = new Set(ctx.meta.regions)
  const regional = ctx.sentences
    .flatMap((s) => s.words)
    .map((word) => ({ word, sense: word.entries[0]?.senses[0] }))
    .filter((x): x is { word: Word; sense: Entry['senses'][number] } =>
      Boolean(x.sense?.regionTagged && x.sense.regions.length < all.size))
  if (!regional.length) return []

  const issue = (word: Word, regions: string[], message: string, suggestions: string[], severity: CheckIssue['severity']): CheckIssue => ({
    rule: 'dialect',
    severity,
    start: word.start,
    end: word.end,
    text: word.text,
    message: `${quote(word.text)} is ${listOf(regions)}${message}` +
      // The best word only; the others (often niche: Southern "cúi", "ỉn" after "heo") are in suggestions.
      (suggestions.length ? `, say ${quote(suggestions[0])}.` : '.'),
    suggestions,
  })

  if (ctx.options.region) {
    const target = resolveRegion(ctx.meta, ctx.options.region)!
    const where = listOf(ctx.meta.regions.filter((r) => target.has(r)))
    const issues: CheckIssue[] = []
    for (const { word, sense } of regional) {
      if (sense.regions.some((r) => target.has(r))) continue
      const suggestions = await ctx.suggestRegional(word, ctx.options.region)
      issues.push(issue(word, sense.regions, `; in ${where} ${ctx.meta.name}`, suggestions, 'warning'))
    }
    return issues
  }

  // No region given: the regions most regional words share are the text's region, and words that fit none
  // of them stand out. When no region has a majority but some words can't go together ("lợn", Northern,
  // with "nha", Central and Southern), every regional word is pointed out, without a guess.
  const counts = new Map<string, number>()
  for (const { sense } of regional) for (const r of sense.regions) counts.set(r, (counts.get(r) ?? 0) + 1)
  const most = Math.max(...counts.values())
  const majority = new Set([...counts].filter(([, n]) => n === most).map(([r]) => r))
  const outliers = regional.filter(({ sense }) => !sense.regions.some((r) => majority.has(r)))
  if (outliers.length) {
    const where = ctx.meta.regions.filter((r) => majority.has(r))
    return Promise.all(outliers.map(async ({ word, sense }) =>
      issue(word, sense.regions, `, but the rest of the text is ${listOf(where)}; there`, await ctx.suggestRegional(word, where[0]), 'suggestion')))
  }
  const clash = regional.some((a) => regional.some((b) => !a.sense.regions.some((r) => b.sense.regions.includes(r))))
  if (!clash) return []
  const mixed = listOf(regional.map(({ word, sense }) => `${quote(word.text)} (${listOf(sense.regions)})`))
  return regional.map(({ word, sense }) =>
    issue(word, sense.regions, `. This text mixes regions: ${mixed}. Pick one region`, [], 'suggestion'))
}

// Pronouns that don't fit who you're talking to (`listener`) or about (`about`): "tôi" to a parent, where
// it's "con". Only the language's reliable pronouns are checked (CheckerConfig.pronouns); ones that are
// also common nouns ("bạn": friend) only get a hedged suggestion.
async function pronounRelationship(ctx: Context): Promise<CheckIssue[]> {
  if (!ctx.options.listener && !ctx.options.about) return []
  const rows = await ctx.rows()
  const issues: CheckIssue[] = []
  for (const m of ctx.pronounMatches()) {
    const about = ABOUT_PERSONS.has(m.person)
    const row = rows.find((r) => r.id === (about ? ctx.options.about : ctx.options.listener))
    const fit = unique((row?.[m.person] ?? []).map((c) => c.word))
    if (!row || !fit.length || fit.includes(m.lower)) continue
    const ambiguous = ctx.config.ambiguousPronouns?.includes(m.lower)
    const who = `${about ? 'Talking about' : 'Talking to'} ${lowerFirst(row.label)}`
    issues.push({
      rule: 'pronoun-relationship',
      severity: ambiguous ? 'suggestion' : 'warning',
      start: m.start,
      end: m.end,
      text: m.text,
      message:
        (ambiguous ? `If ${quote(m.text)} means “${PERSON_NAMES[m.person]}” here: ${lowerFirst(who)}` : who) +
        `, say ${listOf(fit.map(quote), 'or')} for “${PERSON_NAMES[m.person]}”, not ${quote(m.text)}.`,
      suggestions: fit.map((w) => matchCase(m.text, w)),
    })
  }
  return issues
}

// "I" and "you" pronouns that never go together (Vietnamese "tao" goes with "mày", not "bạn"): no row of the
// pronoun table has both. Only when no listener is given; with one, pronoun-relationship covers it.
async function pronounPair(ctx: Context): Promise<CheckIssue[]> {
  if (ctx.options.listener) return []
  const matches = ctx.pronounMatches()
  const selves = matches.filter((m) => SELF_PERSONS.has(m.person))
  const yous = matches.filter((m) => ADDRESSEE_PERSONS.has(m.person))
  if (!selves.length || !yous.length) return []
  const rows = await ctx.rows()
  const words = (r: PronounRow, persons: Set<PronounPerson>) => [...persons].flatMap((p) => r[p].map((c) => c.word))
  const issues: CheckIssue[] = []
  for (const you of yous) {
    for (const me of selves) {
      const withMe = rows.filter((r) => words(r, SELF_PERSONS).includes(me.lower))
      if (!withMe.length || withMe.some((r) => words(r, ADDRESSEE_PERSONS).includes(you.lower))) continue
      const partners = unique(withMe.flatMap((r) => r[you.person].map((c) => c.word)))
      issues.push({
        rule: 'pronoun-pair',
        severity: ctx.config.ambiguousPronouns?.includes(you.lower) ? 'suggestion' : 'warning',
        start: you.start,
        end: you.end,
        text: you.text,
        message: `${quote(me.text)} and ${quote(you.text)} don't go together` +
          (partners.length ? `: with ${quote(me.text)}, say ${listOf(partners.map(quote), 'or')}.` : '.'),
        suggestions: partners.map((w) => matchCase(you.text, w)),
      })
      break
    }
  }
  return issues
}

// Polite endings when speaking up (the listener's row is marked `respect`): Vietnamese sentences to parents,
// elders and teachers usually end in "ạ". A suggestion, not an error: it isn't always needed.
async function politeEnding(ctx: Context): Promise<CheckIssue[]> {
  const endings = ctx.config.politeEndings ?? []
  if (!ctx.options.listener || !endings.length) return []
  const row = (await ctx.rows()).find((r) => r.id === ctx.options.listener)
  if (!row?.respect) return []
  const issues: CheckIssue[] = []
  for (const s of ctx.sentences) {
    const last = s.units[s.units.length - 1]
    if (endings.includes(last.text.toLowerCase())) continue
    // Exclamations ("Con nhớ má quá!") are often fine without it.
    if (/^[^\p{L}\p{N}]*!/u.test(ctx.text.slice(last.end))) continue
    issues.push({
      rule: 'polite-ending',
      severity: 'suggestion',
      start: last.start,
      end: last.end,
      text: last.text,
      message: `Talking to ${lowerFirst(row.label)}, end the sentence with ${listOf(endings.map(quote), 'or')} to sound polite.`,
      suggestions: endings.map((e) => `${last.text} ${e}`),
    })
  }
  return issues
}

const RULES: Record<CheckRule, (ctx: Context) => Promise<CheckIssue[]>> = {
  spelling,
  dialect,
  'pronoun-relationship': pronounRelationship,
  'pronoun-pair': pronounPair,
  'polite-ending': politeEnding,
}

const SEVERITY_ORDER = { error: 0, warning: 1, suggestion: 2 }

export function createChecker(options: CheckerOptions = {}): Checker {
  const cache = new Map<string, Dictionary>()
  const dict = (lang: string) => {
    let d = cache.get(lang)
    if (!d) {
      d = options.dictionary?.(lang) ?? createDictionary({ lang, baseUrl: options.baseUrl?.(lang), load: options.load?.(lang) })
      cache.set(lang, d)
    }
    return d
  }
  const translator = createTranslator({ ...options, dictionary: dict })
  const lookups = new Map<string, Promise<Entry[]>>()

  return {
    async check(input, opts) {
      const text = input.normalize('NFC')
      const d = dict(opts.lang)
      const [meta, config] = await Promise.all([d.meta(), d.checker()])
      // Unknown listener/about ids throw, listing the valid ones (as the translator does).
      if (meta.pronouns) {
        if (opts.listener) await d.pronouns({ listener: opts.listener })
        if (opts.about) await d.pronouns({ listener: opts.about })
      }
      const lookup = (phrase: string) => {
        const key = `${opts.lang}\u0000${phrase}`
        let pending = lookups.get(key)
        if (!pending) {
          pending = d.lookup(phrase)
          lookups.set(key, pending)
        }
        return pending
      }
      const sentences: Sentence[] = []
      for (const list of sentencesOf(text, units(text))) {
        sentences.push({ units: list, words: await segment(text, list, config.maxWordUnits ?? 3, lookup) })
      }

      let rows: Promise<PronounRow[]> | undefined
      let matches: PronounMatch[] | undefined
      const ctx: Context = {
        text,
        options: opts,
        meta,
        config,
        sentences,
        dict: d,
        rows: () => (rows ??= meta.pronouns ? d.pronouns({ region: opts.region, speaker: opts.speaker }) : Promise.resolve([])),
        // The language's reliable pronouns in the text, longest first ("chúng tôi" before "tôi"), matched on
        // units directly so pronouns the dictionary doesn't list as one word ("tụi mày") are found too.
        pronounMatches: () => (matches ??= findPronouns(text, sentences, config)),
        suggestRegional: async (word, region) => {
          try {
            const [group] = await translator.translate(word.lower, {
              from: opts.lang, to: opts.lang, toRegion: region, pos: word.entries[0]?.pos, limit: 3,
            })
            return (group?.translations ?? []).map((t) => t.word).filter((w) => w !== word.lower)
          } catch {
            return []
          }
        },
      }
      const results = await Promise.all(
        (Object.keys(RULES) as CheckRule[]).filter((r) => opts.rules?.[r] !== false).map((r) => RULES[r](ctx)),
      )
      const issues = results.flat().sort((a, b) => a.start - b.start || SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
      return { text, issues }
    },
  }
}

function findPronouns(text: string, sentences: Sentence[], config: CheckerConfig): PronounMatch[] {
  const byWord = new Map<string, PronounPerson>()
  for (const person of PRONOUN_PERSONS) for (const w of config.pronouns?.[person] ?? []) byWord.set(w.toLowerCase(), person)
  if (!byWord.size) return []
  const longest = Math.max(...[...byWord.keys()].map((w) => w.split(' ').length))
  const out: PronounMatch[] = []
  sentences.forEach((s, sentence) => {
    for (let i = 0; i < s.units.length; ) {
      let step = 1
      for (let k = Math.min(longest, s.units.length - i); k >= 1; k--) {
        const span = s.units.slice(i, i + k)
        if (span.some((u, j) => j > 0 && !joined(text, span[j - 1], u))) continue
        const lower = span.map((u) => u.text.toLowerCase()).join(' ')
        const person = byWord.get(lower)
        if (person) {
          out.push({ text: text.slice(span[0].start, span[k - 1].end), lower, start: span[0].start, end: span[k - 1].end, person, sentence })
          step = k
          break
        }
      }
      i += step
    }
  })
  return out
}
