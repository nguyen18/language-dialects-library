import type { LanguageConfig, PronounPick } from '../scripts/language-config.ts'

// Regular compounds for the pronoun table (the dictionary doesn't list them): "các" makes a plural
// ("các anh", you older men), "chúng" a plural "we" ("chúng em"), Southern "tụi" either ("tụi em"), and
// "ấy" ("that") a "he/she" ("em ấy"). Extra fields (regions, gender, speaker, inclusive) pass through.
type Extra = Partial<Pick<PronounPick, 'speaker' | 'gender' | 'inclusive'>> & { regions?: string[] }
const cac = (w: string, extra: Extra = {}): PronounPick => ({ word: `các ${w}`, rule: true, note: `các (plural) + ${w}`, ...extra })
const chung = (w: string, extra: Extra = {}): PronounPick => ({ word: `chúng ${w}`, rule: true, note: `chúng (plural "we") + ${w}`, inclusive: false, ...extra })
const tui_ = (w: string, extra: Extra = {}): PronounPick => ({ word: `tụi ${w}`, rule: true, regions: ['Southern'], note: `tụi (Southern plural) + ${w}`, ...extra })
const ay = (w: string, extra: Extra = {}): PronounPick => ({ word: `${w} ấy`, rule: true, note: `${w} + ấy ("that"): he/she`, ...extra })
const EM_NOTE = 'Wiktionary defines em only as "refers to any person described by the noun em" (younger sibling, younger person).'

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
  // Place names are indexed for English search ("Japan" → "Nhật Bản"); given names aren't.
  placeNames: {},
  keepWord: (word) => /[a-zA-ZÀ-ỹđĐ]/.test(word),
  // wordfreq only has a "small" Vietnamese list (the most common ~25k tokens, which are syllables).
  wordfreq: 'small',
  // Sentence frames (the shared catalog is languages/frames.ts). Placeholders: the frame's content slots
  // (lowercase), pronoun slots ({I}, {YOU}, {WE_INCL}: from the pronoun table for the listener) and frame
  // word slots (uppercase, below), which carry the regional differences.
  frames: [
    { frame: 'today', text: 'Hôm nay {I} {action}.' },
    { frame: 'yesterday', text: 'Hôm qua {I} {action}.' },
    { frame: 'tomorrow', text: 'Ngày mai {I} sẽ {action}.' },
    { frame: 'want-to', text: '{I} muốn {action}.' },
    { frame: 'want', text: '{I} muốn {thing}.' },
    { frame: 'like-to', text: '{I} thích {action}.' },
    { frame: 'like', text: '{I} thích {thing}.' },
    { frame: 'went-to', text: '{I} đã đi {place}.' },
    { frame: 'have-to', text: '{I} phải {action}.' },
    { frame: 'can', text: '{I} có thể {action}.' },
    { frame: 'cannot', text: '{I} {NOT} thể {action}.' },
    { frame: 'dont-know', text: '{I} {NOT} biết.' },
    { frame: 'dont-understand', text: '{I} {NOT} hiểu.' },
    { frame: 'feel', text: '{I} cảm thấy {quality}.' },
    { frame: 'am', text: '{I} {quality}.' },
    { frame: 'it-was', text: '{quality} quá.' },
    { frame: 'but-it-was', text: 'nhưng {quality} quá' },
    { frame: 'ask-where', text: '{place} ở {WHERE}?' },
    { frame: 'ask-what', text: '{thing} là {WHAT}?' },
    { frame: 'ask-how', text: '{thing} {HOW}?' },
    { frame: 'ask-when', text: '{WHEN} {YOU} {action}?' },
    { frame: 'ask-how-much', text: '{thing} bao nhiêu tiền?' },
    { frame: 'ask-eaten', text: '{YOU} ăn cơm chưa {POLITE}?' },
    { frame: 'ask-done', text: '{YOU} đã {action} chưa {POLITE}?' },
    { frame: 'ask-want', text: '{YOU} có muốn {thing} {Q_END} {POLITE}?' },
    { frame: 'ask-yes-no', text: '{YOU} có {action} {Q_END} {POLITE}?' },
    { frame: 'help-me', text: '{YOU} giúp {I} được {Q_END} {POLITE}?' },
    { frame: 'give-me', text: 'Cho {I} {thing} {POLITE}.' },
    { frame: 'lets', text: '{WE_INCL} {action} {SOFT}.' },
    { frame: 'hello', text: 'Chào {YOU} {POLITE}.' },
    { frame: 'thanks', text: 'Cảm ơn {YOU} {POLITE}.' },
    { frame: 'sorry', text: '{I} xin lỗi {YOU} {POLITE}.' },
    { frame: 'goodbye', text: 'Hẹn gặp lại {YOU} {POLITE}.' },
    { frame: 'good-night', text: 'Chúc {YOU} ngủ ngon {POLITE}.' },
  ],
  // The words that change by region or politeness. Choices for the user's region come first; casual ones
  // (colloquial, informal) only with register: 'casual'.
  frameWords: {
    WHERE: { meaning: 'where', words: [
      { word: 'đâu', gloss: /^where$/ },
      { word: 'mô', gloss: /^where$/ },
    ] },
    WHAT: { meaning: 'what', words: [
      { word: 'gì', gloss: /^what; whatever$/ },
      { word: 'chi', gloss: /^what; whatever$/ },
    ] },
    HOW: { meaning: 'how', words: [
      { word: 'thế nào', gloss: /^how; what; in what manner/ },
      { word: 'sao', gloss: /^how$/ },
      { word: 'răng', gloss: /^why; how; what$/ },
    ] },
    WHEN: { meaning: 'when', words: [
      { word: 'khi nào', gloss: /^when$/ },
      { word: 'chừng nào', regions: ['Southern'], labels: ['colloquial'], note: 'Southern casual "when"; Wiktionary labels it colloquial but gives no region.' },
    ] },
    NOT: { meaning: 'not', words: [
      { word: 'không', gloss: /^Negates the meaning/ },
      { word: 'hông', regions: ['Southern'], labels: ['colloquial'], note: 'Southern casual "không"; Wiktionary has it as a variant of không.' },
    ] },
    Q_END: { meaning: 'yes/no question ending', words: [
      { word: 'không', gloss: /^Used to form polar questions/ },
      { word: 'hông', regions: ['Southern'], labels: ['colloquial'], note: 'Southern casual "không"; Wiktionary has it as a variant of không.' },
    ] },
    SOFT: { meaning: 'friendly ending (okay?)', optional: true, words: [
      { word: 'nhé', gloss: /^alright\?; okay\?; will you\?$/ },
      { word: 'nha', gloss: /^alright\?; okay\?; will you\?$/ },
    ] },
    POLITE: { meaning: 'polite ending', optional: true, words: [
      { word: 'ạ', gloss: /^Used at the end of the sentence to express formality or politeness/, when: 'respect' },
    ] },
  },
  // The grammar checker (see CheckerConfig). Vietnamese is written in syllables that group into words
  // ("thịt heo", "kết quả"); the longest common words are about 4 syllables.
  checker: {
    units: 'syllables',
    maxWordUnits: 4,
    // Only pronouns that are reliably pronouns. Left out on purpose: kinship words (con is also "child"
    // and a classifier: con chó), mình (also "body, self"), nó (also "it"), họ (also "surname").
    pronouns: {
      self: ['tôi', 'tui', 'tớ', 'tao'],
      selfPlural: ['chúng tôi', 'chúng ta', 'chúng mình', 'chúng tao', 'tụi tui', 'tụi tao', 'tụi mình'],
      addressee: ['mày', 'bạn'],
      addresseePlural: ['các bạn', 'chúng mày', 'tụi mày', 'quý vị'],
    },
    // bạn is also "friend" (bạn của tôi: my friend), so it's only ever a suggestion.
    ambiguousPronouns: ['bạn'],
    // Expected at the end of sentences said to parents, elders and teachers (rows marked respect).
    politeEndings: ['ạ'],
    // English words Vietnamese has no word for: no articles, so they're left out, not translated.
    leaveOut: ['the', 'a', 'an'],
    // Letters often confused: c/k/q and s/x sound alike, i/y are interchangeable in many words, m/n are
    // next to each other and both end syllables ("ơm" for "ơn").
    similarLetters: ['ckq', 'sx', 'iy', 'mn'],
  },
  // How to say "I", "you", "he/she", "we", plural "you" and "they" depending on who you're talking to
  // (or about). Picks with a `gloss` are pronoun definitions from the data ("you, my father"); rules are
  // regular compounds the dictionary doesn't list ("các" + "anh"); the few others are overrides for what
  // Wiktionary's definitions don't say, each with a note.
  pronouns: [
    {
      id: 'general',
      label: 'Anyone / not sure (neutral)',
      default: true,
      self: [
        { word: 'tôi', gloss: /^I\/me \(used in formal contexts/ },
        { word: 'mình', gloss: /^I\/me$/ },
        { word: 'tui', gloss: /^alternative form of tôi$/ },
      ],
      addressee: [
        { word: 'bạn', gloss: /^you, an unspecified person viewing a work/ },
        { word: 'anh', gloss: /^you, a young adult man$/, gender: 'male' },
        { word: 'chị', gloss: /^you, a young-adult woman$/, gender: 'female' },
      ],
      third: [
        { word: 'anh ấy', gloss: /^he \(man of equal or slightly greater social status\)$/, gender: 'male' },
        { word: 'chị ấy', gloss: /^she \(who is somewhat older than the speaker\)$/, gender: 'female' },
        { word: 'ảnh', gloss: /^he; him \(man of equal or slightly greater social status\)$/, gender: 'male' },
        { word: 'chỉ', gloss: /^she; her$/, gender: 'female' },
        { word: 'nó', gloss: /^he; him; she; her$/ },
      ],
      selfPlural: [
        { word: 'chúng tôi', gloss: /^we\/us \(exclusive\)/, inclusive: false },
        { word: 'chúng ta', gloss: /^we\/us \(inclusive\)/, inclusive: true },
        { word: 'chúng mình', gloss: /^we\/us \(inclusive\)$/, inclusive: true },
        { word: 'tụi tui', gloss: /^we\/us \(exclusive\)$/, inclusive: false },
      ],
      addresseePlural: [
        cac('bạn'),
        { word: 'mọi người', gloss: /you guys/ },
      ],
      thirdPlural: [
        { word: 'họ', gloss: /^they\/them \(used in formal situations/ },
        { word: 'chúng nó', gloss: /^they\/them$/ },
        { word: 'tụi nó', gloss: /^they\/them$/ },
      ],
    },
    {
      id: 'friend',
      label: 'A friend your age',
      self: [
        { word: 'mình', gloss: /^I\/me$/ },
        { word: 'tớ', gloss: /^I; me$/ },
        { word: 'tui', gloss: /^alternative form of tôi$/ },
        { word: 'tôi', gloss: /^I\/me \(used when talking to one's friends\)$/ },
      ],
      addressee: [
        { word: 'bạn', gloss: /^you, a peer of the speaker$/ },
        { word: 'cậu', gloss: /^you, my peer who I know is as old as me$/ },
      ],
      third: [ay('bạn'), ay('cậu')],
      selfPlural: [
        { word: 'chúng mình', gloss: /^we\/us \(inclusive\)$/, inclusive: true },
        tui_('mình', { inclusive: true }),
        chung('tớ', { regions: ['Northern'] }),
        { word: 'tụi tui', gloss: /^we\/us \(exclusive\)$/, inclusive: false },
      ],
      addresseePlural: [cac('bạn'), cac('cậu')],
      thirdPlural: [
        { word: 'chúng nó', gloss: /^they\/them$/ },
        { word: 'tụi nó', gloss: /^they\/them$/ },
      ],
    },
    {
      id: 'close-friend',
      label: 'A close friend (very casual)',
      self: [{ word: 'tao', gloss: /^I\/me$/ }],
      addressee: [{ word: 'mày', gloss: /^you$/ }],
      third: [{ word: 'nó', gloss: /^he; him; she; her$/ }],
      selfPlural: [
        { word: 'chúng tao', gloss: /^we; us \(exclusive\)$/, inclusive: false },
        tui_('tao'),
      ],
      addresseePlural: [
        { word: 'chúng mày', gloss: /^you \(second-person plural\)$/ },
        tui_('mày'),
        { word: 'bây', gloss: /^you \(second-person plural\)$/ },
      ],
      thirdPlural: [
        { word: 'chúng nó', gloss: /^they\/them$/ },
        { word: 'tụi nó', gloss: /^they\/them$/ },
      ],
      // The definitions only label these "familiar".
      warning: 'Rude with anyone but close friends.',
    },
    {
      id: 'older-male',
      label: 'Someone a bit older (man)',
      self: [{ word: 'em', note: EM_NOTE }],
      addressee: [{ word: 'anh', gloss: /^you, a male who's \(presumably\) slightly older than me$/ }],
      third: [
        { word: 'anh ấy', gloss: /^he \(man of equal or slightly greater social status\)$/, gender: 'male' },
        { word: 'ảnh', gloss: /^he; him \(man of equal or slightly greater social status\)$/, gender: 'male' },
      ],
      selfPlural: [chung('em'), tui_('em')],
      addresseePlural: [cac('anh')],
      thirdPlural: [cac('anh ấy')],
    },
    {
      id: 'older-female',
      label: 'Someone a bit older (woman)',
      self: [{ word: 'em', note: EM_NOTE }],
      addressee: [{ word: 'chị', gloss: /^you, a female who's \(presumably\) slightly older than me$/ }],
      third: [
        { word: 'chị ấy', gloss: /^she \(who is somewhat older than the speaker\)$/, gender: 'female' },
        { word: 'chỉ', gloss: /^she; her$/, gender: 'female' },
      ],
      selfPlural: [chung('em'), tui_('em')],
      addresseePlural: [cac('chị')],
      thirdPlural: [cac('chị ấy')],
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
      third: [ay('em'), { word: 'nó', gloss: /^he; him; she; her$/ }],
      selfPlural: [chung('anh', { speaker: 'male' }), chung('chị', { speaker: 'female' })],
      addresseePlural: [cac('em')],
      thirdPlural: [
        { word: 'chúng nó', gloss: /^they\/them$/ },
        { word: 'tụi nó', gloss: /^they\/them$/ },
      ],
    },
    {
      id: 'parent',
      respect: true,
      label: 'Your parents',
      self: [{ word: 'con', gloss: /^I\/me \(used by children when talking to their parents\)$/ }],
      addressee: [
        { word: 'ba', regions: ['Southern'], note: 'Southern "dad"; Wiktionary has no pronoun sense for it.' },
        { word: 'má', regions: ['Southern'], note: 'Southern "mom"; Wiktionary has no pronoun sense for it.' },
        { word: 'bố', gloss: /^you, my father$/ },
        { word: 'mẹ', gloss: /^you, my mother$/ },
        { word: 'thầy', gloss: /^you, my father$/ },
      ],
      third: [
        { word: 'ba', regions: ['Southern'], gender: 'male', note: 'Southern "dad", also for "he" about your father; no pronoun sense in Wiktionary.' },
        { word: 'má', regions: ['Southern'], gender: 'female', note: 'Southern "mom", also for "she" about your mother; no pronoun sense in Wiktionary.' },
        { word: 'bố', gloss: /^he\/him, your\/my father$/, gender: 'male' },
        { word: 'mẹ', gender: 'female', note: 'Also "she" about your mother; Wiktionary only defines it as "I" and "you".' },
      ],
      selfPlural: [chung('con'), tui_('con')],
    },
    {
      id: 'parents-age',
      respect: true,
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
      third: [
        { word: 'bác', gloss: /^he\/him\/she\/her, someone who's presumably slightly older than one of my parents$/ },
        ay('chú', { gender: 'male' }),
        { word: 'cô ấy', gender: 'female', note: 'Wiktionary defines cô ấy only for a young woman; about a woman your parents\' age it\'s cô + ấy ("that").' },
      ],
      selfPlural: [chung('cháu', { regions: ['Northern'] }), chung('con', { regions: ['Central', 'Southern'] })],
      addresseePlural: [cac('bác'), cac('chú'), cac('cô')],
    },
    {
      id: 'grandparents-age',
      respect: true,
      label: "Someone your grandparents' age",
      self: [
        { word: 'cháu', gloss: /^I\/me, your nephew, niece or grandchild$/ },
        { word: 'con', gloss: /^I\/me \(used when talking to someone significantly older than the speaker\)$/ },
      ],
      addressee: [
        { word: 'ông', gloss: /^you, my grandfather$/ },
        { word: 'bà', gloss: /^you, my grandmother$/ },
      ],
      third: [
        { word: 'ông ấy', gloss: /^he \(older or respected man\)$/, gender: 'male' },
        { word: 'bà ấy', gloss: /^she \(woman of higher social status, e\.g\., older\)$/, gender: 'female' },
        { word: 'ổng', gloss: /^he; him \(older or respected man\)$/, gender: 'male' },
        { word: 'bả', gloss: /^she; her \(woman of higher social status\)$/, gender: 'female' },
      ],
      selfPlural: [chung('cháu', { regions: ['Northern'] }), chung('con', { regions: ['Central', 'Southern'] })],
      addresseePlural: [cac('ông'), cac('bà')],
    },
    {
      id: 'teacher',
      respect: true,
      label: 'Your teacher',
      self: [{ word: 'em', note: 'What students say; Wiktionary defines em as "you" for a child or student, but not as "I".' }],
      addressee: [
        { word: 'thầy', gloss: /^you, my male teacher$/ },
        { word: 'cô', gloss: /^you, my older female teacher$/ },
      ],
      third: [
        { word: 'thầy', gloss: /^he\/him, that male teacher we're talking about$/, gender: 'male' },
        { word: 'cô', gloss: /^she\/her, my\/your\/our female teacher$/, gender: 'female' },
      ],
      selfPlural: [chung('em')],
      addresseePlural: [cac('thầy'), cac('cô')],
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
      third: [
        { word: 'anh ấy', gloss: /^he \(man of equal or slightly greater social status\)$/, gender: 'male' },
        { word: 'cô ấy', gloss: /^she \(towards a young girl or woman\)$/, gender: 'female' },
        { word: 'hắn', gloss: /^he\/him, my boyfriend$/, gender: 'male' },
      ],
      selfPlural: [
        { word: 'chúng mình', gloss: /^we\/us \(inclusive\)$/, inclusive: true },
        { word: 'mình', gloss: /^we\/us$/, inclusive: true },
      ],
    },
    {
      id: 'formal',
      label: 'A stranger, formal, work',
      self: [{ word: 'tôi', gloss: /^I\/me \(used in formal contexts/ }],
      addressee: [
        { word: 'anh', gloss: /^you, a young adult man$/, gender: 'male' },
        { word: 'chị', gloss: /^you, a young-adult woman$/, gender: 'female' },
        { word: 'ông', gloss: /^you, a man about 40 or older$/, gender: 'male' },
        { word: 'bà', gloss: /^you, a woman about 40 or older$/, gender: 'female' },
      ],
      third: [
        { word: 'ông ấy', gloss: /^he \(older or respected man\)$/, gender: 'male' },
        { word: 'bà ấy', gloss: /^she \(woman of higher social status, e\.g\., older\)$/, gender: 'female' },
        { word: 'anh ấy', gloss: /^he \(man of equal or slightly greater social status\)$/, gender: 'male' },
        { word: 'chị ấy', gloss: /^she \(who is somewhat older than the speaker\)$/, gender: 'female' },
      ],
      selfPlural: [
        { word: 'chúng tôi', gloss: /^we\/us \(exclusive\)/, inclusive: false },
        { word: 'chúng ta', gloss: /^we\/us \(inclusive\)/, inclusive: true },
      ],
      addresseePlural: [{ word: 'quý vị', gloss: /^you$/ }, cac('anh chị')],
      thirdPlural: [{ word: 'họ', gloss: /^they\/them \(used in formal situations/ }],
    },
  ],
  // Hand-picked first choices for English meanings (see scripts/picks.ts), reviewed by the owner. Only
  // where a native speaker knows the natural word and the ranking puts another first.
  picks: [
    {
      word: 'get', pos: 'verb', gloss: /^To fetch, bring, take/, picks: ['lấy', 'mang'],
      note: 'The ranking gives "đưa" (to hand, to bring): its definition matches more of the English words, and no "lấy" sense says "fetch".',
    },
    {
      word: 'get', pos: 'verb', gloss: /^To obtain; to acquire/, picks: ['lấy'],
      note: '"được" is common mostly as a helper verb ("được đi"); "lấy" is the everyday word.',
    },
    // Small grammar words, for translating English words one by one (the checker's foreign-word check):
    // without a pick, "but" is "song" (literary) from its first-listed meaning "except".
    {
      word: 'but', pos: 'conj', gloss: /^However, although, nevertheless/, picks: ['nhưng'], first: true,
      note: 'The everyday "but"; Wiktionary\'s table for this meaning also says nhưng.',
    },
    {
      word: 'be', pos: 'verb', gloss: /^Used to declare the subject and object identical or equivalent/, picks: ['là'], first: true,
      note: '"is" on its own: "là" (X là Y), not the passive "bị" from its first-listed meaning.',
    },
    {
      word: 'very', pos: 'adv', gloss: /^To a great extent or degree/, picks: ['rất'], first: true,
      note: 'The neutral "very"; "quá" is closer to "so, too".',
    },
    {
      word: 'of', pos: 'prep', gloss: /^Belonging to, existing in, or taking place in/, picks: ['của'], first: true,
      note: 'Possession ("the book of my friend": sách của bạn tôi); the first-listed meanings are distance and separation.',
    },
  ],
}

export default config
