// The pronoun table: how to say "I" and "you" depending on who you're talking to.
//
// Vietnamese pronouns name the relationship ("con" = I, talking to a parent; "anh" = you, an older man),
// and Wiktionary defines them that way: "I/me, your X" or "you, my X". A language config lists the
// table's rows and, for each cell, which words' definitions fit it; the build takes region, labels and
// the definition from the matching sense. Overrides cover what no definition says (Vietnamese "em" is
// only defined as "refers to any person described by the noun em", never "I").

import type { PronounChoice, PronounRow, Entry, Sense } from '../packages/core/src/types.ts'
import type { PronounPick, PronounRowConfig } from './language-config.ts'

export type PronounReport = { fromGlosses: number; overrides: number; unmatched: string[] }

// Pronoun senses, plus variant senses of pronouns ("tui": alternative form of "tôi").
const PRONOUN_POS = new Set(['pron'])

export function buildPronounTable(
  entries: Entry[],
  rows: PronounRowConfig[],
  allRegions: string[],
): { rows: PronounRow[]; report: PronounReport } {
  const senses = new Map<string, Sense[]>()
  for (const e of entries) {
    if (!PRONOUN_POS.has(e.pos)) continue
    senses.set(e.word, [...(senses.get(e.word) ?? []), ...e.senses])
  }
  const report: PronounReport = { fromGlosses: 0, overrides: 0, unmatched: [] }

  const pick = (row: string, side: string, p: PronounPick): PronounChoice | null => {
    const extra = { ...(p.speaker ? { speaker: p.speaker } : {}), ...(p.note ? { note: p.note } : {}) }
    if (!p.gloss) {
      report.overrides++
      return {
        word: p.word,
        source: 'override',
        regions: p.regions ?? allRegions,
        regionTagged: Boolean(p.regions),
        labels: p.labels ?? [],
        ...extra,
      }
    }
    for (const s of senses.get(p.word) ?? []) {
      const gloss = s.glosses.find((g) => p.gloss!.test(g))
      if (!gloss) continue
      report.fromGlosses++
      return { word: p.word, gloss, source: 'gloss', regions: s.regions, regionTagged: s.regionTagged, labels: s.labels, ...extra }
    }
    // Wiktionary rewords definitions; a pick that stops matching is reported, not silently dropped.
    report.unmatched.push(`${row}.${side}: ${p.word} ${p.gloss}`)
    return null
  }

  const out = rows.map((r) => ({
    id: r.id,
    label: r.label,
    self: r.self.map((p) => pick(r.id, 'self', p)).filter((c) => c !== null),
    addressee: r.addressee.map((p) => pick(r.id, 'addressee', p)).filter((c) => c !== null),
    ...(r.warning ? { warning: r.warning } : {}),
  }))
  return { rows: out, report }
}
