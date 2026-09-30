// Measures translation quality against known-correct translations.
//
//   node --experimental-strip-types scripts/evaluate.ts [--verbose]
//
// Uses the built data in packages/<lang>/data (build en and vi first). A case passes when one of
// its expected words is in the top 3 of the first (most relevant) translation group.

import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createTranslator, type TranslateOptions } from '../packages/core/src/index.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

type Case = { word: string; expect: string[] } & TranslateOptions

// [from, fromRegion, to, toRegion] shorthand -> options.
const pair = (from: string, fromRegion: string | undefined, to: string, toRegion: string | undefined) => ({
  from, to, ...(fromRegion ? { fromRegion } : {}), ...(toRegion ? { toRegion } : {}),
})
const c = (p: ReturnType<typeof pair>, word: string, expect: string[], extra: Partial<TranslateOptions> = {}): Case => ({
  ...p, word, expect, ...extra,
})

const enViS = pair('en', undefined, 'vi', 'Southern')
const enViN = pair('en', undefined, 'vi', 'Northern')

export const CASES: Case[] = [
  // English -> Vietnamese
  c(enViS, 'pig', ['heo']),
  c(enViN, 'pig', ['lợn']),
  c(enViS, 'mother', ['má', 'mẹ']),
  c(enViS, 'car', ['xe hơi', 'ô tô', 'ôtô', 'xe']),
  c(enViS, 'not', ['hông', 'không']),
  c(enViS, 'wait', ['chờ', 'đợi']),
  c(enViS, 'cool', ['ngầu', 'chất'], { meaning: 'awesome great' }),
  c(enViS, 'dog', ['chó']),
  c(enViS, 'speak', ['nói']),
  c(enViS, 'said', ['nói']),
  c(enViS, 'computer', ['máy tính', 'máy vi tính']),
  c(enViS, 'corn', ['bắp']),
  c(enViN, 'corn', ['ngô']),
  c(enViS, 'pineapple', ['thơm', 'khóm']),
  c(enViN, 'pineapple', ['dứa']),
  c(enViS, 'father', ['ba', 'tía']),
  c(enViN, 'father', ['bố']),
  // "I" without a relationship: the general pronouns, not kinship words (con, anh, ông), which need
  // the pronoun table's listener. From Wiktionary's table for "I" (tôi, tớ, ta, tui (South), tao, mình).
  c(pair('en', undefined, 'vi', undefined), 'I', ['tôi', 'mình']),
  c(enViS, 'I', ['tui']),
  c(pair('en', undefined, 'vi', undefined), 'I', ['tớ', 'tao', 'ta', 'tui'], { register: 'casual' }),
  // Other persons, from the pronoun table's default row (anh ấy/chị ấy are Northern-tagged; ảnh/chỉ Southern).
  c(pair('en', undefined, 'vi', undefined), 'you', ['bạn']),
  c(pair('en', undefined, 'vi', undefined), 'he', ['anh ấy']),
  c(enViS, 'she', ['chỉ', 'chị ấy']),
  c(pair('en', undefined, 'vi', undefined), 'we', ['chúng tôi', 'chúng ta']),
  c(pair('en', undefined, 'vi', undefined), 'they', ['họ']),
  // Vietnamese, Northern -> Southern
  c(pair('vi', 'Northern', 'vi', 'Southern'), 'lợn', ['heo']),
  c(pair('vi', 'Northern', 'vi', 'Southern'), 'ngô', ['bắp']),
  c(pair('vi', 'Northern', 'vi', 'Southern'), 'bố', ['ba', 'tía']),
  c(pair('vi', 'Northern', 'vi', 'Southern'), 'dứa', ['thơm', 'khóm']),
  c(pair('vi', 'Northern', 'vi', 'Southern'), 'mẹ', ['má']),
  c(pair('vi', 'Northern', 'vi', 'Southern'), 'vâng', ['dạ']),
  // English, US <-> UK
  c(pair('en', 'US', 'en', 'UK'), 'truck', ['lorry']),
  c(pair('en', 'US', 'en', 'UK'), 'apartment', ['flat']),
  c(pair('en', 'US', 'en', 'UK'), 'elevator', ['lift']),
  c(pair('en', 'US', 'en', 'UK'), 'cookie', ['biscuit']),
  c(pair('en', 'US', 'en', 'UK'), 'gasoline', ['petrol']),
  c(pair('en', 'US', 'en', 'UK'), 'sidewalk', ['pavement']),
  c(pair('en', 'UK', 'en', 'US'), 'lorry', ['truck']),
  c(pair('en', 'UK', 'en', 'US'), 'petrol', ['gasoline', 'gas']),
  // Into English
  c(pair('vi', undefined, 'en', undefined), 'heo', ['pig', 'hog', 'swine']),
  c(pair('vi', undefined, 'en', undefined), 'chờ', ['wait', 'await']),
  c(pair('vi', undefined, 'en', undefined), 'ngầu', ['cool'], { meaning: 'awesome' }),
]

