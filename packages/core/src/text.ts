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
  { fixed = [], forms: given = [], perUnit, max }: { fixed?: boolean[]; forms?: (string[] | undefined)[]; perUnit: number; max: number },
): string[] {
  const choices = written.map((w, i) => {
    const lower = w.toLowerCase()
    if (fixed[i]) return [lower]
    // `forms[i]`, when given, replaces the accent forms (e.g. spellingCandidates, with letter changes too).
    const forms = (given[i] ?? byPlain.get(plain(lower)) ?? []).slice(0, perUnit)
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

// The letters a plain-letter typo can be changed to (accents come from the syllable list afterwards).
const LETTERS = 'abcdefghijklmnopqrstuvwxyz'
// A syllable's accent marks, as a multiset of combining characters ("muốn": circumflex, acute).
const marksOf = (s: string) => [...s.normalize('NFD')].filter((c) => /\p{M}/u.test(c))

/**
 * The syllables a misspelled one could be, best first: the same letters with other accents ("khong" →
 * "không"), and one letter changed: missing, extra, wrong or two swapped ("khôg", "khôngg" → "không";
 * "tihch" → "thích"; "ơm" → "ơn"), each with any accents. First, same-letter fixes keeping every accent mark
 * the writer typed ("ngừoi" → "người": the marks were on the wrong letter). Then candidates keeping more of
 * the writer's marks ("muốm" → "muốn", not "muỗm"; "ơm" → "ơn", not "ôm"); then accent-only fixes, then changes between
 * letters often confused (`similar`: groups like "ckq", counted as half a change: "họk" → "học", not "họ"),
 * then other letter changes, then the more common syllable. Letter changes only give syllables at least
 * `minZipf` common. `edits` is 0, 0.5 or 1; `marks` how well the writer's accent marks are kept.
 */
export function spellingCandidates(
  written: string,
  syllables: Record<string, number>,
  byPlain: Map<string, string[]>,
  { limit, minZipf = 3, similar = [] }: { limit: number; minZipf?: number; similar?: string[] },
): { word: string; edits: number; marks: number }[] {
  const lower = written.toLowerCase()
  const base = plain(lower)
  const alike = (x: string, y: string) => similar.some((g) => g.includes(x) && g.includes(y))
  // Each one-letter change of the plain letters, with its cost: half for letters often confused.
  const variants = new Map<string, number>()
  const add = (v: string, cost: number) => {
    if (v !== base && cost < (variants.get(v) ?? Infinity)) variants.set(v, cost)
  }
  for (let i = 0; i <= base.length; i++) {
    const [a, b] = [base.slice(0, i), base.slice(i)]
    if (b) add(a + b.slice(1), 1)
    if (b.length > 1) add(a + b[1] + b[0] + b.slice(2), 1)
    for (const c of LETTERS) {
      if (b) add(a + c + b.slice(1), alike(b[0], c) ? 0.5 : 1)
      add(a + c + b, 1)
    }
  }
  const found = new Map<string, number>()
  for (const w of byPlain.get(base) ?? []) if (w !== lower) found.set(w, 0)
  for (const [v, cost] of variants) {
    for (const w of byPlain.get(v) ?? []) {
      if ((syllables[w] ?? 0) >= minZipf && cost < (found.get(w) ?? Infinity)) found.set(w, cost)
    }
  }
  const mine = marksOf(lower)
  // How a candidate keeps the writer's marks: how many it shares, and a score where missing or extra marks
  // count down (0 when the writer typed none, so plain-letter writing isn't held against any candidate).
  const keep = (w: string) => {
    const left = marksOf(w)
    let shared = 0
    for (const m of mine) {
      const at = left.indexOf(m)
      if (at >= 0) {
        shared++
        left.splice(at, 1)
      }
    }
    return { all: shared === mine.length, score: mine.length ? shared - (mine.length - shared) - left.length : 0 }
  }
  return [...found]
    .map(([word, edits]) => {
      const k = keep(word)
      // Tier 0: same letters, every typed mark kept (accents only moved or added).
      return { word, edits, tier: edits === 0 && k.all ? 0 : 1, marks: k.score, zipf: syllables[word] ?? 0 }
    })
    .sort((a, b) => a.tier - b.tier || b.marks - a.marks || a.edits - b.edits || b.zipf - a.zipf)
    .slice(0, limit)
    .map(({ word, edits, tier, marks }) => ({ word, edits, marks: marks - tier * 100 }))
}
