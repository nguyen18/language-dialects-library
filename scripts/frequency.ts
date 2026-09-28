// Word frequencies from wordfreq (https://github.com/rspeer/wordfreq), used to rank common words first.
//
// wordfreq's data is CC BY-SA 4.0 and must be credited, with its sources (see WORDFREQ_CREDIT, which
// goes into each data package's meta.json and README). Only a single score per word that is already in
// our dictionary is stored, never wordfreq's word lists themselves.

import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { decode } from '@msgpack/msgpack'

export const WORDFREQ_CREDIT = {
  name: 'wordfreq (Robyn Speer, 2022, https://doi.org/10.5281/zenodo.7199437)',
  url: 'https://github.com/rspeer/wordfreq',
  license: 'CC BY-SA 4.0',
  sources:
    'Google Books Ngrams (http://books.google.com/ngrams); Leeds Internet Corpus (University of Leeds Centre ' +
    'for Translation Studies); Wikipedia; ParaCrawl; OPUS OpenSubtitles 2018 (data from OpenSubtitles, ' +
    'opensubtitles.org); SUBTLEX word lists by Marc Brysbaert et al., freely available at ' +
    'http://crr.ugent.be/programs-data/subtitle-frequencies; word statistics from the Twitter streaming API.',
}

/**
 * Loads a wordfreq list (downloading it to .cache on first use) and returns a lookup giving a word's
 * Zipf frequency: log10 of occurrences per billion words (about 7 for "the", 6 for "car", 3 for rare
 * words), rounded to one decimal, or undefined if the word isn't in the list.
 */
export async function loadFrequencies(root: string, lang: string, list: 'small' | 'large') {
  const file = join(root, '.cache', `wordfreq-${list}_${lang}.msgpack.gz`)
  if (!existsSync(file)) {
    const url = `https://raw.githubusercontent.com/rspeer/wordfreq/master/wordfreq/data/${list}_${lang}.msgpack.gz`
    console.log(`Downloading ${url}`)
    const res = await fetch(url)
    if (!res.ok) throw new Error(`wordfreq download failed: ${res.status}`)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, Buffer.from(await res.arrayBuffer()))
  }
  // cBpack format: a header, then buckets; bucket i holds the words whose frequency is 10^(-i/100)
  // (i centibels below 1), so Zipf = 9 - i/100.
  const [header, ...buckets] = decode(gunzipSync(await readFile(file))) as [{ format: string }, ...string[][]]
  if (header?.format !== 'cB') throw new Error(`Unexpected wordfreq format in ${file}`)
  const zipf = new Map<string, number>()
  buckets.forEach((bucket, i) => {
    for (const w of bucket) if (!zipf.has(w)) zipf.set(w, 9 - i / 100)
  })

  const round = (z: number) => Math.round(z * 10) / 10
  return (text: string): number | undefined => {
    const key = text.toLowerCase().normalize('NFC').trim()
    const direct = zipf.get(key)
    if (direct !== undefined) return round(direct)
    // Multi-word terms ("máy tính", "ice cream"): combine the parts like wordfreq does (1/f = sum of 1/f_i),
    // since the lists are of single tokens (Vietnamese: syllables), then take one Zipf point off per extra
    // token: a compound is much rarer than its parts ("cô nương" isn't nearly as common as "cô").
    // Unknown parts mean unknown.
    const parts = key.split(/[\s-]+/).filter(Boolean)
    if (parts.length < 2) return undefined
    let inverse = 0
    for (const p of parts) {
      const z = zipf.get(p)
      if (z === undefined) return undefined
      inverse += 1 / 10 ** (z - 9)
    }
    return round(Math.log10(1 / inverse) + 9 - (parts.length - 1))
  }
}
