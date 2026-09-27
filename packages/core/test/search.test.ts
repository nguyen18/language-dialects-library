import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createDictionary, normalizeEnglish, shardKey, type LanguageMeta, type StoredHit } from '../src/index.ts'

describe('shardKey', () => {
  it('uses the first two letters without diacritics', () => {
    assert.equal(shardKey('không'), 'kh')
    assert.equal(shardKey('Đợi'), 'do')
    assert.equal(shardKey('ở'), 'o_')
    assert.equal(shardKey('3D'), '_d')
    assert.equal(shardKey('ñame'), 'na')
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
    assert.equal((await words('car', 'Mexico'))[0], 'carro')
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
