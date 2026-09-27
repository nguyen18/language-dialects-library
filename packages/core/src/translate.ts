// Translating English words with their part of speech and meaning in mind, using the English data
// package alongside a target language. See README "Translating with context".

import { compatiblePos } from './pos.ts'
import { normalizeEnglish, type Hit } from './types.ts'
import { createDictionary, DEFAULT_EXCLUDED_LABELS, type Dictionary, type DictionaryOptions } from './index.ts'

/** One reading of an English word: a base word and part of speech, with its English meanings. */
export type EnglishReading = {
  /** The base word the reading is about, e.g. "say" for "said", "though" for "tho". */
  lemma: string
  pos: string
  /** English definitions of this reading, most common first. */
  glosses: string[]
  /** How the typed word relates to the lemma when they differ, e.g. "simple past of say". */
  via?: string
  /** true when every English meaning of this reading is informal, slang, dialectal, rare or nonstandard. */
  marginal: boolean
}

export type TranslationGroup = EnglishReading & {
  /** Ways to say this reading in the target language, best first. */
  hits: Hit[]
}

export type TranslateOptions = {
  /** Region or region group of the target language, e.g. "Southern" or "Latin America". */
  region?: string
  /** Only this English part of speech, e.g. "verb" for "can" (be able to) rather than "noun" (a tin). */
  pos?: string
  /**
   * Words describing the meaning you want, e.g. "awesome" for "cool". Readings and results whose
   * definitions share these words rank first ("cool (awesome; great)" over "cool" as in temperature).
   */
  meaning?: string
  /** Labels to leave out of results (default DEFAULT_EXCLUDED_LABELS). */
  exclude?: string[]
  /** Maximum results per reading (default 5). */
  limit?: number
}

export type Translator = {
  /** The readings of an English word, following forms and spellings to base words. */
  readings(term: string): Promise<EnglishReading[]>
  /** Translations grouped by English reading, in the English dictionary's order (or best match for `meaning` first). */
  translate(term: string, options?: TranslateOptions): Promise<TranslationGroup[]>
}

export type TranslatorOptions = Omit<DictionaryOptions, 'lang'> & {
  /** Target language code, e.g. "vi" or "es". */
  lang: string
  /** The English dictionary; created with the same loading options if omitted. */
  english?: Dictionary
  /** The target dictionary; created from `lang` if omitted. */
  target?: Dictionary
}

// Words too common to say anything about a meaning.
const STOPWORDS = new Set(
  'a an the to of or and in on for with by as at from that this be is are it its used use any some one something someone very more most'.split(' '),
)

function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z']+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  )
}

function overlap(a: Set<string>, text: string): number {
  let n = 0
  for (const w of words(text)) if (a.has(w)) n++
  return n
}

