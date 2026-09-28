import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  compatiblePos,
  createDictionary,
  createTranslator,
  normalizeEnglish,
  posName,
  regularBaseForms,
  shardKey,
  type LanguageMeta,
  type StoredHit,
} from '../src/index.ts'

describe('shardKey', () => {
  it('uses the first two letters without diacritics', () => {
    assert.equal(shardKey('không'), 'kh')
    assert.equal(shardKey('Đợi'), 'do')
    assert.equal(shardKey('ở'), 'o_')
    assert.equal(shardKey('3D'), '_d')
    assert.equal(shardKey('ñame'), 'na')
  })

  it('can use more letters for large languages', () => {
    assert.equal(shardKey('running', 3), 'run')
    assert.equal(shardKey('im', 3), 'im_')
  })
})

describe('normalizeEnglish', () => {
  it('lowercases and drops a leading article or "to"', () => {
    assert.equal(normalizeEnglish('  To  Wait '), 'wait')
    assert.equal(normalizeEnglish('the door'), 'door')
    assert.equal(normalizeEnglish('I'), 'i')
  })
})

// A tiny fake language to test ranking without the real data.
describe('searchEnglish ranking (fake data)', () => {
  const meta = {
    name: 'Test',
    regions: ['North', 'South', 'Island'],
    regionGroups: { Mainland: ['North', 'South'] },
    shards: { words: [], en: ['no'] },
  } as unknown as LanguageMeta
  // Stored form: untagged hits have no `regions`.
  const hit = (word: string, extra: Partial<StoredHit>): StoredHit => ({
    word, pos: 'adv', gloss: 'not', senseIndex: 0, senses: 1, primary: true, ...extra,
  })
  const files: Record<string, unknown> = {
    'meta.json': meta,
    'en/no.json': {
      not: [
        hit('plain', { senses: 5 }),
        hit('southern', { regions: ['South'] }),
        hit('northern', { regions: ['North'] }),
        hit('island', { regions: ['Island'] }),
        hit('rude', { labels: ['vulgar'] }),
        hit('slangy', { labels: ['slang'], senses: 9 }),
        hit('secondary', { primary: false, senses: 20 }),
      ],
    },
  }
  const dict = createDictionary({ lang: 'test', load: async (p) => files[p] })

  it('ranks region-tagged words first and leaves out other regions', async () => {
    const words = (await dict.searchEnglish('not', { region: 'South' })).map((h) => h.word)
    assert.deepEqual(words, ['southern', 'plain', 'slangy', 'secondary'])
  })

  it('excludes vulgar words by default, and includes them with exclude: []', async () => {
    assert.ok(!(await dict.searchEnglish('not')).some((h) => h.word === 'rude'))
    assert.ok((await dict.searchEnglish('not', { exclude: [] })).some((h) => h.word === 'rude'))
  })

  it('treats untagged hits as every region', async () => {
    const plain = (await dict.searchEnglish('not')).find((h) => h.word === 'plain')
    assert.deepEqual(plain?.regions, ['North', 'South', 'Island'])
    assert.equal(plain?.regionTagged, false)
  })

  it('searches a region group as all of its regions', async () => {
    const words = (await dict.searchEnglish('not', { region: 'Mainland' })).map((h) => h.word)
    assert.deepEqual(words.slice(0, 2).sort(), ['northern', 'southern'])
    assert.ok(!words.includes('island'))
  })

  it('rejects unknown regions and lists the groups', async () => {
    await assert.rejects(dict.searchEnglish('not', { region: 'East' }), /isn't a Test region or group.*groups: Mainland/)
  })

  it('returns nothing for terms in shards that do not exist', async () => {
    assert.deepEqual(await dict.searchEnglish('zebra'), [])
  })
})

// Checks against the real Vietnamese build. Run `npm run build:data -- vi` first; skipped otherwise.
const viData = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'vi', 'data')
describe('Vietnamese data', { skip: !existsSync(viData) && 'run `npm run build:data -- vi` first' }, () => {
  const dict = createDictionary({ lang: 'vi', load: async (p) => JSON.parse(await readFile(join(viData, p), 'utf8')) })
  const words = async (term: string, region?: string) => (await dict.searchEnglish(term, { region })).map((h) => h.word)

  it('finds Southern variants that point at a standard word', async () => {
    assert.equal((await words('not', 'Southern'))[0], 'hông')
  })

  it('separates regional words', async () => {
    assert.ok((await words('pig', 'Northern')).includes('lợn'))
    assert.ok((await words('pig', 'Southern')).includes('heo'))
    assert.ok(!(await words('pig', 'Southern')).includes('lợn'))
    assert.ok((await words('now', 'Central')).includes('chừ'))
  })

  it('keeps regions per sense', async () => {
    const senses = (await dict.lookup('má')).flatMap((e) => e.senses)
    const mother = senses.find((s) => s.glosses[0].startsWith('mother'))
    assert.deepEqual(mother?.regions, ['Southern'])
    assert.equal(senses.find((s) => s.glosses[0] === 'cheek')?.regionTagged, false)
  })

  it('leaves vulgar words out by default', async () => {
    assert.ok(!(await words('not')).includes('đéo'))
  })
})

