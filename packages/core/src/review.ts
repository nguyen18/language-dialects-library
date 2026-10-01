// Reviewing a journal entry written in the target language, the learner's own language, or a mix of both
// ("Hôm nay tôi đi market với má"). For each sentence:
//
//   1. Each word is marked as the target or the base language, from the two dictionaries alone (accents and
//      syllables, headwords, inflected forms); words that could be either take their neighbors' language.
//   2. Base-language parts are replaced: a whole sentence or clause that follows a sentence frame is filled
//      in ("but it was expensive" → "nhưng mắc quá"), short phrases are translated word by word ("market" →
//      "chợ"), and anything longer is listed as unchecked rather than guessed.
//   3. The grammar checker runs on the whole entry, so consistency checks see every sentence ("tôi" here,
//      "tui" there); its errors and warnings are applied, its suggestions returned as hints.
//   4. The corrected sentence is checked against sentence frames ("Bạn có đi?" → "Bạn có đi không?").
//
// Everything is rule-based and runs on the language's data: no API, and nothing language-specific here.

import { createChecker, type CheckRule } from './check.ts'
import { createDictionary, type Dictionary } from './index.ts'
import { createPhrasebook, type FrameOptions } from './phrasebook.ts'
import { plain, sentencesOf, units, type Unit } from './text.ts'
import { createTranslator, type TranslatorOptions } from './translate.ts'

export type ReviewOptions = FrameOptions & {
  /** The learner's own language, for the parts written in it (default "en"). */
  base?: string
}

export type ReviewChange = {
  /** What was written (empty when a missing word was added). */
  from: string
  to: string
  /** One sentence for the learner. */
  why: string
  /** 'translated' (a base-language word), 'frame' (a sentence frame), or the checker rule. */
  kind: 'translated' | 'frame' | CheckRule
}

/** A checker suggestion that wasn't applied ("end with ạ"), for the learner to consider. */
export type ReviewHint = { rule: CheckRule; text: string; message: string; suggestions: string[] }

export type ReviewSentence = {
  /** Offsets of the sentence in Review.text, including its final punctuation. */
  start: number
  end: number
  original: string
  /** The sentence split by language, e.g. [{ text: 'Hôm nay tôi đi', lang: 'vi' }, { text: 'market', lang: 'en' }, …]. */
  parts: { text: string; lang: string }[]
  corrected: string
  changes: ReviewChange[]
  hints: ReviewHint[]
  /** Sentence frames the sentence follows or was built from: the frame's English and its pattern. */
  frames: { id: string; en: string; text: string }[]
  /** Parts the review couldn't handle (longer base-language text that follows no frame), left as written. */
  unchecked: string[]
}

export type Review = {
  /** The entry, in Unicode NFC form; sentence offsets refer to it. */
  text: string
  /** The whole entry with every sentence corrected. */
  corrected: string
  sentences: ReviewSentence[]
}

export type Reviewer = {
  review(entry: string, options: ReviewOptions): Promise<Review>
}

// The longest base-language phrase translated word by word; longer ones need a frame.
const MAX_TRANSLATED_UNITS = 3
const TERMINAL = /^[.!?…]+/

type Replacement = { start: number; end: number; to: string; change: ReviewChange }