// Held-out cases, written after the tuning above and not tuned against: a check on how well the
// translator generalizes. Report them separately.
export const HOLDOUT: Case[] = [
  c(enViS, 'water', ['nước']),
  c(enViS, 'house', ['nhà']),
  c(enViS, 'eat', ['ăn']),
  c(enViS, 'beautiful', ['đẹp']),
  c(enViS, 'hot', ['nóng']),
  c(enViS, 'book', ['sách']),
  c(enViS, 'cat', ['mèo']),
  c(enViS, 'money', ['tiền']),
  c(enViS, 'run', ['chạy']),
  c(enViS, 'sleep', ['ngủ']),
  c(pair('en', 'US', 'en', 'UK'), 'vacation', ['holiday', 'holidays']),
  c(pair('en', 'US', 'en', 'UK'), 'trash', ['rubbish']),
  c(pair('en', 'US', 'en', 'UK'), 'diaper', ['nappy']),
  c(pair('en', 'US', 'en', 'UK'), 'subway', ['underground', 'tube']),
  c(pair('vi', 'Northern', 'vi', 'Southern'), 'bát', ['chén']),
  c(pair('vi', 'Northern', 'vi', 'Southern'), 'thìa', ['muỗng']),
  c(pair('vi', 'Northern', 'vi', 'Southern'), 'quả', ['trái']),
]

async function run(cases: Case[], title: string, verbose: boolean, tr: ReturnType<typeof createTranslator>) {
  let pass = 0
  let first = 0
  console.log(`\n${title}`)
  for (const kase of cases) {
    const { word, expect, ...options } = kase
    const groups = await tr.translate(word, options)
    const top = groups[0]?.translations.slice(0, 3).map((t) => t.word) ?? []
    const ok = top.some((w) => expect.includes(w))
    if (ok) pass++
    if (expect.includes(top[0])) first++
    const label = `${options.from}${options.fromRegion ? `(${options.fromRegion})` : ''} → ${options.to}${options.toRegion ? `(${options.toRegion})` : ''}  ${word}${options.meaning ? ` [${options.meaning}]` : ''}${options.pos ? ` <${options.pos}>` : ''}`
    if (verbose || !ok) console.log(`${ok ? '✓' : '✗'} ${label.padEnd(58)} ${top.join(', ') || '(nothing)'}${ok ? '' : `   expected: ${expect.join(' / ')}`}`)
  }
  console.log(
    `${pass}/${cases.length} passed (${Math.round((100 * pass) / cases.length)}%); ` +
      `correct word first: ${first}/${cases.length} (${Math.round((100 * first) / cases.length)}%)`,
  )
  return pass
}

async function main() {
  const verbose = process.argv.includes('--verbose')
  const tr = createTranslator({
    load: (lang) => async (p) => JSON.parse(await readFile(join(ROOT, 'packages', lang, 'data', p), 'utf8')),
  })
  await run(CASES, 'Tuning set', verbose, tr)
  await run(HOLDOUT, 'Held-out set (not tuned against)', verbose, tr)
}

if (import.meta.url === `file://${process.argv[1]}`) main()