// Checks against the real Spanish build. Run `npm run build:data -- es` first; skipped otherwise.
const esData = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'es', 'data')
describe('Spanish data', { skip: !existsSync(esData) && 'run `npm run build:data -- es` first' }, () => {
  const dict = createDictionary({ lang: 'es', load: async (p) => JSON.parse(await readFile(join(esData, p), 'utf8')) })
  const words = async (term: string, region?: string) => (await dict.searchEnglish(term, { region })).map((h) => h.word)

  it('separates Spain from Latin America', async () => {
    assert.equal((await words('car', 'Spain'))[0], 'coche')
    // "auto" and "carro" are both everyday Mexican words; frequency puts "auto" first.
    assert.ok((await words('car', 'Mexico')).slice(0, 3).includes('carro'))
    assert.equal((await words('computer', 'Spain'))[0], 'ordenador')
    assert.ok((await words('computer', 'Latin America')).includes('computadora'))
  })

  it('expands group tags to their countries', async () => {
    assert.ok((await words('you', 'Argentina')).includes('vos'))
    assert.ok((await words('popcorn', 'Argentina')).includes('pochoclo'))
  })

  it('leaves out inflected forms', async () => {
    assert.deepEqual(await dict.lookup('hablamos'), [])
    assert.ok((await dict.lookup('hablar')).length > 0)
  })
})

describe('parts of speech', () => {
  it('names codes and maps English parts of speech to compatible ones', () => {
    assert.equal(posName('adj'), 'Adjective')
    assert.equal(posName('unknown-code'), 'unknown-code')
    assert.ok(compatiblePos('verb').includes('particle'))
  })
})

describe('regularBaseForms', () => {
  it('undoes regular English endings', () => {
    assert.ok(regularBaseForms('walked').includes('walk'))
    assert.ok(regularBaseForms('cities').includes('city'))
    assert.ok(regularBaseForms('making').includes('make'))
    assert.ok(regularBaseForms('running').includes('run'))
    assert.deepEqual(regularBaseForms('go'), [])
  })
})

// Translator checks against the real English, Vietnamese and Spanish builds; skipped unless all are built.
// The fuller quality check is `npm run evaluate` (scripts/evaluate.ts).
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const built = ['en', 'vi', 'es'].every((l) => existsSync(join(root, l, 'data')))
describe('translator (real data)', { skip: !built && 'build en, vi and es data first' }, () => {
  const tr = createTranslator({
    load: (lang) => async (p) => JSON.parse(await readFile(join(root, lang, 'data', p), 'utf8')),
  })
  const top = async (word: string, options: Parameters<typeof tr.translate>[1]) =>
    (await tr.translate(word, options))[0]?.translations.map((t) => t.word) ?? []

  it('follows irregular and regular English forms to the base word', async () => {
    const [said] = await tr.translate('said', { from: 'en', to: 'vi', toRegion: 'Southern' })
    assert.equal(said.source.lemma, 'say')
    assert.equal(said.translations[0].word, 'nói')
    assert.equal((await tr.senses('walked', { from: 'en' }))[0].lemma, 'walk')
    assert.equal((await tr.senses('running', { from: 'en', pos: 'verb' }))[0].lemma, 'run')
    assert.equal((await tr.senses('dont', { from: 'en' }))[0].lemma, "don't")
  })

  it('follows regional variants and keeps their region', async () => {
    const [hong] = await tr.senses('hông', { from: 'vi', fromRegion: 'Southern', pos: 'adv' })
    assert.equal(hong.lemma, 'không')
    assert.deepEqual(hong.regions, ['Southern'])
  })

  it('translates between languages, into a dialect', async () => {
    assert.ok((await top('chido', { from: 'es', fromRegion: 'Mexico', to: 'vi', toRegion: 'Southern' })).includes('ngầu'))
    assert.ok((await top('heo', { from: 'vi', fromRegion: 'Southern', to: 'es', toRegion: 'Mexico' })).some((w) => ['cerdo', 'puerco', 'cochino', 'chancho'].includes(w)))
  })

  it('translates between dialects of one language', async () => {
    assert.equal((await top('ngô', { from: 'vi', fromRegion: 'Northern', to: 'vi', toRegion: 'Southern' }))[0], 'bắp')
    assert.ok((await top('coche', { from: 'es', fromRegion: 'Spain', to: 'es', toRegion: 'Mexico' })).includes('carro'))
    assert.ok((await top('truck', { from: 'en', fromRegion: 'US', to: 'en', toRegion: 'UK' })).includes('lorry'))
  })

  it('uses the part of speech and meaning', async () => {
    assert.ok(!(await top('can', { from: 'en', to: 'vi', pos: 'verb' })).includes('ngũ tạng'))
    // "chất" and "ngầu" are both Southern slang for cool; the temperature word "mát" must not lead.
    const cool = await top('cool', { from: 'en', to: 'vi', toRegion: 'Southern', meaning: 'awesome great' })
    assert.ok(cool.slice(0, 3).includes('ngầu'))
    assert.notEqual(cool[0], 'mát')
    assert.equal((await top('cerdo', { from: 'es', to: 'vi', toRegion: 'Southern', pos: 'noun' }))[0], 'heo')
  })

  it('keeps register: polite stays polite', async () => {
    assert.ok((await top('vâng', { from: 'vi', fromRegion: 'Northern', to: 'vi', toRegion: 'Southern' })).includes('dạ'))
  })
})