export function createReviewer(options: TranslatorOptions = {}): Reviewer {
  const cache = new Map<string, Dictionary>()
  const dict = (lang: string) => {
    let d = cache.get(lang)
    if (!d) {
      d = options.dictionary?.(lang) ?? createDictionary({ lang, baseUrl: options.baseUrl?.(lang), load: options.load?.(lang) })
      cache.set(lang, d)
    }
    return d
  }
  const translator = createTranslator({ ...options, dictionary: dict })
  const phrasebook = createPhrasebook({ ...options, dictionary: dict, translator })
  const checker = createChecker({ ...options, dictionary: dict })

  // Which language each unit is in. A unit the target knows and the base doesn't is the target's, and the
  // other way round; units both or neither know ("an", "to", names) take the nearest decided neighbor's.
  // In syllable languages, a base-language word that's a target syllable only once accents are added
  // ("but": bút) is the base language's; a word only the target knows without its accents ("khong") is
  // still the target's.
  async function languages(list: Unit[], lang: string, base: string): Promise<string[]> {
    const target = dict(lang)
    const syllables = await target.syllables()
    const syllableLanguage = Object.keys(syllables).length > 0
    const plainSyllables = syllableLanguage ? new Set(Object.keys(syllables).map(plain)) : new Set<string>()
    // 'exact': a target word as written; 'accents': one only with accents added ("khong" → "không").
    const targetKnows = async (u: Unit): Promise<'exact' | 'accents' | false> => {
      const lower = u.text.toLowerCase()
      if (!syllableLanguage) return (await target.lookup(lower)).length > 0 ? 'exact' : false
      if (lower in syllables || lower !== plain(lower)) return 'exact'
      return plainSyllables.has(lower) ? 'accents' : false
    }
    const baseKnows = async (u: Unit) => (await translator.senses(u.text, { from: base }).catch(() => [])).length > 0
    const marks = await Promise.all(list.map(async (u) => {
      if (/\d/.test(u.text)) return '?'
      const [t, b] = await Promise.all([targetKnows(u), baseKnows(u)])
      if (t === 'exact') return b ? '?' : lang
      if (b) return base
      return t === 'accents' ? lang : '?'
    }))
    return marks.map((m, i) => {
      if (m !== '?') return m
      for (let d = 1; d < marks.length; d++) {
        if (i - d >= 0 && marks[i - d] !== '?') return marks[i - d]
        if (i + d < marks.length && marks[i + d] !== '?') return marks[i + d]
      }
      return lang
    })
  }

  return {
    async review(entry, o) {
      const text = entry.normalize('NFC')
      const base = o.base ?? 'en'
      const meta = await dict(o.lang).meta()
      // A frame as shown to the learner: its English and its pattern for these settings, slots open.
      const frameInfo = new Map<string, { id: string; en: string; text: string }>()
      const frameOf = async (id: string) => {
        if (!frameInfo.has(id)) {
          const f = await phrasebook.render(id, o)
          frameInfo.set(id, { id, en: f.en, text: f.text })
        }
        return frameInfo.get(id)!
      }

      // 1–2. Sentences, languages, and base-language parts replaced.
      type Draft = {
        start: number; coreEnd: number; end: number; parts: ReviewSentence['parts']
        replacements: Replacement[]; frames: ReviewSentence['frames']; unchecked: string[]
      }
      const drafts: Draft[] = []
      for (const list of sentencesOf(text, units(text))) {
        const start = list[0].start
        const coreEnd = list[list.length - 1].end
        const end = coreEnd + (TERMINAL.exec(text.slice(coreEnd))?.[0].length ?? 0)
        const langs = await languages(list, o.lang, base)
        const groups: { lang: string; units: Unit[] }[] = []
        list.forEach((u, i) => {
          if (groups.length && groups[groups.length - 1].lang === langs[i]) groups[groups.length - 1].units.push(u)
          else groups.push({ lang: langs[i], units: [u] })
        })
        const draft: Draft = {
          start, coreEnd, end, replacements: [], frames: [], unchecked: [],
          parts: groups.map((g) => ({ text: text.slice(g.units[0].start, g.units[g.units.length - 1].end), lang: g.lang })),
        }
        const whole = groups.length === 1 && groups[0].lang === base
        for (const g of groups.filter((g) => g.lang === base)) {
          const from = text.slice(g.units[0].start, g.units[g.units.length - 1].end)
          const at = { start: g.units[0].start, end: g.units[g.units.length - 1].end }
          // A whole sentence is matched with its own punctuation ("Where is the bathroom?").
          const frame = await phrasebook.match(whole ? text.slice(start, end) : from, o)
          if (frame && frame.complete) {
            let to = frame.text.replace(/[.!?…]+$/, '')
            if (!whole && g.units[0].start !== start) to = to.charAt(0).toLowerCase() + to.slice(1)
            const info = await frameOf(frame.id)
            draft.replacements.push({ ...at, to, change: { kind: 'frame', from, to, why: `Sentence frame “${info.en}”` } })
            draft.frames.push(info)
            continue
          }
          if (!whole && g.units.length <= MAX_TRANSLATED_UNITS) {
            const english = from.replace(/^(the|a|an)\s+/i, '')
            const [group] = await translator.translate(english, { from: base, to: o.lang, toRegion: o.region, register: o.register, limit: 1 }).catch(() => [])
            const word = group?.translations[0]?.word
            if (word) {
              draft.replacements.push({ ...at, to: word, change: { kind: 'translated', from, to: word, why: `“${english}” in ${meta.name}` } })
              continue
            }
          }
          draft.unchecked.push(from)
        }
        drafts.push(draft)
      }

      // The entry with base-language parts replaced, keeping where each sentence now is.
      let draftText = ''
      let cursor = 0
      const placed: { start: number; coreEnd: number; end: number }[] = []
      for (const d of drafts) {
        draftText += text.slice(cursor, d.start)
        const s = draftText.length
        let core = text.slice(d.start, d.coreEnd)
        for (const r of [...d.replacements].sort((a, b) => b.start - a.start)) {
          core = core.slice(0, r.start - d.start) + r.to + core.slice(r.end - d.start)
        }
        if (/\p{Lu}/u.test(text.charAt(d.start))) core = core.charAt(0).toUpperCase() + core.slice(1)
        draftText += core + text.slice(d.coreEnd, d.end)
        placed.push({ start: s, coreEnd: s + core.length, end: draftText.length })
        cursor = d.end
      }
      draftText += text.slice(cursor)

      // 3. The checker on the whole entry; 4. frames on each corrected sentence.
      const { issues } = await checker.check(draftText, { lang: o.lang, region: o.region, listener: o.listener, about: undefined, speaker: o.speaker })
      const sentences: ReviewSentence[] = []
      for (const [i, d] of drafts.entries()) {
        const p = placed[i]
        const mine = issues.filter((x) => x.start >= p.start && x.end <= p.coreEnd)
        const changes: ReviewChange[] = d.replacements.sort((a, b) => a.start - b.start).map((r) => r.change)
        const hints: ReviewHint[] = []
        let core = draftText.slice(p.start, p.coreEnd)
        let lastStart = Infinity
        for (const x of [...mine].sort((a, b) => b.start - a.start)) {
          const applies = (x.severity === 'error' || x.severity === 'warning') && x.suggestions.length && x.end <= lastStart
          if (!applies) {
            hints.push({ rule: x.rule, text: x.text, message: x.message, suggestions: x.suggestions })
            continue
          }
          core = core.slice(0, x.start - p.start) + x.suggestions[0] + core.slice(x.end - p.start)
          changes.push({ kind: x.rule, from: x.text, to: x.suggestions[0], why: x.message })
          lastStart = x.start
        }
        const punctuation = draftText.slice(p.coreEnd, p.end)
        let corrected = core + punctuation
        const frames = [...d.frames]
        for (const m of await phrasebook.matchFrames(corrected, o)) {
          if (!frames.some((f) => f.id === m.frame.id)) frames.push(await frameOf(m.frame.id))
          if (m.changes.length && corrected === core + punctuation) {
            corrected = m.text
            for (const c of m.changes) changes.push({ kind: 'frame', from: c.from, to: c.to, why: `${c.why} (sentence frame “${m.frame.en}”)` })
          }
        }
        sentences.push({
          start: d.start, end: d.end, original: text.slice(d.start, d.end), parts: d.parts,
          corrected, changes, hints: hints.reverse(), frames, unchecked: d.unchecked,
        })
      }

      let corrected = ''
      cursor = 0
      for (const s of sentences) {
        corrected += text.slice(cursor, s.start) + s.corrected
        cursor = s.end
      }
      corrected += text.slice(cursor)
      return { text, corrected, sentences }
    },
  }
}
