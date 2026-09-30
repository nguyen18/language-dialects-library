// Shapes of the data. The build script (scripts/build-language.ts) writes the Stored* types to the
// data files; the API in index.ts reads them and returns the full Sense/Entry/Hit types.

/** One meaning of a word. Regions are per sense: a word can be common in one meaning and regional in another. */
export type Sense = {
  glosses: string[]
  /**
   * Regions where this sense is used. Senses with no region tag in the source are listed under
   * every region of the language (see `regionTagged`).
   */
  regions: string[]
  /** true when the source tagged the region(s); false when all regions were assumed because it had no tag. */
  regionTagged: boolean
  /** Usage labels from the source, e.g. colloquial, literary, slang, archaic, vulgar. */
  labels: string[]
  /** Set when this sense is a variant of another word, e.g. Vietnamese "hông" is a Southern form of "không". */
  altOf?: string
  /**
   * Same-language words with this meaning, from Wiktionary: often the other dialects' words
   * (Vietnamese "ngô" -> "bắp", "lợn" -> "heo", English "lift" -> "elevator").
   */
  synonyms?: string[]
  /** Example sentences from Wiktionary, with an English translation for non-English languages. */
  examples?: Example[]
  /**
   * English senses only: Wiktionary's translation table for this meaning, by language code: the words
   * editors list as the usual translation of exactly this sense, with region/register tags when given
   * (e.g. "I" → vi: tôi, tớ [informal], tui [South]).
   */
  translations?: Record<string, TableTranslation[]>
}

export type TableTranslation = { word: string; tags?: string[] }

export type Example = { text: string; translation?: string }

export type Entry = {
  word: string
  /** Part of speech, e.g. noun, verb, adj, pron, particle. */
  pos: string
  senses: Sense[]
  /**
   * How common the word is, as a Zipf frequency from wordfreq: log10 of uses per billion words (about 7
   * for "the", 6 for everyday words, 3 for rare ones). Undefined when unknown (usually rare).
   */
  frequency?: number
}

/** One way to say an English term: a word plus the sense that matched. */
export type Hit = {
  word: string
  pos: string
  /** The gloss the English term came from. */
  gloss: string
  regions: string[]
  regionTagged: boolean
  labels: string[]
  altOf?: string
  /** Position of the sense within its entry; earlier senses are usually the main meaning. */
  senseIndex: number
  /** How many senses the word has in total (a fallback commonness signal when `frequency` is missing). */
  senses: number
  /** How common the word is (Zipf frequency, see Entry.frequency). */
  frequency?: number
  /** true when the English term is the first meaning listed in the gloss (e.g. "now" in "now, today"). */
  primary: boolean
}

export type LanguageMeta = {
  /** ISO 639 code, e.g. "vi". */
  lang: string
  /** English name, e.g. "Vietnamese". */
  name: string
  /** The language's regions, e.g. ["Northern", "Central", "Southern"], or countries for English. */
  regions: string[]
  /**
   * Named groups of regions that can be searched as one, e.g. English "North America" or "British Isles".
   * Omitted when the language has none.
   */
  regionGroups?: Record<string, string[]>
  source: { name: string; url: string; retrieved: string; lastModified: string | null }
  license: { name: string; url: string }
  /** Where word frequencies come from, with the credit its license requires. */
  frequencySource?: { name: string; url: string; license: string; sources: string }
  counts: { entries: number; senses: number; regionTaggedSenses: number; englishTerms: number }
  /** Shard file names (without .json) in words/ and en/. */
  shards: { words: string[]; en: string[] }
  /** Letters per shard key; see shardKey. Omitted means 2. */
  shardLength?: number
  /** true when the language has a pronoun table (pronouns.json, see PronounRow). */
  pronouns?: boolean
}

/**
 * One word in the pronoun table: how to say "I", "you", "he/she", "we", plural "you" or "they" in one
 * relationship. Most come from a dictionary definition that describes the relationship ("you, a male
 * who's (presumably) slightly older than me"); regular compounds the dictionary doesn't list come from a
 * grammar rule ("các" + "anh" = plural "you" to older men); the rest are hand-written overrides for what
 * the definitions don't say (Vietnamese "em" is never defined as "I").
 */
