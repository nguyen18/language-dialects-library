# Future improvements

Possible improvements that were found but deliberately left for later. Each has what's wrong, what we
learned about it, and a suggested approach. See `ARCHITECTURE.md` for how things work now.

## Cleanup

### Capitalized words showing up as translations

**Problem:** capitalized words appear next to their lowercase forms in results, e.g. "I" → *ta* and
*Ta*; "him" → *Người*.

**What we found (2026-09-30):** Vietnamese has 541 capitalized headwords that aren't proper names, and
71 of them have a lowercase twin. **Most twins are different words, not duplicates**: *Anh* (British)
vs *anh* (older brother), *Tàu* (Chinese) vs *tàu* (ship), *Hàn* (Korean) vs *hàn* (to weld), *Tây*
(Western) vs *tây*. Some capitalized pronouns are honorifics for specific people: *Người* ("He", for Hồ
Chí Minh or God), *Ta* ("I/me, the Buddha"), *Anh* ("he/him, the young Ho Chi Minh"). Merging every
capitalized word into its lowercase twin would break these.

**Suggested approach:** only fold senses whose definition says "alternative letter-case form of X"
into X (*Chủ nhật*, *Tx.*); keep the rest. In the translator, rank capitalized honorific pronouns below
ordinary ones when the source word isn't capitalized. Check the Cheatsheet and evaluation afterwards.

### Letter names matching pronouns

**Problem:** letter names come up as translations of pronouns: *i ngắn* (the letter i) for "I"; Spanish
*i latina*, *c*/*ce* for *se*. Pronouns are allowed to match nouns (`COMPATIBLE_POS.pron` includes
`noun`), and a letter's definition ("The name of the Latin script letter I/i") contains the pronoun.

**Suggested approach:** only let a letter-name sense ("The name of the … letter …") match when the
source sense is itself a letter.

### Lowercase "i" when looking up translation tables for non-English words

**Problem:** `tableFor()` looks up English bridge terms, which are lowercase, so for "I" it finds the
letter *i*, not the pronoun *I*, and misses its translation table. Spanish *yo* → Vietnamese missed
*tôi* because of this (when Spanish was supported). `englishCandidates()` had the same bug and was
fixed (it also looks up the capitalized word and prefers the exact part of speech); `tableFor()` needs
the same fix.

## Meaning order

### Words whose own meaning competes with a form of another word ("felt", "saw")

**Problem:** without context, a word's meanings come in the dictionary's order, own entries first. So
*felt* starts with the fabric (*phớt*) before "feel" (*cảm thấy*), and *saw* with the tool (*cưa*)
before "see" (*thấy*). In everyday text the past tense is usually meant. The 2026-09-30 fix for
inflected forms (*got* → "Have/has." → *có* first, see ARCHITECTURE.md) deliberately **doesn't change
this**: it only reorders a form's own colloquial meanings, and keeps a form's own entries ahead of its
base word's, as before. Other words like this: *left* (the side / past of leave), *found* (to establish /
past of find), *lay*, *rose*, *bore*, *wound*.

**What we found (2026-09-30):** deciding needs to know which meaning is more common, and the data
doesn't say. The obvious signal, how many languages translate each meaning in Wiktionary's translation
tables, is unreliable because Kaikki often attaches tables to the wrong meaning: *dog*'s 683-language
table sits on "Someone who overeats" (the animal has none), *want*'s 169-language table on "To desire
(to experience desire)" (not "To wish for"), *get*'s on "To receive" (not "To obtain"), *see*'s on "To
understand". Ranking by table size would make many common words worse. The dictionary's order is
otherwise mostly right (dog → animal, see → with the eyes, cool → temperature, just → only).

**Suggested approach:** compare the word's own frequency with the base word's (wordfreq has *felt* and
*feel*, but counts every use of the spelling, so this alone can't separate them); or use corpus counts
per meaning (WordNet's SemCor counts, English only; mapping WordNet's meanings to Wiktionary's is
substantial and imperfect); or let callers pass `pos` (a past-tense *felt* is a verb, the fabric a
noun). Until then, apps should pass `pos` or `meaning` when they know the context.

### Translation tables attached to the wrong meaning

**Problem:** the misattached tables above also affect translation: `TABLE_BONUS` (+4) goes to words
listed for a meaning, so a table on the wrong meaning boosts the wrong words there (and gives the right
meaning none). **Suggested approach:** check a table against the sense it's on (do its English
translations' definitions overlap the sense's?) and move it to the best-matching sense of the same
entry at build time, like `attachEntryTranslations` does for entry-level tables.

### Hand-picked first choices ("picks" layer) — planned next

**Problem:** for common words a native speaker knows the natural first choice, and the data sometimes
doesn't say it. *get* "To fetch, bring, take" ranks *đưa* above *lấy* because *đưa*'s definition ("to
bring, to take, to give, to hand") matches more of the English words and no *lấy* sense says "fetch".
Ranking rules can't fix that without special cases.

**Design (agreed with the owner, 2026-09-30):** a small hand-curated layer **on top of** the ranking,
never instead of it.

- **Keyed by English meaning, not by language pair:** `languages/<lang>.picks.ts` (or similar), rows
  `{ word: 'get', gloss: /fetch/, pos?: 'verb', picks: [{ word: 'lấy' }, { word: 'mang' }] }`. Each
  language adds one list, so work grows with the number of languages, not with pairs. Non-English
  sources reach them the way translation tables do (`tableFor()`): source meaning → matching English
  meaning → the target language's picks. Same format as Wiktionary tables, so good picks can be
  contributed upstream.
- **Where results go:** `translate()` keeps one group per meaning, in the same meaning order. In a
  group whose English meaning has picks: picked words first (in the listed order, `bridge: 'picked'`),
  then the ranked words as today (duplicates of picks removed), cut at `limit` (picks count toward it).
  Meanings without picks are unchanged.
- **Regions:** a pick can carry a region, like tables (`{ word: 'heo', tags: ['Southern'] }`); reuse the
  table's region logic (tagged for `toRegion` first, other regions' picks lower).
- **Meaning order:** picks don't move meanings by default. An optional per-row flag can put that meaning
  first when no context is given (e.g. *got* → "have"); opt-in, since it claims what people usually mean.
- **Source-language keys where English loses distinctions:** English "rice" collapses *gạo*/*cơm*/*lúa*,
  "you" collapses *anh*/*em*/*chị*/*bạn*; bridging two non-English languages through English compounds
  that. Rows can instead be keyed by a source-language meaning, like the (Vietnamese-specific) pronoun
  table.
