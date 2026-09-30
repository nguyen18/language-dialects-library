// Per-language settings for the build. Each language adds one file in languages/.

export type LanguageConfig = {
  /** ISO 639 code; also the data package suffix (which-dialect-<lang>). */
  lang: string
  /** English name. */
  name: string
  /** The language name in Kaikki's URLs, e.g. "Vietnamese" in kaikki.org/dictionary/Vietnamese/. */
  kaikkiName: string
  /** Every region of the language. Untagged senses are listed under all of them. */
  regions: string[]
  /** Named groups of regions, searchable as one (e.g. English "North America"). Every member must be in `regions`. */
  regionGroups?: Record<string, string[]>
  /** Maps a sense's source tags to regions. Return [] when the sense has no region. */
  regionsFromTags: (tags: string[], rawTags: string[]) => string[]
  /** Parts of speech to leave out entirely. */
  skipPos?: string[]
  /**
   * Leave out inflected-form senses (Wiktionary "form-of", e.g. "plural of dog", "simple past of walk").
   * They're most of a heavily inflected language's entries and aren't how learners look words up.
   */
  skipFormOf?: boolean
  /** Return false to leave a headword out. */
  keepWord?: (word: string) => boolean
  /**
   * With skipFormOf off, keep inflected-form senses only for these parts of speech (e.g. English irregular
   * verbs "said" -> "say", but not regular noun plurals). Default: all.
   */
  formOfPos?: string[]
  /** Leave out senses with any of these labels (e.g. obsolete, archaic) to keep a large language small. */
  dropLabels?: string[]
  /** Leave out entries whose every sense is technical (has a Wiktionary topic, e.g. biology, law). */
  dropTechnical?: boolean
  /**
   * For kept inflected-form senses, return false to drop one, e.g. regular English forms ("walked" of
   * "walk") that a reader can undo by rule. Called with the form, the base word and the part of speech.
   */
  keepFormOf?: (form: string, lemma: string, pos: string) => boolean
  /** Keep at most this many senses per entry, and cut glosses longer than maxGlossLength characters. */
  maxSensesPerEntry?: number
  maxGlossLength?: number
  /**
   * Build the English search index (en/). Default true. 'regional' indexes only region-tagged senses:
   * English uses it so "truck" in the UK finds "lorry", without indexing every English word.
   */
  englishIndex?: boolean | 'regional'
  /**
   * Keep each sense's Wiktionary translation table for these language codes (English only: other
   * languages' Wiktionary entries don't have translation tables). Used to boost the usual translation
   * of each meaning.
   */
  translationLangs?: string[]
  /** wordfreq list for ranking common words first ('large' where wordfreq has it). Omit if none. */
  wordfreq?: 'small' | 'large'
  /** Example sentences kept per sense (default 2). */
  maxExamples?: number
  /** Letters per shard key (default 2). Large languages use 3 so each file stays small. */
  shardLength?: number
  /**
   * The pronoun table: how to say "I" and "you" depending on who you're talking to (see
   * scripts/pronouns.ts). For languages whose pronouns depend on the relationship, like Vietnamese.
   */
  pronouns?: PronounRowConfig[]
}

/**
 * One cell entry of the pronoun table. With `gloss`, a pronoun sense of `word` whose definition matches
 * it (region, labels and the definition come from that sense). With `rule`, a regular compound the
 * dictionary doesn't list ("các anh"); `note` names the rule. Otherwise an override for something the
 * definitions don't say; `note` then says why it's there. Rules and overrides can give regions and labels.
 */
type PronounPickExtra = { speaker?: 'male' | 'female'; gender?: 'male' | 'female'; inclusive?: boolean }
export type PronounPick = PronounPickExtra &
  (
    | { word: string; gloss: RegExp; note?: string }
    | { word: string; gloss?: undefined; rule?: boolean; regions?: string[]; labels?: string[]; note: string }
  )

export type PronounRowConfig = {
  id: string
  label: string
  /** The row to use when the relationship isn't known. At most one row. */
  default?: boolean
  warning?: string
} & Partial<Record<'self' | 'addressee' | 'third' | 'selfPlural' | 'addresseePlural' | 'thirdPlural', PronounPick[]>>
