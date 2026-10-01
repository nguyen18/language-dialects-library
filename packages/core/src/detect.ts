// Which language each word of a mixed text is in: the target language or the learner's own (the base,
// English by default), from the two languages' data alone. Shared by the checker and the journal review.

import type { Dictionary } from './index.ts'
import { plain, type Unit } from './text.ts'
import type { Translator } from './translate.ts'

/**
 * Marks each unit (of one sentence) with `lang` or `base`. A unit the target knows and the base doesn't
 * is the target's, and the other way round; units both or neither know ("an", "to", names) take the
 * nearest decided neighbors' language when they agree. When they don't, the target's, unless the word is
 * far more common in the base (the text is mainly the target language: Vietnamese "an" stays Vietnamese
 * next to English "the", and "tui" between "but" and "không"). In languages written in syllables, a base
 * word that's a target syllable only once accents are added ("but": bút) is the base's; a word only the
 * target knows without its accents ("khong") is still the target's. The base is known through the translator, so
 * inflected forms count ("went", "cooked").
 */
// Zipf points by which a word between the two languages must be more common in the base to count as base.
const BASE_MARGIN = 2

export async function markLanguages(
  list: Unit[],
  o: { lang: string; base: string; target: Dictionary; baseDictionary: Dictionary; translator: Translator },
): Promise<string[]> {
  const syllables = await o.target.syllables()
  const syllableLanguage = Object.keys(syllables).length > 0
  const plainSyllables = syllableLanguage ? new Set(Object.keys(syllables).map(plain)) : new Set<string>()
  // 'exact': a target word as written; 'accents': one only with accents added ("khong" → "không").
  const targetKnows = async (u: Unit): Promise<'exact' | 'accents' | false> => {
    const lower = u.text.toLowerCase()
    if (!syllableLanguage) return (await o.target.lookup(lower)).length > 0 ? 'exact' : false
    if (lower in syllables || lower !== plain(lower)) return 'exact'
    return plainSyllables.has(lower) ? 'accents' : false
  }
  const baseKnows = async (u: Unit) => (await o.translator.senses(u.text, { from: o.base }).catch(() => [])).length > 0
  const marks = await Promise.all(list.map(async (u) => {
    if (/\d/.test(u.text)) return '?'
    const [t, b] = await Promise.all([targetKnows(u), baseKnows(u)])
    if (t === 'exact') return b ? '?' : o.lang
    if (b) return o.base
    return t === 'accents' ? o.lang : '?'
  }))
  // How common a word is in each language (Zipf; 0 when unknown).
  const targetFrequency = async (u: Unit) => {
    const lower = u.text.toLowerCase()
    if (syllableLanguage) return syllables[lower] ?? 0
    return (await o.target.lookup(lower))[0]?.frequency ?? 0
  }
  const baseFrequency = async (u: Unit) => (await o.baseDictionary.lookup(u.text.toLowerCase()))[0]?.frequency ?? 0
  return Promise.all(marks.map(async (m, i) => {
    if (m !== '?') return m
    const left = marks.slice(0, i).reverse().find((x) => x !== '?')
    const right = marks.slice(i + 1).find((x) => x !== '?')
    if (left && right && left !== right) {
      return (await baseFrequency(list[i])) - (await targetFrequency(list[i])) >= BASE_MARGIN ? o.base : o.lang
    }
    return left ?? right ?? o.lang
  }))
}