export type PronounChoice = {
  word: string
  /** The definition this choice comes from. Omitted for rules and overrides. */
  gloss?: string
  /**
   * Where the choice comes from: a dictionary definition, a grammar rule (a regular compound, with a
   * `note` naming the rule), or a hand-written override with a `note`.
   */
  source: 'gloss' | 'rule' | 'override'
  regions: string[]
  regionTagged: boolean
  labels: string[]
  /** Only when the speaker is male or female ("anh" if you're a man, "chị" if a woman). */
  speaker?: 'male' | 'female'
  /** The gender of the person the word refers to, when it has one ("anh ấy" he, "chị ấy" she). */
  gender?: 'male' | 'female'
  /** For "we": true when it includes the listener ("chúng ta"), false when it doesn't ("chúng tôi"). */
  inclusive?: boolean
  note?: string
}

/** The pronoun table's columns: I, you, he/she, we, you (plural), they. */
export const PRONOUN_PERSONS = ['self', 'addressee', 'third', 'selfPlural', 'addresseePlural', 'thirdPlural'] as const
export type PronounPerson = (typeof PRONOUN_PERSONS)[number]

/**
 * A relationship and the words for it, e.g. Vietnamese "Your parents": you say "con", you call them
 * "ba"/"má" (Southern) or "bố"/"mẹ". For "he/she" and "they" the relationship is with the person you're
 * talking about.
 */
export type PronounRow = {
  /** Stable id, e.g. "parent", "older-male". */
  id: string
  /** Who you're talking to (or about), for display: "Your parents". */
  label: string
  /** How to say "I". */
  self: PronounChoice[]
  /** How to say "you". */
  addressee: PronounChoice[]
  /** How to say "he"/"she" about this person. */
  third: PronounChoice[]
  /** How to say "we" (you and others, talking to this person). */
  selfPlural: PronounChoice[]
  /** How to say "you" to several people like this. */
  addresseePlural: PronounChoice[]
  /** How to say "they" about several people like this. */
  thirdPlural: PronounChoice[]
  /** The row to use when the relationship isn't known (neutral words: Vietnamese "tôi", "bạn"). */
  default?: boolean
  /** A caution for the whole row, e.g. that "tao"/"mày" are rude outside close friendships. */
  warning?: string
}

export type StoredPronounChoice = Omit<PronounChoice, 'regions' | 'regionTagged' | 'labels'> & { regions?: string[]; labels?: string[] }
/** Stored rows leave out empty columns. */
export type StoredPronounRow = Omit<PronounRow, PronounPerson> & Partial<Record<PronounPerson, StoredPronounChoice[]>>

// Stored forms. To keep files small, a sense with no region tag has no `regions` (it means every
// region, regionTagged false), and empty `labels` are left out. The API fills both back in.
export type StoredSense = Omit<Sense, 'regions' | 'regionTagged' | 'labels'> & { regions?: string[]; labels?: string[] }
export type StoredEntry = Omit<Entry, 'senses'> & { senses: StoredSense[] }
export type StoredHit = Omit<Hit, 'regions' | 'regionTagged' | 'labels'> & { regions?: string[]; labels?: string[] }

/** words/<shard>.json: entries keyed by headword. */
export type WordShard = Record<string, StoredEntry[]>

/** en/<shard>.json: hits keyed by lowercase English term. */
export type EnglishShard = Record<string, StoredHit[]>

/** Converts a full sense or hit to its stored form. */
export function toStored<T extends { regions: string[]; regionTagged: boolean; labels: string[] }>(item: T) {
  const { regions, regionTagged, labels, ...rest } = item
  return {
    ...rest,
    ...(regionTagged ? { regions } : {}),
    ...(labels.length ? { labels } : {}),
  }
}

/** Converts a stored sense or hit back to its full form, given the language's regions. */
export function fromStored<T extends { regions?: string[]; labels?: string[] }>(item: T, allRegions: string[]) {
  return {
    ...item,
    regions: item.regions ?? allRegions,
    regionTagged: item.regions !== undefined,
    labels: item.labels ?? [],
  }
}

