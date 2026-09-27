// Builds one language's data package from Kaikki's Wiktionary extraction.
//
//   node --experimental-strip-types scripts/build-language.ts vi [--refresh]
//
// Downloads kaikki.org's JSONL for the language (cached in .cache/, --refresh re-downloads), keeps the
// fields a learner needs, and writes packages/<lang>/data/: meta.json, words/<shard>.json (by headword)
// and en/<shard>.json (English term -> words). The data is CC BY-SA 4.0 (see packages/<lang>/LICENSE).

import { createReadStream, existsSync } from 'node:fs'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import {
  normalizeEnglish,
  shardKey,
  type EnglishShard,
  type Entry,
  type Hit,
  type LanguageMeta,
  type Sense,
  type WordShard,
} from '../packages/core/src/types.ts'
import type { LanguageConfig } from './language-config.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// Source tags kept as usage labels. Grammar tags (transitive, alt-of, …) are left out.
const LABELS = new Set([
  'colloquial', 'informal', 'slang', 'Internet', 'familiar', 'endearing', 'humorous', 'euphemistic',
  'formal', 'polite', 'honorific', 'literary', 'dated', 'archaic', 'obsolete', 'historical', 'rare',
  'uncommon', 'neologism', 'dialectal', 'figuratively', 'idiomatic', 'abbreviation',
  'derogatory', 'disapproving', 'offensive', 'vulgar',
])

// Kaikki JSONL fields this script reads.
type KaikkiSense = {
  glosses?: string[]
  tags?: string[]
  raw_tags?: string[]
  alt_of?: { word: string }[]
  form_of?: { word: string }[]
}
type KaikkiEntry = { word: string; pos: string; senses?: KaikkiSense[] }

