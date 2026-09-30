// The pronoun table: how to say "I", "you", "he/she", "we", plural "you" and "they" depending on who
// you're talking to (or about).
//
// Vietnamese pronouns name the relationship ("con" = I, talking to a parent; "anh" = you, an older man),
// and Wiktionary defines them that way: "I/me, your X" or "you, my X". A language config lists the
// table's rows and, for each cell, which words' definitions fit it; the build takes region, labels and
// the definition from the matching sense. Rules cover regular compounds the dictionary doesn't list
// ("các" + "anh" = plural "you"), and overrides cover what no definition says (Vietnamese "em" is only
// defined as "refers to any person described by the noun em", never "I").

import { PRONOUN_PERSONS, type Entry, type PronounChoice, type PronounRow, type Sense } from '../packages/core/src/types.ts'
import type { PronounPick, PronounRowConfig } from './language-config.ts'

export type PronounReport = { fromGlosses: number; rules: number; overrides: number; problems: string[] }

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
  const report: PronounReport = { fromGlosses: 0, rules: 0, overrides: 0, problems: [] }
  if (rows.filter((r) => r.default).length > 1) report.problems.push('more than one default row')

  const pick = (where: string, p: PronounPick): PronounChoice | null => {
    const extra = {
      ...(p.speaker ? { speaker: p.speaker } : {}),
      ...(p.gender ? { gender: p.gender } : {}),
      ...(p.inclusive !== undefined ? { inclusive: p.inclusive } : {}),
      ...(p.note ? { note: p.note } : {}),
    }
    if (!p.gloss) {
      // A rule is for compounds the dictionary doesn't define; if it defines one, use the definition.
      if (p.rule && senses.has(p.word)) report.problems.push(`${where}: "${p.word}" is in the dictionary; use a gloss pick instead of a rule`)
      if (p.rule) report.rules++
      else report.overrides++
      return {
        word: p.word,
        source: p.rule ? 'rule' : 'override',
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
    report.problems.push(`${where}: no definition of ${p.word} matches ${p.gloss}`)
    return null
  }

  const out = rows.map((r) => {
    const row = { id: r.id, label: r.label } as PronounRow
    for (const person of PRONOUN_PERSONS) {
      row[person] = (r[person] ?? []).map((p) => pick(`${r.id}.${person}`, p)).filter((c) => c !== null)
    }
    if (r.default) row.default = true
    if (r.warning) row.warning = r.warning
    return row
  })
  return { rows: out, report }
}
