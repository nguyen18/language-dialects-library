// Keeps DATA_UPDATES.md current: which Wiktionary dump (via Kaikki) each language's data was built
// from. Called by the data build, so every language gets a row without anyone remembering to add it,
// and a history line whenever a language's dump changes (a refresh).

import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export type DataUpdate = { lang: string; name: string; lastModified: string | null; retrieved: string; entries: number }

const START = '<!-- rows:start -->'
const END = '<!-- rows:end -->'
const HISTORY = '<!-- history -->'
const HEADER = '| Language | Code | Wiktionary data of | Downloaded | Entries |\n|---|---|---|---|---|'

const day = (d: string | null) => (d ? new Date(d).toISOString().slice(0, 10) : 'unknown')

const TEMPLATE = `# Data updates

When each language's dictionary data was last updated from Wiktionary. The data is built from
[Kaikki.org](https://kaikki.org/)'s extraction of English Wiktionary; "Wiktionary data of" is the date
Kaikki last updated that language's file, "Downloaded" when we fetched it. Updated automatically by
\`npm run build:data\` (don't edit the table by hand). Published data packages carry the same dates in
\`data/meta.json\` (\`source.lastModified\`, \`source.retrieved\`). History is newest first; the build adds a
line when a language is added or its Wiktionary data changes, and other notes (like publishing) can be
added by hand.

${START}
${END}

## History

${HISTORY}
`

export async function recordDataUpdate(root: string, u: DataUpdate): Promise<void> {
  const file = join(root, 'DATA_UPDATES.md')
  let text = existsSync(file) ? await readFile(file, 'utf8') : TEMPLATE
  const [before, rest] = text.split(START)
  const [rowsText, after] = rest.split(END)
  const rows = rowsText.split('\n').filter((l) => l.startsWith('|'))
  const cells = (row: string) => row.split('|').map((c) => c.trim())
  const previous = rows.find((r) => cells(r)[2] === `\`${u.lang}\``)
  const row = `| ${u.name} | \`${u.lang}\` | ${day(u.lastModified)} | ${day(u.retrieved)} | ${u.entries.toLocaleString('en-US')} |`
  const others = rows.filter((r) => r !== previous)
  const sorted = [...others, row]
    .filter((r) => !r.startsWith('| Language') && !r.startsWith('|---'))
    .sort((a, b) => cells(a)[1].localeCompare(cells(b)[1]))
  // The markers sit outside the table: a comment line inside a Markdown table ends it.
  text = `${before}${START}\n${HEADER}\n${sorted.join('\n')}\n${END}${after}`
  // A history line when the dump changed (or the language is new).
  if (!previous || cells(previous)[3] !== day(u.lastModified)) {
    const line = previous
      ? `- ${day(u.retrieved)}: ${u.name} updated to Wiktionary data of ${day(u.lastModified)} (was ${cells(previous)[3]}), ${u.entries.toLocaleString('en-US')} entries.`
      : `- ${day(u.retrieved)}: ${u.name} added, Wiktionary data of ${day(u.lastModified)}, ${u.entries.toLocaleString('en-US')} entries.`
    text = text.replace(HISTORY, `${HISTORY}\n${line}`)
  }
  await writeFile(file, text)
}
