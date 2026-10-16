// tests/atelier-grammar-varieties.test.ts — A CODE PATH, A DIALECT, A LANGUAGE MIXED IN: LISTED, NEVER CHANGED.
//
// The one rule at the head of core/observers/grammar.ts, held against the real engine (harper.js) in every dialect
// setting. Each sentence below is correct as written in some register or variety, and each was rewritten in place
// before this change: "an nda" and "a usb stick" (an article read by its letters), "std::vector" and "hmm.." (a code
// path, a trailing-off), "Bonjour !" and "Q : Where" (French and typographic spacing), "stoped" and "posible" (a word
// of a trade, a word of Spanish), "we was" and "they was" (the levelled past of most British dialects). What is still
// corrected in place is pinned beside them.
import { it, expect, beforeAll, afterAll } from 'vitest';
import { describeWithEngine } from './harper-engine.js';
import { setGrammarProvider, ensureGrammar, resetGrammar, readGrammar, grammarStatus } from '../core/observers/grammar.js';
import { MISSPELLINGS } from '../core/observers/grammar-words.js';
import { harperGrammar } from '../providers/harper.js';
import { grammarProvider } from '../providers/grammar.js';
import { correctMechanicalErrors } from '../core/loop/mechanical-repair.js';

type Params = Record<string, readonly string[]>;
const DIALECTS: readonly Params[] = [{}, { dialect: ['british'] }, { dialect: ['american'] }];
const fixed = (text: string, p: Params): string => correctMechanicalErrors(text, readGrammar(text, p).confirmed).text;
const listed = (text: string, p: Params): string[] => readGrammar(text, p).uncertain.map((u) => u.text.trim());

// Each with the stretch that must be listed for the person to read.
const ARTICLE_LISTED: readonly (readonly [string, string])[] = [
  ['We signed an nda before the demo.', 'an'], ['Send an rsvp by Friday if you can.', 'an'],
  ['She had an mri on her shoulder last week.', 'an'], ['Plug in a usb stick and copy the photos over.', 'a'],
  ['Pick an lts release for the server.', 'an'], ['We hired an seo agency for the launch.', 'an'],
  ['Please send me an sms when you reach.', 'an'], ['shipped an mvp this weekend, roast it pls', 'an'],
  ['just an fyi, the meetup moved to thursday', 'an'], ['An led lamp lit the hall.', 'An'], ['We filed an sec form on time.', 'an'],
  ['Keep it under an mph limit of twenty.', 'an'], ['Put the ashes in an urn on the shelf.', 'an'], ['They sent a sos call at dawn.', 'a'],
];
const ARTICLE_UNCHANGED: readonly string[] = [
  'He drove an hgv for twenty years.', 'That\'s an ux problem, not a bug.', 'I booked an Uber to the station.',
  'The vet took an x-ray of the dog\'s leg.', 'Set an f-stop of eight and focus on the eyes.', 'A US firm bought the plant.',
  // the checker guesses the sound of a "u": "an urchin", "a unanimous", "a uvula" are right as written
  'The diver found an urchin on the rock.', 'It was a unanimous vote.', 'The doctor looked at a uvula all day.',
];
const ARTICLE_FIXED: readonly (readonly [string, string])[] = [
  ['She wrote a essay about her summer holiday.', 'She wrote an essay about her summer holiday.'],
  ['We saw a elephant at the safari park.', 'We saw an elephant at the safari park.'],
  ['He bought an new bike for the race.', 'He bought a new bike for the race.'],
  ['He bought an bike last week.', 'He bought a bike last week.'], ['She cracked a egg into the pan.', 'She cracked an egg into the pan.'],
];

const MARKS_LISTED: readonly (readonly [string, string])[] = [
  ['We swapped the raw array for a std::vector and the leak went away.', '::'], ['Call Vec::new and push the items one by one.', '::'],
  ['Use the Foo::Bar module for parsing.', '::'], ['The ratio was set at x:: y in the old notes.', '::'],
  ['hmm.. not sure about that one tbh', '..'], ['ok.. see you there', '..'], ['omg.. so tired, see u all tomorrow', '..'],
  ['Wait.. you\'re telling me the shop closed??', '??'], ['It held!! Nobody moved.', '!!'], ['Bring the following;; a torch and water.', ';;'],
  ['Q : Where were you that night?', ':'], ['Elle a dit : non merci, et elle est partie.', ':'], ['Bonjour ! he called across the square.', '!'],
  ['Are you coming to the match tonight ?', '?'], ['The final score was a draw ; nobody was happy.', ';'],
];
// Inside guillemets and low-high quotes: a quotation, never read at all.
const QUOTED: readonly string[] = [
  'My host mum in Lyon would shout « À table ! » at seven sharp.', 'The sign said « Fermé : retour à 14h », so we waited outside.',
  'He wrote ‹ Non ! › on the card.', 'Sie rief „Halt !“ und lief weiter.', 'The poster read »Ruhe !« in red.',
];
const MARKS_FIXED: readonly (readonly [string, string])[] = [
  ['The release went out,, and nobody noticed.', 'The release went out, and nobody noticed.'],
  ['The meeting is over .', 'The meeting is over.'],
  ['The cat licked its paw , then slept.', 'The cat licked its paw, then slept.'],
];

