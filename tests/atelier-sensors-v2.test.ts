// tests/atelier-sensors-v2.test.ts — PARAGRAPH PACE, SENTENCE SOUND, OVER-ARTICULATION, MOVEMENT, GROUNDED SPECIFICS.
//
// Every new feature, both polarities: a text where it is clearly high, one where it is clearly low, and null
// on a text too short for the number to mean anything. Then the fact ledger: what it extracts, that two
// writings of one fact match, and that a figure the material never gave is outside it.
import { describe, it, expect } from 'vitest';
import { featureOf, FEATURES, LAYER_LABEL } from '../core/observers/features.js';
import { bagOf, cosine, paceSteps, callbackShare } from '../core/observers/pace.js';
import { factLedger, factCoverage, authorFactDensity } from '../core/loop/fact-ledger.js';

const measure = (id: string, text: string): number | null => {
  const f = featureOf(id);
  if (!f) throw new Error(`no feature ${id}`);
  return f.measure(text);
};
/** `s` repeated until the text has at least `words` words. */
const repeat = (s: string, words = 180): string => {
  const out: string[] = [];
  while (out.join(' ').split(/\s+/).length < words) out.push(s);
  return out.join(' ');
};
const NEUTRAL = 'The boat left the harbour at dawn and the crew watched the gulls circle over the grey water.';
const neutral = repeat(NEUTRAL);
const short = repeat(NEUTRAL, 60);

describe('the new layers and features are registered', () => {
  it('layers 6 and 8 have labels, and each new feature sits on the layer it measures', () => {
    expect(LAYER_LABEL[6]).toBe('argument and movement');
    expect(LAYER_LABEL[8]).toBe('content and specifics');
    const layer = (id: string): number | undefined => featureOf(id)?.layer;
    for (const id of ['paragraphP10', 'paragraphP50', 'paragraphP90', 'oneSentenceParagraph', 'sentencesPerParagraph']) expect(layer(id), id).toBe(3);
    expect(layer('sentenceCv')).toBe(2);
    for (const id of ['than', 'negation', 'thatsContraction', 'letUs', 'explanatory', 'contrastive']) expect(layer(id), id).toBe(4);
    for (const id of ['paceStep', 'paceBurstiness', 'callbacks']) expect(layer(id), id).toBe(6);
    expect(layer('specificsDensity')).toBe(8);
  });
  it('specificsDensity is a specifics feature, so it is only ever proposed as a cap', () => {
    expect(featureOf('specificsDensity')?.specifics).toBe(true);
    // and the movement and wording features are not: a floor on them asks for nothing anyone must supply
    for (const id of ['paceStep', 'callbacks', 'than', 'paragraphP50']) expect(featureOf(id)?.specifics, id).toBeUndefined();
  });
  it('ids stay unique', () => {
    expect(new Set(FEATURES.map((f) => f.id)).size).toBe(FEATURES.length);
  });
});

// ── 3. page and document: paragraphs ────────────────────────────────────────────────────────────
const SENT = 'The crew hauled the nets aboard and sorted the catch by size before noon.'; // 14 words
const paragraphs = (sentencesEach: readonly number[]): string =>
  sentencesEach.map((n) => Array.from({ length: n }, () => SENT).join(' ')).join('\n\n');
const longParas = paragraphs([4, 4, 4, 4, 4]);
const oneLiners = paragraphs([1, 1, 1, 1, 1, 1]);
const threeParas = paragraphs([4, 4, 4]);

describe('paragraph pace, prose paragraphs only', () => {
  it('percentiles read paragraph length in words', () => {
    expect(measure('paragraphP50', longParas)).toBe(56);
    expect(measure('paragraphP50', oneLiners)).toBe(14);
    const mixed = paragraphs([1, 1, 2, 3, 6, 8]);
    expect(measure('paragraphP10', mixed)).toBe(14);
    expect(measure('paragraphP90', mixed)).toBe(112);
    expect(measure('paragraphP10', mixed)!).toBeLessThan(measure('paragraphP90', mixed)!);
    expect(measure('paragraphP90', oneLiners)).toBe(14);
    expect(measure('paragraphP10', longParas)).toBe(56);
  });
  it('one-sentence paragraphs and sentences per paragraph', () => {
    expect(measure('oneSentenceParagraph', oneLiners)).toBe(1);
    expect(measure('oneSentenceParagraph', longParas)).toBe(0);
    expect(measure('sentencesPerParagraph', longParas)).toBe(4);
    expect(measure('sentencesPerParagraph', oneLiners)).toBe(1);
  });
  it('null under four paragraphs, and list items are not paragraphs', () => {
    const listy = `${threeParas}\n\n${Array.from({ length: 10 }, () => `- ${SENT}`).join('\n')}`;
    for (const id of ['paragraphP10', 'paragraphP50', 'paragraphP90', 'oneSentenceParagraph', 'sentencesPerParagraph']) {
      expect(measure(id, threeParas), id).toBeNull();
      expect(measure(id, listy), id).toBeNull();
      expect(measure(id, 'Too short.'), id).toBeNull();
    }
  });
});