- **Robustness:** Wiktionary rewords definitions on refresh, so the build checks every row still matches
  a sense and **warns** when not (like `scripts/pronouns.ts`).
- **Keep the ranking visible:** a `picks: false` translator option, and `npm run evaluate` reports with
  and without picks, so scores measure the ranking and the long tail (never hand-picked) doesn't quietly
  get worse.
- **Scope:** only common words where a native speaker notices a wrong answer. Start with the top-100
  list (`~/dev/top_100_words.txt`, already used for before/after comparisons): generate a sheet of each
  word's meanings and current top 3, the owner marks the right first choice, and rows are written from
  that. First candidates: get "fetch" → lấy, mang; get "obtain" → lấy.

**Scaling to more languages (owner's requirement: every feature must work as languages are added):**

1. **Optional per language.** A language with no picks works exactly as today (ranking only), so adding
   a language never requires picks; they're an improvement a speaker adds later.
2. **One list per language, keyed by English meaning.** N languages need N lists, not N² pair lists,
   because translation between two non-English languages goes through the English meaning
   (`tableFor()`). Source-language keys only for distinctions English loses, in that language's file.
3. **Lives with the language, not the API.** Rows in `languages/<lang>.ts` (a `picks` option, like the
   pronoun table's `address`); the build writes `packages/<lang>/data/picks.json` and sets
   `meta.picks: true`; the API loads it on demand like `pronouns.json`. The API package doesn't grow
   with languages, and picks are versioned with that language's data.
4. **Machine-drafted, human-reviewed.** A script (e.g. `npm run picks-sheet -- <lang>`) lists the top
   English words by frequency (wordfreq, already used) × their meanings × the current top 3 and
   Wiktionary's table words. A speaker only marks rows where the first choice is wrong; rows are
   generated from the marks. Reviewing is the only work that grows with languages, and it's the part
   that needs a speaker.
5. **Prioritize by frequency, track coverage.** Top 100 English words first, then 500, 1000. The build
   prints coverage per language (how many of the top-N meanings have a pick or already rank right).
6. **Built to survive data refreshes.** Rows match by English word + part of speech + a definition
   pattern; the build warns for rows that no longer match (as `scripts/pronouns.ts` does), per
   language.
7. **Measured per language.** `npm run evaluate` reports each language with and without picks, and
   each language gets its own evaluation cases.
8. **Upstream when possible.** Picks use Wiktionary's table format, so good ones can be added to
   Wiktionary's translation tables, which then help every language pair on the next refresh.

### The English word itself as weak evidence for words with many meanings ("fix 2")

**Problem:** the English word itself is always a main search term, so for *get* (33 meanings) every
meaning picks up words that only match "get" in some sense (*bắt* "catch" under "have" and "become";
*hóng*, *ra khỏi*). **What we found (2026-09-30, prototype):** dropping the main-term bonus for the
English word when it has ≥ 10 meanings of that part of speech cleaned up most of *get*'s meanings (have
→ có, phải, dùng; become → ra, thành, trở thành) but added other noise (*bỏ* for fetch, *mắc phải* 4th
for obtain) and affects every common English word (*run*, *take*, *make*, *go*, *set*…).
**Suggested approach:** revisit with the top-100 comparison, alone and after picks exist. Related noise:
English bridge words with two meanings (*do* "To perform; to execute" → *tử hình*, execute = put to death).

## Pronouns

- **Possessives:** plain "her" leads with its possessive sense ("belonging to her"), Wiktionary's first,
  which the pronoun table doesn't cover. Vietnamese possessives are *của* + pronoun (*của cô ấy*); a
  possessive column (or deriving it from the pronoun) would fix "her", "my", "your", "his", "their".
- **Region tags on *anh ấy* etc.:** Wiktionary tags *anh ấy*, *chị ấy*, *ông ấy*, *bà ấy*, *cô ấy* as
  Northern only, so a Southern filter drops them for *ảnh*, *chỉ*, *ổng*, *bả*. They're also standard in
  the South. Following the data is the owner's rule, so any change would be an override with a note.
- **Fresh held-out evaluation cases:** the held-out set has been looked at; write new held-out pronoun
  cases (I/you/he/we, with and without `listener`/`about`) before relying on it again.

## More languages

which-dialect is starting with Vietnamese (English is the bridge), and the current focus is cleaning up
Vietnamese. More languages are planned; the code is language-general (region groups, `skipFormOf`,
`translationLangs`, the pronoun table), so adding one is a config file plus a data package (README:
"Adding a language").

### Spanish (removed 2026-09-30, to add back later)

Spanish was supported from 2026-09-27 and removed to focus on Vietnamese. To bring it back: restore
`languages/es.ts` and `packages/es/` from git history (last in commit `e0136ed`), add `'es'` back to
`translationLangs` in `languages/en.ts`, rebuild es and en, and restore the Spanish test suite and
evaluation cases (also in that commit). Known problems to fix when it comes back:

- "you" leads with object forms (*le*, *os*) and mostly misses *tú*: Wiktionary lists the plural and
  object senses of "you" first, and their tables are object clitics.
- "we" includes *escritor*/*pluma*, from the editorial-we sense.
- *tú* → Vietnamese gives dialectal *mầy*/*bay*/*bây*, far stronger than *tú*.
- *ellos* → Vietnamese gives nothing.
- *yo* → Vietnamese misses *tôi* (the lowercase "i" bug in `tableFor`, above).
- *cerdo* without `pos` fails: its adjective sense ("dirty") is listed first.
- A pronoun table for Spanish could cover *tú* / *usted* / *vos* by relationship and region.
- The Spanish data needs a rebuild to pick up the subpage-title fix ("i/languages M to Z" → *i*).

Removing Spanish also shrank the English data from 140.2 to 136.2 MB (it stored Spanish translation
tables), leaving more room under jsDelivr's ~150 MB package limit. Adding languages back will grow it
again; check the size each time.

## Publishing and apps

- Not yet published to npm (needs `npm login`); see "Publishing" in `ARCHITECTURE.md`.
- Language Helper could use `listener`, `about` and `pronounUses` for its Cheatsheet.