const REMOVED = ['stoped', 'dilema', 'posible', 'assistent', 'correspondance', 'agression', 'agressive', 'adress', 'adresses', 'adquire',
  'paralel', 'anual', 'consistant', 'persistant', 'excede', 'accesible', 'untill', 'independant', 'independance', 'priviledge',
  'developement', 'truely', 'peculier'];
const WORDS_UNCHANGED: readonly string[] = [
  'The ore body was stoped from the lower level before the crew moved up.', 'The miners stoped upward along the lode.',
  'Es posible que llueva, so bring a coat.', 'Mi abuela says it\'s not posible to make tamales in one afternoon.',
  'Honestly, it\'s a real dilema para mí, I don\'t know what to choose.', 'Er wurde mein assistent in Hamburg last year.',
  'La correspondance pour Lyon part du quai 3, the guard told us.', 'The Supplier shall use its best endeavours untill completion.',
];

const AGREEMENT_LISTED: readonly (readonly [string, string])[] = [
  ['We was just sitting there, waiting, and nothing happened.', 'was'], ['They was robbed, the referee was a disgrace.', 'was'],
  ['You was right about the migration.', 'was'], ['I has three tickets for the show tonight.', 'has'],
  ['Every morning she go to the gym before work.', 'go'], ['He have a meeting with the client at four.', 'have'],
];
const AGREEMENT_UNCHANGED: readonly string[] = [
  'I heard he go on about it for an hour.', 'We watched she go down the slide.', 'The printer is broken and it have been for weeks.',
  'I suggest that he go home early today.', 'It is essential that it have a backup.', 'Make it go faster, please.',
];
const AGREEMENT_FIXED: readonly (readonly [string, string])[] = [
  ['He are late again.', 'He is late again.'], ['She are the best teacher I ever had.', 'She is the best teacher I ever had.'],
  ['I are ready when you are.', 'I am ready when you are.'],
];

describeWithEngine('a code path, a dialect, a language mixed in: listed, never changed (real engine)', () => {
  const was = process.env.ATELIER_GRAMMAR;
  beforeAll(async () => { process.env.ATELIER_GRAMMAR = 'on'; resetGrammar(); setGrammarProvider(harperGrammar); await ensureGrammar(); expect(grammarStatus().ready).toBe(true); }, 60_000);
  afterAll(() => { if (was === undefined) delete process.env.ATELIER_GRAMMAR; else process.env.ATELIER_GRAMMAR = was; resetGrammar(); setGrammarProvider(grammarProvider()); });

  const each = (rows: readonly (readonly [string, string])[], what: 'listed' | 'fixed'): void => {
    for (const p of DIALECTS) for (const [text, x] of rows) {
      if (what === 'fixed') { expect(fixed(text, p), `${JSON.stringify(p)} ${text}`).toBe(x); continue; }
      expect(fixed(text, p), `${JSON.stringify(p)} ${text}`).toBe(text);
      expect(listed(text, p), `${JSON.stringify(p)} ${text}`).toContain(x);
    }
  };
  const unchanged = (texts: readonly string[]): void => { for (const p of DIALECTS) for (const t of texts) expect(fixed(t, p), `${JSON.stringify(p)} ${t}`).toBe(t); };

  it('"a" or "an" before a word read as letters, or one the checker does not know, is listed', () => {
    each(ARTICLE_LISTED, 'listed'); unchanged(ARTICLE_UNCHANGED);
  });
  it('"a" or "an" before a lower-case common word the checker knows is still corrected', () => { each(ARTICLE_FIXED, 'fixed'); });
  it('"::", "..", "!!", "??", ";;" and a space before "!", "?", ":" or ";" are listed; a quotation in guillemets is not read', () => {
    each(MARKS_LISTED, 'listed');
    for (const p of DIALECTS) for (const t of QUOTED) { expect(fixed(t, p), t).toBe(t); expect(readGrammar(t, p).uncertain.filter((u) => /[!:;?]/.test(u.text)), t).toEqual([]); }
  });
  it('two commas after a word and a space before a comma or a full stop are still corrected; a spaced ellipsis is kept', () => {
    each(MARKS_FIXED, 'fixed');
    unchanged(['The drive went on . . . and on.']);
  });
  it('a word of a trade, of a language mixed with English, or an older spelling is no longer a known misspelling', () => {
    for (const w of REMOVED) expect(Object.hasOwn(MISSPELLINGS, w), w).toBe(false);
    // 452 less the eight a review found can be meant or met as written, or whose one correction is not certain.
    for (const w of ['wiht', 'personell', 'collegue', 'equipement', 'congradulations', 'playwrite', 'mischievious', 'comming']) expect(Object.hasOwn(MISSPELLINGS, w), w).toBe(false);
    expect(Object.keys(MISSPELLINGS)).toHaveLength(444);
    unchanged(WORDS_UNCHANGED);
  });
  it('a dialect\'s agreement ("we was", "they was", "I has", "he go") is listed; only "he are", "she are", "I are" are corrected', () => {
    each(AGREEMENT_LISTED, 'listed'); unchanged(AGREEMENT_UNCHANGED); each(AGREEMENT_FIXED, 'fixed');
  });
});
