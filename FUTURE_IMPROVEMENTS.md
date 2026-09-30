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
