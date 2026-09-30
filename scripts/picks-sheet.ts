// Review sheet for hand-picked words: machine-drafted, reviewed by a speaker of the language.
//
//   npm run picks-sheet -- <lang> [--top 100 | --words list.txt] [--out file.csv]
//   npm run picks-sheet -- <lang> --apply file.csv
//
// The sheet lists the most frequent English words (wordfreq) or the words in a file (one per line; a
// leading "12. " is ignored), with each meaning's current top 3 from the ranking alone (picks off),
// Wiktionary's translation-table words and the current pick. A speaker fills in `your_pick` only where
// the first choice is wrong: words separated by "/", a region in parentheses ("heo (Southern) / lợn").
// --apply prints config rows for the filled-in rows, to paste into languages/<lang>.ts `picks`.
// Works the same for every language; only the reviewing needs a speaker.

import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createTranslator, type PickRow } from '../packages/core/src/index.ts'
import { topWords } from './frequency.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const COLUMNS = ['english', 'pos', 'meaning', 'ranked_top3', 'table_words', 'current_pick', 'your_pick']

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') (cell += '"'), i++
      else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') row.push(cell), (cell = '')
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell), rows.push(row), (row = []), (cell = '')
    } else cell += ch
  }
  if (cell || row.length) row.push(cell), rows.push(row)
  return rows.filter((r) => r.some((c) => c.trim()))
}

const arg = (name: string) => {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function sheet(lang: string) {
  const load = (l: string) => async (p: string) => JSON.parse(await readFile(join(ROOT, 'packages', l, 'data', p), 'utf8'))
  const tr = createTranslator({ load })
  const listFile = arg('--words')
  const words = listFile
    ? (await readFile(listFile, 'utf8')).split('\n').map((l) => l.replace(/^\s*\d+\.\s*/, '').trim()).filter(Boolean)
    : await topWords(ROOT, 'en', 'large', Number(arg('--top') ?? 100))
  const picksFile = join(ROOT, 'packages', lang, 'data', 'picks.json')
  const picks: PickRow[] = existsSync(picksFile) ? JSON.parse(await readFile(picksFile, 'utf8')) : []

  const lines = [COLUMNS.join(',')]
  const seen = new Set<string>()
  let meanings = 0
  let picked = 0
  for (const word of words) {
    // The first few meanings, as the translator orders them without context, from the ranking alone.
    const groups = (await tr.translate(word, { from: 'en', to: lang, limit: 3, picks: false })).slice(0, 4)
    for (const g of groups) {
      const s = g.source
      const key = `${s.lemma}\u0000${s.pos}\u0000${s.glosses[0]}`
      if (seen.has(key)) continue
      seen.add(key)
      meanings++
      const current = picks.find((p) => p.word === s.lemma && p.pos === s.pos && p.gloss === s.glosses[0])
      if (current) picked++
      const cells = [
        s.lemma, s.pos, s.glosses[0] ?? '',
        g.translations.map((t) => t.word).join(' / '),
        (s.translations?.[lang] ?? []).map((t) => t.word + (t.tags?.length ? ` (${t.tags.join(', ')})` : '')).join(' / '),
        current?.picks.map((p) => p.word + (p.tags?.length ? ` (${p.tags.join(', ')})` : '')).join(' / ') ?? '',
        '',
      ]
      lines.push(cells.map(csvCell).join(','))
    }
  }
  const out = arg('--out') ?? join(ROOT, '.cache', `picks-${lang}.csv`)
  await mkdir(dirname(out), { recursive: true })
  await writeFile(out, lines.join('\n') + '\n')
  console.log(`${words.length} English words, ${meanings} meanings; ${picked} already picked. Wrote ${out}`)
}

// A definition pattern for the config: the start of the gloss, cut at a word boundary.
function glossPattern(gloss: string): string {
  let start = gloss.length <= 40 ? gloss : gloss.slice(0, 40).replace(/\s+\S*$/, '')
  start = start.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
  return `/^${start}/`
}

async function apply(lang: string, file: string) {
  const [header, ...rows] = parseCsv(await readFile(file, 'utf8'))
  const col = (name: string) => header.indexOf(name)
  const [en, pos, meaning, mine] = ['english', 'pos', 'meaning', 'your_pick'].map(col)
  if ([en, pos, meaning, mine].some((i) => i < 0)) throw new Error(`${file} needs the columns ${COLUMNS.join(', ')}`)
  const out: string[] = []
  for (const r of rows) {
    const cell = r[mine]?.trim()
    if (!cell) continue
    const picks = cell.split('/').map((p) => {
      const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(p.trim())
      const word = (m ? m[1] : p).trim()
      const tags = m ? m[2].split(',').map((t) => t.trim()).filter(Boolean) : []
      return tags.length ? `{ word: ${JSON.stringify(word)}, tags: ${JSON.stringify(tags)} }` : JSON.stringify(word)
    })
    out.push(`    { word: ${JSON.stringify(r[en])}, pos: ${JSON.stringify(r[pos])}, gloss: ${glossPattern(r[meaning])}, picks: [${picks.join(', ')}] },`)
  }
  console.log(out.length ? `// Paste into languages/${lang}.ts \`picks\`, then run: npm run build:picks -- ${lang}\n${out.join('\n')}` : 'No rows have your_pick filled in.')
}

async function main() {
  const lang = process.argv[2]
  if (!lang || lang.startsWith('--')) throw new Error('usage: npm run picks-sheet -- <lang> [--top N | --words file] [--out file.csv] | --apply file.csv')
  const applyFile = arg('--apply')
  if (applyFile) return apply(lang, applyFile)
  if (!existsSync(join(ROOT, 'packages', lang, 'data', 'meta.json'))) throw new Error(`build the data first: npm run build:data -- ${lang}`)
  await sheet(lang)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
