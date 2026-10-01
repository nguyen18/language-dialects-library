// Splitting text into units, sentences and dictionary words: shared by the checker, sentence frames and
// the journal review. Language-general: units are runs of letters and digits; a language written in
// syllables groups them into dictionary words by longest match (CheckerConfig.units / maxWordUnits).

import type { Entry } from './types.ts'

// A run of letters (with their accents), digits and apostrophes: a word, or a syllable in syllable languages.
export const UNIT = /[\p{L}\p{M}\p{N}'’]+/gu
export const SENTENCE_END = /[.!?…]+|\n+/g

export type Unit = { text: string; start: number; end: number }
export type Word = { text: string; lower: string; start: number; end: number; units: Unit[]; entries: Entry[] }

export function units(text: string): Unit[] {
  return [...text.matchAll(UNIT)].map((m) => ({ text: m[0], start: m.index!, end: m.index! + m[0].length }))
}

/** Units grouped into sentences, which end at . ! ? … or a line break. */
export function sentencesOf(text: string, all: Unit[]): Unit[][] {
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

/** Units join into one word only when just spaces separate them ("thịt heo", not "thịt, heo"). */
export const joined = (text: string, a: Unit, b: Unit) => /^[^\S\n]+$/.test(text.slice(a.end, b.start))

/**
 * Longest match against the dictionary: at each position, the longest run of units that's a headword
 * ("kết quả" is one word, so its "quả" isn't checked on its own). Unknown single units become words with
 * no entries.
 */
export async function segment(text: string, list: Unit[], maxUnits: number, lookup: (phrase: string) => Promise<Entry[]>) {
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

/** Without accents: "không" → "khong", "đi" → "di". */
export const plain = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').normalize('NFC')

/** Keeps a capital first letter when replacing a capitalized word ("Tôi" → "Con"). */
export const matchCase = (original: string, replacement: string) =>
  original.charAt(0) !== original.charAt(0).toLowerCase() ? replacement.charAt(0).toUpperCase() + replacement.slice(1) : replacement

// Syllables grouped by their plain form, most common first: "khong" → ["không", "khống", …]. Built once
// per syllable list.
const byPlainCache = new WeakMap<Record<string, number>, Map<string, string[]>>()

/** A language's syllables grouped by their form without accents, most common first. */
export function syllablesByPlain(syllables: Record<string, number>): Map<string, string[]> {
  let byPlain = byPlainCache.get(syllables)
  if (!byPlain) {
    byPlain = new Map()
    for (const s of Object.keys(syllables)) byPlain.set(plain(s), [...(byPlain.get(plain(s)) ?? []), s])
    for (const list of byPlain.values()) list.sort((a, b) => syllables[b] - syllables[a])
    byPlainCache.set(syllables, byPlain)
  }
  return byPlain
}

/**
 * Ways to write a run of syllables with other accents ("hom nay" → "hôm nay", "hơm nay", …): each
 * syllable's forms that share its letters (the most common `perUnit`, plus the syllable as written), in
 * every combination, the ones made of more common forms first, at most `max`. Syllables that mustn't
 * change (`fixed[i]`) keep their written form. The written run itself is included.
 */
export function accentCombinations(
  written: string[],
  byPlain: Map<string, string[]>,
  { fixed = [], perUnit, max }: { fixed?: boolean[]; perUnit: number; max: number },
): string[] {
  const choices = written.map((w, i) => {
    const lower = w.toLowerCase()
    if (fixed[i]) return [lower]
    const forms = (byPlain.get(plain(lower)) ?? []).slice(0, perUnit)
    return forms.includes(lower) ? forms : [...forms, lower]
  })
  // Every combination with the sum of its forms' ranks: lower sums are made of more common forms.
  let combos: { words: string[]; rank: number }[] = [{ words: [], rank: 0 }]
  for (const options of choices) {
    combos = combos.flatMap((c) => options.map((o, r) => ({ words: [...c.words, o], rank: c.rank + r })))
  }
  return combos
    .sort((a, b) => a.rank - b.rank)
    .slice(0, max)
    .map((c) => c.words.join(' '))
}
