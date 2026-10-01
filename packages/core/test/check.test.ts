import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createChecker, type CheckerConfig, type LanguageMeta, type StoredEntry, type StoredPronounRow } from '../src/index.ts'

// A tiny fake language written in syllables, to test each rule without the real data. Regions North and
// South; "lon" is North's word for pig and "heo" South's; "ket qua" is one word ("result"), while "qua"
// on its own is a Northern word.
const noun = (gloss: string, regions?: string[]): StoredEntry => ({ word: '', pos: 'noun', senses: [{ glosses: [gloss], ...(regions ? { regions } : {}) }] })
const pron = (gloss: string): StoredEntry => ({ word: '', pos: 'pron', senses: [{ glosses: [gloss] }] })
const words: Record<string, Record<string, StoredEntry[]>> = {
  lo: { lon: [noun('pig', ['North'])] },
  he: { heo: [noun('pig', ['South'])] },
  ke: { 'ket qua': [noun('result')] },
  qu: { qua: [noun('fruit', ['North'])] },
  an: { an: [noun('eat')] },
  to: { toi: [pron('I')] },
  ta: { tao: [pron('I')] },
  ba: { ban: [pron('you'), noun('friend')] },
  ma: { may: [pron('you')], ma: [pron('you, my mother')] },
  co: { con: [pron('I, to a parent'), noun('child')] },
  a_: { a: [noun('polite ending')] },
}
const rows: StoredPronounRow[] = [
  { id: 'general', label: 'Anyone', default: true, self: [{ word: 'toi', source: 'gloss' }], addressee: [{ word: 'ban', source: 'gloss' }] },
  { id: 'parent', label: 'Your parents', respect: true, self: [{ word: 'con', source: 'gloss' }], addressee: [{ word: 'ma', source: 'gloss' }] },
  { id: 'close', label: 'A close friend', self: [{ word: 'tao', source: 'gloss' }], addressee: [{ word: 'may', source: 'gloss' }] },
]
const checkerConfig: CheckerConfig = {
  units: 'syllables',
  maxWordUnits: 3,
  pronouns: { self: ['toi', 'tao'], addressee: ['ban', 'may'] },
  ambiguousPronouns: ['ban'],
  politeEndings: ['a'],
}
const syllables = { lon: 5, heo: 5, ket: 4, qua: 5, an: 6, toi: 6, tao: 4, ban: 6, may: 4, ma: 5, con: 6, a: 5, 'không': 7, 'khống': 4 }
const meta = {
  name: 'Test', regions: ['North', 'South'], shards: { words: Object.keys(words), en: [] },
  pronouns: true, checker: true, syllables: true,
} as unknown as LanguageMeta
const files: Record<string, unknown> = {
  'meta.json': meta,
  'pronouns.json': rows,
  'checker.json': checkerConfig,
  'syllables.json': syllables,
  ...Object.fromEntries(Object.entries(words).map(([k, v]) => [`words/${k}.json`, v])),
}

// Every opt-in check on, for testing them (by default only the spellchecker runs).
const ALL_CHECKS = { dialect: true, 'pronoun-relationship': true, 'pronoun-pair': true, 'pronoun-consistency': true, 'polite-ending': true }