// ── 2. sentence architecture: variation ────────────────────────────────────────────────────────
describe('sentenceCv: how far sentence length swings', () => {
  it('zero when every sentence is the same length, high when short and long alternate', () => {
    expect(measure('sentenceCv', repeat(SENT, 200))).toBe(0);
    const varied = Array.from({ length: 6 }, () => `Nets came up. ${SENT} ${SENT.replace('.', ',')} and then the whole crew rested on the deck until the light went.`).join(' ');
    expect(measure('sentenceCv', varied)!).toBeGreaterThan(0.5);
  });
  it('null under ten sentences', () => {
    expect(measure('sentenceCv', Array.from({ length: 9 }, () => SENT).join(' '))).toBeNull();
  });
});

// ── 4. over-articulation ──────────────────────────────────────────────────────────────────────
describe('over-articulation, per 1,000 prose words', () => {
  const cases: readonly [string, string][] = [
    ['than', 'The boat was faster than the old one and lighter than the ferry that crossed the bay before it.'],
    ['negation', "The crew did not sleep, the captain wasn't calm, and they never had a moment and no time to rest."],
    ['thatsContraction', "That's the boat, and that's the harbour where the crew said that's where they always wait for the tide."],
    ['letUs', "Let's look at the boat, let me show you the deck, and let us walk down to the harbour before the tide."],
    ['explanatory', 'The crew left early because the tide turned, which means the harbour was empty, in other words it was quiet.'],
    ['contrastive', 'The crew wanted rest but the captain refused; however they sailed, yet nobody complained, although all were tired.'],
  ];
  for (const [id, sentence] of cases) {
    it(`${id}: high where the habit is, zero where it is absent, null when too short`, () => {
      expect(measure(id, repeat(sentence))!, id).toBeGreaterThan(40);
      expect(measure(id, neutral), id).toBe(0);
      expect(measure(id, short), id).toBeNull();
    });
  }
  it('"not X but Y" is one contrast, through its "but"', () => {
    const text = repeat('The point was not the boat but the crew who sailed it across the bay that morning.');
    const per = (n: number): number => Math.round((n / text.split(/\s+/).length) * 1000 * 1000) / 1000;
    expect(measure('contrastive', text)).toBe(per(text.match(/\bbut\b/g)!.length));
  });
});

// ── 6. argument and movement ──────────────────────────────────────────────────────────────────
const TOPICS = [
  'Volcanoes erupt molten basalt over remote islands.', 'Bakers knead sourdough loaves at sunrise.',
  'Satellites orbit planets carrying delicate telescopes.', 'Violinists rehearse concertos inside chilly churches.',
  'Glaciers carve valleys through ancient granite.', 'Spreadsheets track invoices for plumbing firms.',
  'Penguins huddle against brutal antarctic winds.', 'Novelists draft chapters longhand in quiet cafes.',
  'Cyclists climb alpine passes during summer races.', 'Chemists titrate acids using calibrated burettes.',
  'Farmers harvest barley when autumn arrives.', 'Architects sketch bridges spanning wide rivers.',
  'Sailors splice ropes aboard creaking schooners.', 'Beekeepers smoke hives gathering golden honey.',
  'Astronomers catalogue comets crossing distant skies.', 'Potters glaze bowls beside roaring kilns.',
];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'holidays', 'weekends', 'mornings', 'evenings', 'nights', 'noon', 'midnight'];
const onTopic = DAYS.map((d) => `Cache latency for server requests rose on ${d}.`).join(' ');
const wandering = TOPICS.slice(0, 14).join(' ');
// Three sentences on a topic, then a jump: stay, stay, jump.
const bursty = [0, 1, 2, 3, 4].flatMap((k) => [0, 1, 2].map((j) => `${TOPICS[k].replace('.', '')} near ${['harbours', 'forests', 'deserts'][j]}.`)).join(' ');
const GARDEN = 'Gardeners water tomatoes growing beside fences.';
const withCallback = [GARDEN, 'Tomatoes need gardeners watering fences daily.', ...TOPICS.slice(0, 10), 'Gardeners still water those tomatoes beside fences.', ...TOPICS.slice(10, 14)].join(' ');

