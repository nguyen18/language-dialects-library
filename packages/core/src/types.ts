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
}

export type Entry = {
  word: string
  /** Part of speech, e.g. noun, verb, adj, pron, particle. */
  pos: string
  senses: Sense[]
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
  /** How many senses the word has in total. A rough commonness signal: the source has no frequencies. */
  senses: number
  /** true when the English term is the first meaning listed in the gloss (e.g. "now" in "now, today"). */
  primary: boolean
}

export type LanguageMeta = {
  /** ISO 639 code, e.g. "vi". */
  lang: string
  /** English name, e.g. "Vietnamese". */
  name: string
  /** The language's regions, e.g. ["Northern", "Central", "Southern"], or countries for Spanish. */
  regions: string[]
  /**
   * Named groups of regions that can be searched as one, e.g. Spanish "Latin America" or "Caribbean".
   * Omitted when the language has none.
   */
  regionGroups?: Record<string, string[]>
  source: { name: string; url: string; retrieved: string; lastModified: string | null }
  license: { name: string; url: string }
  counts: { entries: number; senses: number; regionTaggedSenses: number; englishTerms: number }
  /** Shard file names (without .json) in words/ and en/. */
  shards: { words: string[]; en: string[] }
  /** Letters per shard key; see shardKey. Omitted means 2. */
  shardLength?: number
}

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