describe('checker (fake data)', () => {
  const checker = createChecker({ load: () => async (p) => files[p] })
  // The fake language has no English data, so words aren't checked for being English (base = itself).
  const check = (text: string, options: Partial<Parameters<typeof checker.check>[1]> = {}) =>
    checker.check(text, { lang: 'test', base: 'test', ...options, rules: { ...ALL_CHECKS, ...options.rules } })
  const rules = async (text: string, options = {}) => (await check(text, options)).issues.map((i) => `${i.rule}:${i.text}`)

  it('joins syllables into dictionary words before checking them', async () => {
    // "qua" alone is Northern; inside the word "ket qua" it isn't checked on its own.
    assert.deepEqual(await rules('ket qua an', { region: 'South' }), [])
    assert.deepEqual(await rules('qua an', { region: 'South' }), ['dialect:qua'])
  })

  it('suggests accents for syllables that are not in the language', async () => {
    const [issue] = (await check('khong an')).issues
    assert.equal(issue.rule, 'spelling')
    assert.equal(issue.severity, 'warning')
    assert.deepEqual(issue.suggestions, ['không', 'khống'])
    // Capitalized words get capitalized suggestions; a wrongly accented syllable is an error.
    assert.deepEqual((await check('Khong')).issues[0].suggestions, ['Không', 'Khống'])
    const [wrong] = (await check('khôg')).issues
    assert.equal(wrong.severity, 'error')
    // Plain-letter syllables with no accented form are left alone (names, foreign words).
    assert.deepEqual(await rules('email an'), [])
  })

  it('flags words from another region, or mixed regions when none is given', async () => {
    assert.deepEqual(await rules('lon an', { region: 'South' }), ['dialect:lon'])
    assert.deepEqual(await rules('heo an', { region: 'South' }), [])
    // Most regional words are Southern: the Northern one stands out.
    assert.deepEqual(await rules('lon heo. heo an'), ['dialect:lon'])
    // No majority, but they can't go together: both are pointed out, as suggestions.
    const mixed = (await check('lon heo')).issues
    assert.deepEqual(mixed.map((i) => i.text), ['lon', 'heo'])
    assert.ok(mixed.every((i) => i.severity === 'suggestion' && /mixes regions/.test(i.message)))
  })

  it('checks pronouns against who you are talking to', async () => {
    const [issue] = (await check('toi an', { listener: 'parent' })).issues.filter((i) => i.rule === 'pronoun-relationship')
    assert.equal(issue.text, 'toi')
    assert.deepEqual(issue.suggestions, ['con'])
    assert.equal(issue.severity, 'warning')
    // Ambiguous pronouns ("ban" is also "friend") are only suggestions.
    const [you] = (await check('ban an', { listener: 'parent' })).issues.filter((i) => i.rule === 'pronoun-relationship')
    assert.equal(you.severity, 'suggestion')
    assert.match(you.message, /^If “ban” means “you” here/)
    assert.deepEqual(await rules('con an a', { listener: 'parent' }), [])
  })

  it('checks that I and you pronouns go together when no listener is given', async () => {
    const [issue] = (await check('tao ban')).issues
    assert.equal(issue.rule, 'pronoun-pair')
    assert.equal(issue.text, 'ban')
    assert.deepEqual(issue.suggestions, ['may'])
    assert.deepEqual(await rules('tao may'), [])
    assert.deepEqual(await rules('toi ban'), [])
  })

  it('flags switching words for the same person within one text', async () => {
    const [issue] = (await check('toi an. tao an.')).issues.filter((i) => i.rule === 'pronoun-consistency')
    assert.equal(issue.text, 'tao')
    assert.deepEqual(issue.suggestions, ['toi'])
    assert.deepEqual((await check('toi an. toi an.')).issues.filter((i) => i.rule === 'pronoun-consistency'), [])
  })

  it('suggests polite endings when speaking up, except in exclamations', async () => {
    assert.deepEqual(await rules('con an.', { listener: 'parent' }), ['polite-ending:an'])
    assert.deepEqual(await rules('con an a.', { listener: 'parent' }), [])
    assert.deepEqual(await rules('con an!', { listener: 'parent' }), [])
    assert.deepEqual(await rules('tao an.', { listener: 'close' }), [])
  })

  it('runs only the spellchecker unless other checks are turned on', async () => {
    const { issues } = await checker.check('lon khong. toi an.', { lang: 'test', base: 'test', region: 'South', listener: 'parent' })
    assert.deepEqual(issues.map((i) => i.rule), ['spelling'])
  })

  it('reports offsets into the NFC text, and lets rules be turned off', async () => {
    const { text, issues } = await check('Ừ, khong an.')
    assert.ok(issues.every((i) => text.slice(i.start, i.end) === i.text))
    assert.deepEqual(await rules('toi an.', { listener: 'parent', rules: { 'polite-ending': false } }), ['pronoun-relationship:toi'])
  })

  it('rejects unknown listeners, listing the valid ones', async () => {
    await assert.rejects(check('toi', { listener: 'boss' }), /unknown listener "boss".*general, parent, close/)
  })

  it('still checks regions for a language without checker settings', async () => {
    const plainFiles: Record<string, unknown> = { ...files, 'meta.json': { ...meta, checker: false, syllables: false, pronouns: false } }
    const plain = createChecker({ load: () => async (p) => plainFiles[p] })
    const issues = (await plain.check('khong lon', { lang: 'test', base: 'test', region: 'South', rules: { dialect: true } })).issues
    assert.deepEqual(issues.map((i) => `${i.rule}:${i.text}`), ['dialect:lon'])
  })
})