/**
 * Which shard file a term lives in: its first `length` letters (two by default) without diacritics (đ counts as d, ñ as n),
 * so a lookup only downloads a small file. Characters outside a-z become "_", e.g. "ở" -> "o_", "3D" -> "_d".
 */
export function shardKey(term: string, length = 2): string {
  const base = term
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
  const letter = (c: string) => (c >= 'a' && c <= 'z' ? c : '_')
  let key = ''
  for (let i = 0; i < length; i++) key += letter(base.charAt(i))
  return key
}

/** Normalizes an English search term the same way the index keys were built. */
export function normalizeEnglish(term: string): string {
  return term
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(to|a|an|the) (?=\S)/, '')
}

/**
 * The most useful line of a sense's definitions for display. Wiktionary nests some senses under a
 * heading ("As a copulative verb:" → "Used to indicate that the subject and object are the same."), so
 * headings ending in ":" are skipped in favor of the specific definition.
 */
export function displayGloss(glosses: string[]): string {
  return glosses.find((g) => !g.trim().endsWith(':')) ?? glosses[0] ?? ''
}

// Trailing words dropped to also match the bare verb: "wait for" is found by "wait" too.
export const TRAILING_PARTICLE = / (for|to|at|on|with|about|of|in|into|up|out|off|over)$/

/**
 * Splits an English gloss into search terms, main meaning first: "now, today, this time" ->
 * [["now", 0], ["today", 1], ["this time", 2]]. Parenthesized notes and final punctuation are dropped.
 * When a gloss explains before a colon ("Negates the meaning of the modified verb: not"), only the
 * part after it is used. Only short, plain phrases (up to 4 words) are kept. Returns [term, position].
 */
export function glossTerms(gloss: string): [string, number][] {
  // Grammar words are defined by what they do: "marks the future tense" (Vietnamese "sẽ"), "Used to
  // express the future tense" (English "will"). The phrase after marks/expresses/indicates/denotes is
  // their meaning, so it's a term too, placed after the gloss's own terms.
  const grammar = [...gloss.matchAll(GRAMMAR_PHRASE)].map((m) => normalizeEnglish(m[1])).filter((t) => t.split(' ').length <= 3)
  let cleaned = gloss.replace(/\([^)]*\)/g, ' ').replace(/[“”"]/g, '')
  if (cleaned.includes(':')) cleaned = cleaned.slice(cleaned.lastIndexOf(':') + 1)
  const terms: [string, number][] = []
  let position = 0
  // "I/me" lists two meanings, like "I; me".
  for (const part of cleaned.split(/[;,/]/)) {
    // "etc." is not a meaning: "walking etc" -> "walking", and a lone "etc" is skipped.
    const t = normalizeEnglish(part.replace(/[.!?]+\s*$/, '').replace(/\betc\.?$/i, '').trim())
    if (!t || t.split(' ').length > 4 || !/^[a-z][a-z' -]*$/.test(t)) continue
    terms.push([t, position])
    // The bare verb shares its phrase's position, so "wait" counts as the main meaning of "to wait for".
    const bare = t.replace(TRAILING_PARTICLE, '')
    if (bare !== t && bare) terms.push([bare, position])
    position++
  }
  // A grammar phrase is the main meaning when the gloss's first term is the grammar description itself
  // ("marks the future tense" → "future tense" is what "sẽ" means); otherwise it follows the other terms.
  const describesGrammar = terms.length === 0 || grammar.some((g) => terms[0][0].includes(g))
  for (const t of grammar) if (!terms.some(([x]) => x === t)) terms.push([t, describesGrammar ? 0 : position++])
  return terms
}

const GRAMMAR_PHRASE =
  /\b(?:marks?|marking|express(?:es|ing)?|indicat(?:es?|ing)|denot(?:es?|ing)|signals?)\s+(?:the\s+|a\s+|an\s+)?([a-z][a-z -]{2,30}?)(?=\s*(?:[,;.(]|$|\s+(?:of|in|with|for|or|and|when|that)\b))/gi
