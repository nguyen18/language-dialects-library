import type { LanguageConfig } from '../scripts/language-config.ts'

// Vietnamese: three dialect regions. The source tags senses with "Northern", "Central" and "Southern";
// "Central" + "North" together means North Central Vietnam, which counts as Central here.
const config: LanguageConfig = {
  lang: 'vi',
  name: 'Vietnamese',
  kaikkiName: 'Vietnamese',
  regions: ['Northern', 'Central', 'Southern'],
  regionsFromTags(tags, rawTags) {
    const found = new Set<string>()
    if (tags.includes('Southern')) found.add('Southern')
    if (tags.includes('Central')) found.add('Central')
    if (tags.includes('Northern') || (tags.includes('North') && !tags.includes('Central'))) found.add('Northern')
    // A few senses spell the region out in free text instead, e.g. "in Central Vietnam and Southern Vietnam".
    for (const raw of rawTags) {
      if (!/vietnam|dialect/i.test(raw)) continue
      if (/south/i.test(raw)) found.add('Southern')
      if (/central/i.test(raw)) found.add('Central')
      if (/north(ern)? vietnam|northern dialect/i.test(raw) && !/north central/i.test(raw)) found.add('Northern')
    }
    return [...found]
  },
  // Chinese characters (chữ Hán/chữ Nôm) and romanizations aren't words a learner looks up.
  skipPos: ['character', 'romanization'],
  keepWord: (word) => /[a-zA-ZÀ-ỹđĐ]/.test(word),
  // wordfreq only has a "small" Vietnamese list (the most common ~25k tokens, which are syllables).
  wordfreq: 'small',
  // How to say "I" and "you" depending on who you're talking to. Each pick with a `gloss` is a pronoun
  // definition from the data ("you, my father"); the few without one are overrides for what Wiktionary's
  // definitions don't say, each with a note.
  address: [
    {
      id: 'friend',
      label: 'A friend your age',
      self: [
        { word: 'mình', gloss: /^I\/me$/ },
        { word: 'tớ', gloss: /^I; me$/ },
        { word: 'tui', gloss: /^alternative form of tôi$/ },
      ],
      addressee: [
        { word: 'bạn', gloss: /^you, a peer of the speaker$/ },
        { word: 'cậu', gloss: /^you, my peer who I know is as old as me$/ },
      ],
    },
    {
      id: 'close-friend',
      label: 'A close friend (very casual)',
      self: [{ word: 'tao', gloss: /^I\/me$/ }],
      addressee: [{ word: 'mày', gloss: /^you$/ }],
      // The definitions only label these "familiar".
      warning: 'Rude with anyone but close friends.',
    },
    {
      id: 'older-male',
      label: 'Someone a bit older (man)',
      self: [{ word: 'em', note: 'Wiktionary defines em only as "refers to any person described by the noun em" (younger sibling, younger person).' }],
      addressee: [{ word: 'anh', gloss: /^you, a male who's \(presumably\) slightly older than me$/ }],
    },
    {
      id: 'older-female',
      label: 'Someone a bit older (woman)',
      self: [{ word: 'em', note: 'Wiktionary defines em only as "refers to any person described by the noun em" (younger sibling, younger person).' }],
      addressee: [{ word: 'chị', gloss: /^you, a female who's \(presumably\) slightly older than me$/ }],
    },
    {
      id: 'younger',
      label: 'Someone younger',
      self: [
        { word: 'anh', gloss: /^I\/me, a male who's \(presumably\) slightly older than you/, speaker: 'male' },
        { word: 'chị', gloss: /^I\/me, a female who's \(presumably\) slightly older than you$/, speaker: 'female' },
      ],
      addressee: [
        { word: 'em', gloss: /^pronoun used to refer to younger person of the same generation$/ },
        { word: 'cậu', gloss: /^you, a male younger than me$/ },
        { word: 'cô', gloss: /^you, a female who's \(presumably\) slightly younger than me$/ },
      ],
    },
    {
      id: 'parent',
      label: 'Your parents',
      self: [{ word: 'con', gloss: /^I\/me \(used by children when talking to their parents\)$/ }],
      addressee: [
        { word: 'ba', regions: ['Southern'], note: 'Southern "dad"; Wiktionary has no pronoun sense for it.' },
        { word: 'má', regions: ['Southern'], note: 'Southern "mom"; Wiktionary has no pronoun sense for it.' },
        { word: 'bố', gloss: /^you, my father$/ },
        { word: 'mẹ', gloss: /^you, my mother$/ },
        { word: 'thầy', gloss: /^you, my father$/ },
      ],
    },
    {
      id: 'parents-age',
      label: "An older adult (your parents' age)",
      self: [
        { word: 'cháu', gloss: /^I\/me, someone who's not your child and who's a lot younger than you$/ },
        { word: 'con', gloss: /^I\/me \(used when talking to someone significantly older than the speaker\)$/ },
      ],
      addressee: [
        { word: 'bác', gloss: /^you, someone who's presumably slightly older than one of my parents$/ },
        { word: 'chú', gloss: /^you, a man who's presumably slightly younger than my parents$/ },
        { word: 'cô', gloss: /^you, a woman who's \(presumably\) slightly younger than either of my parents$/ },
      ],
    },
    {
      id: 'grandparents-age',
      label: "Someone your grandparents' age",
      self: [
        { word: 'cháu', gloss: /^I\/me, your nephew, niece or grandchild$/ },
        { word: 'con', gloss: /^I\/me \(used when talking to someone significantly older than the speaker\)$/ },
      ],
      addressee: [
        { word: 'ông', gloss: /^you, my grandfather$/ },
        { word: 'bà', gloss: /^you, my grandmother$/ },
      ],
    },
    {
      id: 'teacher',
      label: 'Your teacher',
      self: [{ word: 'em', note: 'What students say; Wiktionary defines em as "you" for a child or student, but not as "I".' }],
      addressee: [
        { word: 'thầy', gloss: /^you, my male teacher$/ },
        { word: 'cô', gloss: /^you, my older female teacher$/ },
      ],
    },
    {
      id: 'partner',
      label: 'Your partner',
      self: [
        { word: 'anh', gloss: /^I\/me, your boyfriend older than you$/, speaker: 'male' },
        { word: 'em', speaker: 'female', note: 'Wiktionary defines em as "you" for the woman in a relationship, but not as "I".' },
      ],
      addressee: [
        { word: 'em', gloss: /^pronoun used to refer to the girl or woman in a romantic relationship$/, speaker: 'male' },
        { word: 'anh', gloss: /^you, my boyfriend$/, speaker: 'female' },
        { word: 'mình', gloss: /^you \(used for one's spouse\)$/ },
      ],
    },
    {
      id: 'formal',
      label: 'A stranger, formal, work',
      self: [{ word: 'tôi', gloss: /^I\/me \(used in formal contexts/ }],
      addressee: [
        { word: 'anh', gloss: /^you, a young adult man$/ },
        { word: 'chị', gloss: /^you, a young-adult woman$/ },
        { word: 'ông', gloss: /^you, a man about 40 or older$/ },
        { word: 'bà', gloss: /^you, a woman about 40 or older$/ },
      ],
    },
  ],
}

export default config
