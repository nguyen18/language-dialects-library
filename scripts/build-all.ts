// Builds every language's data, English first: English is the bridge between languages, and other
// languages' hand-picked words are checked against the English data.
//
//   npm run build:data:all [-- --refresh]

import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const langs = readdirSync(join(ROOT, 'languages'))
  .filter((f) => f.endsWith('.ts'))
  .map((f) => f.slice(0, -3))
  .sort((a, b) => Number(b === 'en') - Number(a === 'en') || a.localeCompare(b))

for (const lang of langs) {
  console.log(`\n== ${lang}`)
  const run = spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', join(ROOT, 'scripts', 'build-language.ts'), lang, ...process.argv.slice(2)],
    { stdio: 'inherit' },
  )
  if (run.status !== 0) process.exit(run.status ?? 1)
}