async function download(config: LanguageConfig, refresh: boolean) {
  const url = `https://kaikki.org/dictionary/${config.kaikkiName}/kaikki.org-dictionary-${config.kaikkiName}.jsonl`
  const file = join(ROOT, '.cache', `kaikki-${config.lang}.jsonl`)
  const infoFile = `${file}.info.json`
  if (!refresh && existsSync(file) && existsSync(infoFile)) {
    console.log(`Using cached ${file} (pass --refresh to re-download)`)
    return { file, url, ...(JSON.parse(await readFile(infoFile, 'utf8')) as { lastModified: string | null; retrieved: string }) }
  }
  console.log(`Downloading ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, Buffer.from(await res.arrayBuffer()))
  const info = { lastModified: res.headers.get('last-modified'), retrieved: new Date().toISOString() }
  await writeFile(infoFile, JSON.stringify(info))
  return { file, url, ...info }
}

async function readEntries(file: string, config: LanguageConfig): Promise<Entry[]> {
  const skipPos = new Set(config.skipPos ?? [])
  const entries: Entry[] = []
  const lines = createInterface({ input: createReadStream(file), crlfDelay: Infinity })
  for await (const line of lines) {
    if (!line.trim()) continue
    const raw = JSON.parse(line) as KaikkiEntry
    if (skipPos.has(raw.pos) || (config.keepWord && !config.keepWord(raw.word))) continue
    const senses: Sense[] = []
    for (const s of raw.senses ?? []) {
      const glosses = (s.glosses ?? []).filter((g) => g.trim())
      if (glosses.length === 0) continue
      const tags = s.tags ?? []
      const tagged = config.regionsFromTags(tags, s.raw_tags ?? [])
      const sense: Sense = {
        glosses,
        // The rule for untagged senses: they belong to every region.
        regions: tagged.length > 0 ? config.regions.filter((r) => tagged.includes(r)) : [...config.regions],
        regionTagged: tagged.length > 0,
        labels: tags.filter((t) => LABELS.has(t)),
      }
      const altOf = s.alt_of?.[0]?.word ?? s.form_of?.[0]?.word
      if (altOf) sense.altOf = altOf
      senses.push(sense)
    }
    if (senses.length > 0) entries.push({ word: raw.word, pos: raw.pos, senses })
  }
  return entries
}

// Trailing words dropped to also index the bare verb: "wait for" is found by "wait" too.
const TRAILING_PARTICLE = / (for|to|at|on|with|about|of|in|into|up|out|off|over)$/

// Splits a gloss into English terms, first meaning first: "now, today, this time" -> ["now", "today",
// "this time"]. Parenthesized notes are dropped. When a gloss explains before a colon, like
// "Negates the meaning of the modified verb or adjective: not", only the part after it is used.
// Only short, plain phrases are kept as search terms. Returns [term, position of its meaning].
function termsOf(gloss: string): [string, number][] {
  let cleaned = gloss.replace(/\([^)]*\)/g, ' ').replace(/[“”"]/g, '')
  if (cleaned.includes(':')) cleaned = cleaned.slice(cleaned.lastIndexOf(':') + 1)
  const terms: [string, number][] = []
  let position = 0
  // "I/me" lists two meanings, like "I; me".
  for (const part of cleaned.split(/[;,/]/)) {
    const t = normalizeEnglish(part)
    if (!t || t.split(' ').length > 4 || !/^[a-z][a-z' -]*$/.test(t)) continue
    terms.push([t, position])
    // The bare verb shares its phrase's position, so "wait" counts as the main meaning of "to wait for".
    const bare = t.replace(TRAILING_PARTICLE, '')
    if (bare !== t && bare) terms.push([bare, position])
    position++
  }
  return terms
}

// Proper names aren't translations of English words, so they're left out of the English index
// (they can still be looked up by word).
const NOT_IN_ENGLISH_INDEX = new Set(['name'])

function buildEnglishIndex(entries: Entry[]): Map<string, Hit[]> {
  // Variant senses ("Southern Vietnam form of không") get the English terms of the word they point to,
  // from that word's senses that aren't themselves variants, preferring the same part of speech
  // (the pronoun "tui" takes the pronoun meanings of "tôi", not its noun "servant").
  const mainGlosses = new Map<string, string[]>()
  const add = (key: string, glosses: string[]) => mainGlosses.set(key, [...(mainGlosses.get(key) ?? []), ...glosses])
  for (const e of entries) {
    const glosses = e.senses.filter((s) => !s.altOf).flatMap((s) => s.glosses)
    if (!glosses.length) continue
    add(`${e.word}\u0000${e.pos}`, glosses)
    add(e.word, glosses)
  }

  // How many senses a word has across all its entries: a rough stand-in for how common it is, since
  // the source has no frequency data (everyday words like "chờ" or "mẹ" have many; obscure ones, one).
  const senseCount = new Map<string, number>()
  for (const e of entries) senseCount.set(e.word, (senseCount.get(e.word) ?? 0) + e.senses.length)

  const index = new Map<string, Hit[]>()
  const seen = new Set<string>()
  for (const e of entries) {
    if (NOT_IN_ENGLISH_INDEX.has(e.pos)) continue
    e.senses.forEach((sense, senseIndex) => {
      const sources = sense.altOf
        ? (mainGlosses.get(`${sense.altOf}\u0000${e.pos}`) ?? mainGlosses.get(sense.altOf) ?? [])
        : sense.glosses
      for (const gloss of sources) {
        for (const [term, position] of termsOf(gloss)) {
          const id = `${term}\u0000${e.word}\u0000${e.pos}\u0000${senseIndex}`
          if (seen.has(id)) continue
          seen.add(id)
          const hit: Hit = {
            word: e.word,
            pos: e.pos,
            gloss: sense.glosses[0],
            regions: sense.regions,
            regionTagged: sense.regionTagged,
            labels: sense.labels,
            senseIndex,
            senses: senseCount.get(e.word) ?? 1,
            primary: position === 0,
          }
          if (sense.altOf) hit.altOf = sense.altOf
          index.set(term, [...(index.get(term) ?? []), hit])
        }
      }
    })
  }
  for (const hits of index.values()) hits.sort((a, b) => Number(b.primary) - Number(a.primary) || a.senseIndex - b.senseIndex)
  return index
}

async function writeShards<T>(dir: string, items: Map<string, T>): Promise<string[]> {
  const shards = new Map<string, Record<string, T>>()
  for (const [key, value] of [...items].sort(([a], [b]) => a.localeCompare(b))) {
    const shard = shardKey(key)
    if (!shards.has(shard)) shards.set(shard, {})
    shards.get(shard)![key] = value
  }
  await mkdir(dir, { recursive: true })
  for (const [shard, data] of shards) await writeFile(join(dir, `${shard}.json`), JSON.stringify(data))
  return [...shards.keys()].sort()
}

async function main() {
  const [lang, ...flags] = process.argv.slice(2)
  if (!lang) throw new Error('Usage: build-language.ts <lang> [--refresh]')
  const config = (await import(join(ROOT, 'languages', `${lang}.ts`))).default as LanguageConfig
  const source = await download(config, flags.includes('--refresh'))

  const entries = await readEntries(source.file, config)
  const byWord = new Map<string, Entry[]>()
  for (const e of entries) byWord.set(e.word, [...(byWord.get(e.word) ?? []), e])
  const english = buildEnglishIndex(entries)

  const outDir = join(ROOT, 'packages', lang, 'data')
  await rm(outDir, { recursive: true, force: true })
  const wordShards = await writeShards(join(outDir, 'words'), byWord as Map<string, WordShard[string]>)
  const enShards = await writeShards(join(outDir, 'en'), english as Map<string, EnglishShard[string]>)

  const senses = entries.flatMap((e) => e.senses)
  const meta: LanguageMeta = {
    lang: config.lang,
    name: config.name,
    regions: config.regions,
    source: {
      name: 'Wiktionary, via Kaikki.org (wiktextract)',
      url: source.url,
      retrieved: source.retrieved,
      lastModified: source.lastModified,
    },
    license: { name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' },
    counts: {
      entries: entries.length,
      senses: senses.length,
      regionTaggedSenses: senses.filter((s) => s.regionTagged).length,
      englishTerms: english.size,
    },
    shards: { words: wordShards, en: enShards },
  }
  await writeFile(join(outDir, 'meta.json'), JSON.stringify(meta, null, 2))

  let bytes = 0
  for (const [sub, names] of [['words', wordShards], ['en', enShards]] as const) {
    for (const n of names) bytes += (await stat(join(outDir, sub, `${n}.json`))).size
  }
  console.log(`${config.name}: ${meta.counts.entries} entries, ${meta.counts.senses} senses ` +
    `(${meta.counts.regionTaggedSenses} region-tagged), ${meta.counts.englishTerms} English terms, ` +
    `${(bytes / 1e6).toFixed(1)} MB in ${wordShards.length + enShards.length} files`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