// Search terms from English definitions, for readings the target has no direct match for:
// "(modal) To be able to; may" -> ["be able to", "may"].
function termsFromGlosses(glosses: string[]): string[] {
  const terms: string[] = []
  for (const g of glosses.slice(0, 3)) {
    const cleaned = g.replace(/\([^)]*\)/g, ' ').replace(/[.“”"]/g, '')
    for (const part of cleaned.split(/[;,]/)) {
      const t = normalizeEnglish(part)
      if (t && t.split(' ').length <= 4 && /^[a-z][a-z' -]*$/.test(t)) terms.push(t)
    }
  }
  return [...new Set(terms)]
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

// Readings whose English meanings all carry these labels rank after mainstream readings.
const MARGINAL_LABELS = new Set(['informal', 'slang', 'colloquial', 'dialectal', 'rare', 'nonstandard', 'Internet', 'humorous'])

// A variant sense whose gloss points at another word ("plural of cat", "misspelling of don't",
// "contraction of going to") rather than defining it. Variants with their own definition are kept.
const FORM_GLOSS = /\b(of|for)\b/

export function createTranslator(options: TranslatorOptions): Translator {
  const { lang, english: givenEnglish, target: givenTarget, ...loading } = options
  const english = givenEnglish ?? createDictionary({ ...loading, lang: 'en' })
  const target = givenTarget ?? createDictionary({ ...loading, lang })

  async function readings(term: string, depth = 0, via?: string): Promise<EnglishReading[]> {
    const word = term.trim()
    const entries = [...(await english.lookup(word)), ...(word !== word.toLowerCase() ? await english.lookup(word.toLowerCase()) : [])]
    // Maybe a regular form ("walked", "running"): its base word is read too, after the word's own
    // entries ("running" the adjective, then "run"). Of the candidates the dictionary knows, the one with
    // the most senses wins, so "running" -> "run" beats the obscure "runn".
    let base: { word: string; entries: typeof entries } | null = null
    if (depth === 0) {
      let best = 0
      for (const candidate of regularBaseForms(word)) {
        const found = await english.lookup(candidate)
        const senses = found.reduce((n, e) => n + e.senses.length, 0)
        if (senses > best) {
          best = senses
          base = { word: candidate, entries: found }
        }
      }
    }
    const result: EnglishReading[] = []
    const byKey = new Map<string, EnglishReading>()
    const add = (r: EnglishReading) => {
      const key = `${r.lemma}\u0000${r.pos}`
      const existing = byKey.get(key)
      if (existing) {
        existing.glosses.push(...r.glosses.filter((g) => !existing.glosses.includes(g)))
        existing.marginal &&= r.marginal
      }
      else {
        byKey.set(key, r)
        result.push(r)
      }
    }
    const sources = [
      ...entries.map((entry) => ({ entry, via })),
      ...(base?.entries ?? []).map((entry) => ({ entry, via: via ?? `form of ${base!.word}` })),
    ]
    for (const { entry, via } of sources) {
      for (const sense of entry.senses) {
        // A sense that points at another word ("simple past of say", "misspelling of don't"): follow it,
        // at most two hops (dont -> don't -> do not).
        if (sense.altOf && depth < 2 && FORM_GLOSS.test(sense.glosses[0] ?? '')) {
          for (const r of await readings(sense.altOf, depth + 1, via ?? sense.glosses[0])) add(r)
          continue
        }
        add({
          lemma: entry.word,
          pos: entry.pos,
          glosses: [...sense.glosses],
          marginal: sense.labels.some((l) => MARGINAL_LABELS.has(l)),
          ...(via ? { via } : {}),
        })
      }
    }
    return result
  }

  return {
    readings: (term) => readings(term),

    async translate(term, { region, pos, meaning, exclude = DEFAULT_EXCLUDED_LABELS, limit = 5 } = {}) {
      let found = await readings(term)
      // Words the English dictionary doesn't know are still searched directly.
      if (found.length === 0) found = [{ lemma: normalizeEnglish(term), pos: '', glosses: [], marginal: false }]
      if (pos) found = found.filter((r) => r.pos === pos)
      const wanted = meaning ? words(meaning) : null

      const groups: TranslationGroup[] = []
      for (const reading of found) {
        const search = (t: string, p?: string[]) =>
          target.searchEnglish(t, { region, pos: p, exclude, limit: 30 })
        const posFilter = reading.pos ? compatiblePos(reading.pos) : undefined
        let hits = await search(reading.lemma, posFilter)
        // No direct match: try the terms in its English definitions ("can" -> "be able to").
        if (hits.length === 0) {
          for (const t of termsFromGlosses(reading.glosses)) {
            hits = await search(t, posFilter)
            if (hits.length) break
          }
        }
        if (wanted) {
          const score = (h: Hit) => overlap(wanted, h.gloss)
          hits = hits.map((h, i) => ({ h, i, s: score(h) })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.h)
        }
        const seen = new Set<string>()
        hits = hits.filter((h) => !seen.has(h.word) && seen.add(h.word)).slice(0, limit)
        // Skip readings that add nothing new (a variant spelling with the same results as an earlier one).
        const key = hits.map((h) => h.word).join('\u0000')
        if (hits.length && !groups.some((g) => g.hits.map((h) => h.word).join('\u0000') === key)) {
          groups.push({ ...reading, hits })
        }
      }

      // Readings whose English definitions match the meaning come first; then mainstream readings
      // before informal/slang ones; otherwise the English dictionary's order.
      const score = (g: TranslationGroup) =>
        wanted ? overlap(wanted, g.glosses.join(' ')) + overlap(wanted, g.hits[0]?.gloss ?? '') : 0
      return groups
        .map((g, i) => ({ g, i, s: score(g) }))
        .sort((a, b) => b.s - a.s || Number(a.g.marginal) - Number(b.g.marginal) || a.i - b.i)
        .map((x) => x.g)
    },
  }
}