describe('movement: a lexical proxy for semantic pace', () => {
  it('cosine of content-word bags: same words 1, no shared word 0, empty bag 0', () => {
    expect(cosine(bagOf('Cache latency rose.'), bagOf('Latency cache rose.'))).toBeCloseTo(1);
    expect(cosine(bagOf('Volcanoes erupt basalt.'), bagOf('Bakers knead sourdough.'))).toBe(0);
    expect(cosine(bagOf('It is so.'), bagOf('Cache latency rose.'))).toBe(0);
    // a pair with no content words is skipped, not read as a full jump
    expect(paceSteps([bagOf('It is so.'), bagOf('Cache latency rose.')])).toEqual([]);
  });
  it('paceStep: a text that wanders topic to topic moves further than one that stays on topic', () => {
    const stay = measure('paceStep', onTopic)!; const wander = measure('paceStep', wandering)!;
    expect(wander).toBe(1);
    expect(stay).toBeLessThan(0.3);
    expect(wander).toBeGreaterThan(stay);
  });
  it('paceBurstiness: even drift is 0, stay-stay-jump is high', () => {
    expect(measure('paceBurstiness', onTopic)).toBe(0);
    expect(measure('paceBurstiness', bursty)!).toBeGreaterThan(0.5);
  });
  it('callbacks: a return to an early topic after five or more sentences counts; staying or wandering does not', () => {
    expect(measure('callbacks', withCallback)!).toBeGreaterThan(0);
    expect(measure('callbacks', withCallback)).toBe(Math.round((1 / 17) * 1000) / 1000);
    expect(measure('callbacks', TOPICS.join(' '))).toBe(0);
    expect(measure('callbacks', [...DAYS, 'Fridays'].map((d) => `Cache latency for server requests rose on ${d}.`).join(' '))).toBe(0);
    // the same return four sentences later is a continuation of the run, not a callback
    const tooSoon = [GARDEN, ...TOPICS.slice(0, 3), 'Gardeners still water those tomatoes beside fences.', ...TOPICS.slice(3, 13)].join(' ');
    expect(callbackShare(tooSoon.split(/(?<=\.) /).map(bagOf))).toBe(0);
  });
  it('null when too short: under twelve sentences for pace, under fifteen for callbacks', () => {
    const eleven = TOPICS.slice(0, 11).join(' ');
    expect(measure('paceStep', eleven)).toBeNull();
    expect(measure('paceBurstiness', eleven)).toBeNull();
    expect(measure('callbacks', wandering)).toBeNull(); // fourteen sentences
    expect(measure('paceStep', 'Too short.')).toBeNull();
  });
});

// ── 8. content and specifics ──────────────────────────────────────────────────────────────────
describe('specificsDensity, per 100 prose words', () => {
  it('high on figures, dates, names and quotations; zero on plain narration; null when too short', () => {
    const dense = repeat('In March 2024 the team at Acme Robotics cut costs by 12% and saved $4,000 over 94 minutes, calling it "a quiet win".');
    expect(measure('specificsDensity', dense)!).toBeGreaterThan(20);
    expect(measure('specificsDensity', neutral)).toBe(0);
    expect(measure('specificsDensity', short)).toBeNull();
  });
});

// ── the fact ledger ───────────────────────────────────────────────────────────────────────────
const MATERIAL = [
  'Our churn fell to 12% in March 2024, from 1,200 accounts to 950.',
  'Jane Doe, who runs support at Acme Corp, said "we answered every ticket within a day".',
  'The full report is at https://example.com/churn-report/ and we moved the queue to Postgres in 2023.',
].join(' ');