// Checks against the real Vietnamese build (and English, for regional words). Skipped unless built.
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const built = ['en', 'vi'].every((l) => existsSync(join(root, l, 'data')))
describe('checker (real Vietnamese data)', { skip: !built && 'build en and vi data first' }, () => {
  const checker = createChecker({ load: (lang) => async (p) => JSON.parse(await readFile(join(root, lang, 'data', p), 'utf8')) })
  const check = (text: string, options: Partial<Parameters<typeof checker.check>[1]> = {}) =>
    checker.check(text, { lang: 'vi', ...options, rules: { ...ALL_CHECKS, ...options.rules } })
  // The default: the spellchecker only.
  const spell = (text: string, options: Partial<Parameters<typeof checker.check>[1]> = {}) => checker.check(text, { lang: 'vi', ...options })
  const fixes = async (text: string, options = {}) =>
    (await spell(text, options)).issues.filter((i) => i.severity !== 'suggestion').map((i) => `${i.text}→${i.suggestions[0]}`)

  it('corrects every word by default: accents, and English words translated', async () => {
    assert.deepEqual(await fixes('Toi muon an the ice cream but it was very expensive.', { region: 'Southern' }), [
      'Toi→Tôi', 'muon→muốn', 'an→ăn', 'the→', 'ice cream→kem', 'but→nhưng', 'it→nó', 'was→là', 'very→rất', 'expensive→mắc',
    ])
    assert.deepEqual(await fixes('Hôm nay tôi đi market.'), ['market→chợ'])
    // The region's word: "expensive" is đắt in the North.
    assert.deepEqual(await fixes('Nó expensive.', { region: 'Northern' }), ['expensive→đắt'])
    // "but" is English here, not a misspelled "bút"; regions and pronouns aren't checked by default.
    assert.deepEqual(await fixes('Tôi muốn ăn thịt lợn but tui không có tiền.', { region: 'Southern' }), ['but→nhưng'])
    const { parts } = await spell('Hôm nay tôi đi market với má.')
    assert.deepEqual(parts.map((p) => p.lang), ['vi', 'en', 'vi'])
  })

  it('suggests accents for rare plain-letter words, more readily in text typed without accents', async () => {
    assert.deepEqual(await fixes('Toi đã ăn cơm.'), ['Toi→Tôi'])
    assert.deepEqual(await fixes('toi di cho'), ['toi→tôi', 'di→đi'])
    // Common plain words and listed pronouns stay ("cho", "con", Southern "tui").
    assert.deepEqual(await fixes('Tui cho con ăn cơm.'), [])
  })

  it('catches the common learner mistakes', async () => {
    const { issues } = await check('Tôi muốn ăn thịt lợn và bắp khong?', { region: 'Southern', listener: 'parent' })
    const by = (rule: string) => issues.find((i) => i.rule === rule)
    assert.deepEqual(by('pronoun-relationship')?.suggestions, ['Con'])
    assert.equal(by('dialect')?.text, 'lợn')
    assert.equal(by('dialect')?.suggestions[0], 'heo')
    assert.equal(by('spelling')?.suggestions[0], 'không')
    assert.equal((await check('Tao nói với bạn rồi.')).issues[0]?.suggestions[0], 'mày')
    assert.equal((await check('Con ăn bắp với muỗng.', { region: 'Northern' })).issues[0]?.suggestions[0], 'thìa')
    assert.ok((await check('Tôi muốn ăn thịt lợn nha.')).issues.some((i) => /mixes regions/.test(i.message)))
  })

  // False alarms make a checker useless, so correct sentences must come back clean.
  it('leaves correct sentences alone', async () => {
    const clean: [string, Partial<Parameters<typeof checker.check>[1]>][] = [
      ['Kết quả thi của tôi rất tốt.', {}],
      ['Chúng tôi sẽ đi Hà Nội vào tháng sau.', {}],
      ['Hôm nay trời đẹp quá, mình đi chơi nhé!', { region: 'Northern' }],
      ['Con nhớ má quá! Má ăn cơm chưa ạ?', { region: 'Southern', listener: 'parent' }],
      ['Bạn của tôi tên là Mai.', { listener: 'friend' }],
      ['Em cảm ơn cô ạ.', { listener: 'teacher' }],
      ['Tui hông biết nữa.', { region: 'Southern' }],
      ['Tôi không biết nói tiếng Việt.', {}],
      ['Anh ơi, em muốn ăn bắp.', { region: 'Southern' }],
      ['Tao với mày đi ăn phở đi.', { listener: 'close-friend' }],
      ['Cháu chào ông ạ.', { listener: 'grandparents-age' }],
      ['Chúng ta đi xem phim nha.', { region: 'Southern' }],
      ['Mẹ ơi, con đói rồi ạ.', { region: 'Northern', listener: 'parent' }],
    ]
    for (const [text, options] of clean) {
      for (const run of [check, spell]) {
        const { issues } = await run(text, options)
        assert.deepEqual(issues.map((i) => `${i.rule}: ${i.message}`), [], text)
      }
    }
  })
})
