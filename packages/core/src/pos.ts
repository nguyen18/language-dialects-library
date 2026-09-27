// Parts of speech. Entries use Wiktionary's codes (via Kaikki); these give readable names and
// short explanations for learners, and say which codes can translate each other across languages.

export type PosInfo = { name: string; description: string }

export const POS_NAMES: Record<string, PosInfo> = {
  noun: { name: 'Noun', description: 'A person, place, thing or idea: "dog", "city", "happiness".' },
  verb: { name: 'Verb', description: 'An action or state: "run", "think", "be".' },
  adj: { name: 'Adjective', description: 'Describes a noun: "big", "happy", "cool".' },
  adv: { name: 'Adverb', description: 'Describes how, when, where or how much: "quickly", "now", "very".' },
  pron: { name: 'Pronoun', description: 'Stands in for a noun: "I", "you", "she", "they".' },
  det: { name: 'Determiner', description: 'Points to or counts a noun: "the", "a", "this", "some".' },
  article: { name: 'Article', description: 'A determiner like "the" or "a".' },
  prep: { name: 'Preposition', description: 'Shows position or relation: "in", "on", "with", "for".' },
  postp: { name: 'Postposition', description: 'Like a preposition, but placed after its noun.' },
  conj: { name: 'Conjunction', description: 'Joins words or sentences: "and", "but", "because".' },
  intj: { name: 'Interjection', description: 'An exclamation or reaction: "oh", "wow", "yeah".' },
  particle: {
    name: 'Particle',
    description: 'A small word that adds grammar or tone rather than meaning, e.g. Vietnamese "đã" (past), "sẽ" (future), "nhé" (softener).',
  },
  classifier: {
    name: 'Classifier',
    description: 'A word used when counting or pointing at a noun, e.g. Vietnamese "con" for animals, "cái" for objects.',
  },
  num: { name: 'Number', description: 'A number word: "one", "twenty", "first".' },
  contraction: { name: 'Contraction', description: 'Shortened words run together: "don\'t", "I\'m", "gonna".' },
  phrase: { name: 'Phrase', description: 'A fixed group of words with its own meaning.' },
  prep_phrase: { name: 'Prepositional phrase', description: 'A fixed phrase starting with a preposition: "at all", "in time".' },
  proverb: { name: 'Proverb', description: 'A traditional saying.' },
  prefix: { name: 'Prefix', description: 'A word part added to the front of a word: "un-", "re-".' },
  suffix: { name: 'Suffix', description: 'A word part added to the end of a word: "-ness", "-ly".' },
  combining_form: { name: 'Combining form', description: 'A word part only used inside other words.' },
  name: { name: 'Proper noun', description: 'The name of a specific person, place or thing.' },
  symbol: { name: 'Symbol', description: 'A sign or abbreviation that stands for something.' },
  character: { name: 'Character', description: 'A single written character.' },
}

/** Readable name for a part-of-speech code, e.g. "adj" -> "Adjective". Unknown codes are returned as-is. */
export function posName(code: string): string {
  return POS_NAMES[code]?.name ?? code
}

/**
 * Parts of speech that can translate an English part of speech. Languages don't line up one to one:
 * English auxiliary verbs ("will", "can") and many adverbs become particles in Vietnamese, and
 * English adjectives are often verbs in languages without a separate adjective class.
 */
export const COMPATIBLE_POS: Record<string, string[]> = {
  noun: ['noun', 'name', 'phrase'],
  verb: ['verb', 'particle', 'phrase'],
  adj: ['adj', 'verb', 'phrase'],
  adv: ['adv', 'particle', 'phrase', 'prep_phrase'],
  pron: ['pron', 'noun', 'det'],
  det: ['det', 'article', 'num', 'pron', 'particle', 'classifier'],
  article: ['article', 'det', 'num', 'particle', 'classifier'],
  prep: ['prep', 'postp', 'verb', 'adv', 'particle'],
  conj: ['conj', 'particle', 'adv'],
  intj: ['intj', 'particle', 'phrase'],
  num: ['num', 'det'],
  phrase: ['phrase', 'verb', 'adv', 'prep_phrase'],
  prep_phrase: ['prep_phrase', 'phrase', 'adv'],
}

/** The parts of speech to search in another language for an English part of speech. */
export function compatiblePos(englishPos: string): string[] {
  return COMPATIBLE_POS[englishPos] ?? [englishPos]
}