describe('the fact ledger: grounded specificity', () => {
  const ledger = factLedger(MATERIAL);
  const norms = (kind: string): string[] => ledger.filter((f) => f.kind === kind).map((f) => f.norm);

  it('extracts numbers with their unit and context, dates, names, quotations and links', () => {
    expect(norms('NUMBER')).toEqual(['12 percent', '1200', '950']);
    expect(ledger.find((f) => f.norm === '1200')?.context).toMatch(/accounts/);
    expect(norms('DATE')).toEqual(['2024-03', '2023']);
    expect(norms('NAME')).toEqual(expect.arrayContaining(['jane doe', 'acme corp', 'postgres']));
    expect(norms('NAME')).not.toContain('our');
    expect(norms('QUOTE')).toEqual(['we answered every ticket within a day']);
    expect(norms('URL')).toEqual(['example.com/churn-report']);
  });
  it('is not fooled by sentence starts, removed links, a month alone or a scare quote', () => {
    const names = (s: string): string[] => factLedger(s).filter((f) => f.kind === 'NAME').map((f) => f.norm);
    expect(names('When Stripe launched, the New York Times wrote about it.')).toEqual(['stripe', 'new york times']);
    expect(names('Visit https://a.b/c. He left in March.')).toEqual([]);
    expect(factLedger('He called it "fine" and left.')).toEqual([]);
  });
  it('normalises the writing of a number: "1,200" is 1200, "12%" is 12 percent, a currency stays', () => {
    const norm = (s: string): string | undefined => factLedger(s).find((f) => f.kind === 'NUMBER')?.norm;
    expect(norm('It cost 1,200 dollars.')).toBe(norm('It cost 1200 dollars.'));
    expect(norm('Churn was 12%.')).toBe('12 percent');
    expect(norm('Churn was 12 percent.')).toBe('12 percent');
    expect(norm('Churn was 12 per cent.')).toBe('12 percent');
    expect(norm('It raised $4.5m.')).toBe('$4.5 million');
    expect(norm('Builds took 94 minutes.')).toBe('94 minute');
    // a bare small count is how prose counts, not a fact; a list marker is not a figure
    expect(factLedger('We had 3 options.\n\n1. pick one')).toEqual([]);
  });
  it('dates written differently are one date; a year is not a number', () => {
    const d = (s: string): string[] => factLedger(s).filter((f) => f.kind === 'DATE').map((f) => f.norm);
    expect(d('on March 3, 2024')).toEqual(['2024-03-03']);
    expect(d('on 3 March 2024')).toEqual(['2024-03-03']);
    expect(d('on 2024-03-03')).toEqual(['2024-03-03']);
    expect(factLedger('It shipped in 2021.').map((f) => f.kind)).toEqual(['DATE']);
  });
  it('coverage: what the text used of the ledger, per 100 words, and what came from elsewhere', () => {
    const text = 'Churn dropped to 12 percent by March 2024. We went from 1200 accounts to 950, and Postgres held up. A rival claims 40% savings.';
    const c = factCoverage(text, ledger);
    expect(c.used.map((f) => f.norm).sort()).toEqual(['12 percent', '1200', '2024-03', '950', 'postgres']);
    expect(c.per100).toBe(Math.round((5 / 24) * 100 * 1000) / 1000);
    // the figure the material never gave is outside the ledger: listed for the claim gate, never credited
    expect(c.outside).toEqual(['40%']);
  });
  it('a coarser date is covered by a finer one, never the reverse', () => {
    const fine = factLedger('It shipped on March 3, 2024.');
    expect(factCoverage('It shipped in March 2024.', fine).outside).toEqual([]);
    expect(factCoverage('It shipped on March 3, 2024.', factLedger('It shipped in March 2024.')).outside).toEqual(['March 3, 2024']);
  });
  it('a text with no specifics uses nothing and invents nothing', () => {
    const c = factCoverage(NEUTRAL, ledger);
    expect(c).toEqual({ used: [], per100: 0, outside: [] });
  });
  it('the author\'s density is the median over their pieces, and null with no piece long enough', () => {
    const dense = repeat('In March 2024 the team cut costs by 12% and saved $4,000.', 160);
    const plain = repeat(NEUTRAL, 160);
    expect(authorFactDensity([plain, plain, plain])).toBe(0);
    expect(authorFactDensity([dense, dense, plain])!).toBeGreaterThan(0);
    expect(authorFactDensity([short])).toBeNull();
  });
});
