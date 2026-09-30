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
*tôi* because of this. `englishCandidates()` had the same bug and was fixed (it also looks up the
capitalized word and prefers the exact part of speech); `tableFor()` needs the same fix.

## Pronouns

- **Possessives:** plain "her" leads with its possessive sense ("belonging to her"), Wiktionary's first,
  which the pronoun table doesn't cover. Vietnamese possessives are *của* + pronoun (*của cô ấy*); a
  possessive column (or deriving it from the pronoun) would fix "her", "my", "your", "his", "their".
- **Region tags on *anh ấy* etc.:** Wiktionary tags *anh ấy*, *chị ấy*, *ông ấy*, *bà ấy*, *cô ấy* as
  Northern only, so a Southern filter drops them for *ảnh*, *chỉ*, *ổng*, *bả*. They're also standard in
  the South. Following the data is the owner's rule, so any change would be an override with a note.
- **Fresh held-out evaluation cases:** the held-out set has been looked at; write new held-out pronoun
  cases (I/you/he/we, with and without `listener`/`about`) before relying on it again.

## Spanish

The owner plans to remove Spanish in a refactor. Known Spanish problems, in case it stays or comes back:
"you" leads with object forms (*le*, *os*) and mostly misses *tú*; "we" includes *escritor*/*pluma*
(the editorial-we sense); *tú* → Vietnamese gives dialectal *mầy*/*bay*; *ellos* → Vietnamese gives
nothing; *cerdo* without `pos` fails (its adjective sense "dirty" is listed first). The rebuilt Spanish
data will also pick up the subpage-title fix ("i/languages M to Z" → *i*).

Removing Spanish also frees space in the English data: it stores Spanish translation tables
(`translationLangs` in `languages/en.ts`), and English is at 140.2 MB, close to jsDelivr's ~150 MB
package limit.

## Publishing and apps

- Not yet published to npm (needs `npm login`); see "Publishing" in `ARCHITECTURE.md`.
- Language Helper could use `listener`, `about` and `pronounUses` for its Cheatsheet.
