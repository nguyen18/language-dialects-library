// Per-language settings for the build. Each language adds one file in languages/.

export type LanguageConfig = {
  /** ISO 639 code; also the data package suffix (language-dialects-library-<lang>). */
  lang: string
  /** English name. */
  name: string
  /** The language name in Kaikki's URLs, e.g. "Vietnamese" in kaikki.org/dictionary/Vietnamese/. */
  kaikkiName: string
  /** Every region of the language. Untagged senses are listed under all of them. */
  regions: string[]
  /** Maps a sense's source tags to regions. Return [] when the sense has no region. */
  regionsFromTags: (tags: string[], rawTags: string[]) => string[]
  /** Parts of speech to leave out entirely. */
  skipPos?: string[]
  /** Return false to leave a headword out. */
  keepWord?: (word: string) => boolean
}
