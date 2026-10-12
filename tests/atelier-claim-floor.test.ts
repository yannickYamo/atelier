// tests/atelier-claim-floor.test.ts — THE CLAIM CHECK DELETES ONLY WHERE ITS DELETIONS WERE MEASURED, AND NEVER A WHOLE SECTION.
//
// On 27 real competitive analyses the check cut 41 sentences, 32 of them legitimate by one reading, and left three
// sections as a heading over nothing; two of those runs were counted conformant. Its rates were measured on essays
// and posts. So on a declared kind of work it was not measured on, everything it finds is listed and nothing is
// cut; and wherever it does cut, the last sentence under a heading stays, flagged, so the failure is visible.
// The drafts below are the three real ones, with the sentences the reader flagged on each.
import { describe, it, expect } from 'vitest';
import { checkDraft, enforceClaims, emptyHeadings, brokenByCut, listedClaims, CLAIMS_TO_CHECK } from '../core/loop/run-repair.js';
import { unmeasuredKind, listsBecause, type ClaimSensor, type ClaimReading } from '../core/loop/claim-extract.js';
import { kindOfWork } from '../cli/commands/method.js';
import type { StandardVersion } from '../core/state/canonical-state.js';

const STD = { standardVersionHash: 's', requirements: [] } as unknown as StandardVersion;

/** A qualified reader that flags exactly `flagged`, wherever each still stands in the text it is shown. */
function reader(flagged: readonly string[], kind: 'FIGURE' | 'SOURCE' | 'EXPERIENCE' = 'FIGURE'): ClaimSensor {
  return { instrument: 'claim reader (test)', notes: [], version: 'test', qualified: true, gate: 'reader', degraded: false, spentUsd: 0,
    read: async () => { /* nothing to fetch */ },
    reading: (text): ClaimReading => ({ instrument: 'claim reader (test)', publicFacts: [],
      claims: flagged.filter((f) => text.includes(f)).map((f) => ({ start: text.indexOf(f), end: text.indexOf(f) + f.length, text: f, kind, why: 'not in your material' })) }) };
}

const BEACON = `## Verdict
Sell to small offices that already have door sensors in place and will not sign a three-year contract. Sentrix wins the new-build fit-out; leave it.

## Competitors
| Company | Price | Strength | Weakness |
|---|---|---|---|
| Sentrix | $45 a month, 36 months | Installs its own hardware | 36-month contract |
| Hallguard | $25 a month | Cheap | Alerts the owner only |

## Pricing
We charge $30 a month with no contract. Sentrix costs $1,620 over its three-year term, and we cost $1,080 over the same three years. Hallguard is $5 a month less than us and nobody answers the alarm.

## Where we lose
Sentrix installs its own hardware, and we depend on sensors the office already owns. Hallguard is cheaper, and an owner who trusts their own phone sees no reason to pay for monitoring.

## Risks
Sentrix could offer a 12-month term to small offices. Hallguard could add a paid monitoring tier on top of its $25 a month.

Recommendation: publish the supported sensor list first, then pitch offices coming off a Sentrix term this year.
`;
const BEACON_FLAGGED = ['Sentrix wins the new-build fit-out; leave it.', 'Sentrix installs its own hardware, and we depend on sensors the office already owns.',
  'Sentrix could offer a 12-month term to small offices.', 'Hallguard could add a paid monitoring tier on top of its $25 a month.',
  'Recommendation: publish the supported sensor list first, then pitch offices coming off a Sentrix term this year.'];

const SALTBOX = `## Verdict
Sell to regional meal-kit companies shipping under 20,000 boxes a month that run their own delivery vans. Above that volume, Prepstack is cheaper than us.

## Pricing
We charge $600 a month plus $0.10 a box. At 10,000 boxes a month we cost $1,600, Prepstack $4,000 and Kitchenly $1,200. At 3,000 boxes in a slow month we cost $900 and Kitchenly still $1,200.

## Where we lose
Kitchenly sells a storefront, and we have no customer-facing ordering at all. Prepstack is cheaper than us for anyone under 4,000 boxes a month.

## Risks
Kitchenly could add van routing to its storefront. Prepstack could raise its per-box rate for small shippers and chase ours.
`;
const SALTBOX_FLAGGED = ['Above that volume, Prepstack is cheaper than us.', 'At 10,000 boxes a month we cost $1,600, Prepstack $4,000 and Kitchenly $1,200.',
  'Kitchenly sells a storefront, and we have no customer-facing ordering at all.', 'Prepstack is cheaper than us for anyone under 4,000 boxes a month.'];

const PAGEWISE = `## Verdict
Compete on bundled uptime checks and on price against Statuspage; do not compete with Instatus on price, where we lose by more than double and cannot close the gap.

## Pricing
Statuspage Startup is $99 per seat per month. Instatus Pro is $20. We are at $49, in the middle.
`;
const PAGEWISE_FLAGGED = ['Compete on bundled uptime checks and on price against Statuspage; do not compete with Instatus on price, where we lose by more than double and cannot close the gap.'];

describe('which kinds of work the claim check may cut on', () => {
  it('a skill that declares no kind, a known format, and prose it was measured on: as before', () => {
    for (const cls of [null, undefined, '', 'blog', 'blog-post', 'essay', 'Product essay', 'white-paper', 'contract', 'assistant-reply']) expect(unmeasuredKind(cls), String(cls)).toBeNull();
  });
  it('any other declared kind is named as not measured', () => {
    expect(unmeasuredKind('Competitive analysis')).toBe('competitive-analysis');
    expect(unmeasuredKind('handover_note')).toBe('handover-note');
  });
  it('a method names its kind of work in its title, or takes the skill\'s name; --class decides when given', () => {
    expect(kindOfWork('Competitive analysis — how we do it\n\n- Open with a Verdict section.', 'ca', undefined)).toBe('competitive-analysis');
    expect(kindOfWork('# Competitive analysis, the way we do it\n\n1. Open with a Verdict section.', 'ca', undefined)).toBe('competitive-analysis');
    expect(kindOfWork('Market entry brief\n\nThe brief answers one question.', 'me', undefined)).toBe('market-entry-brief');
    expect(kindOfWork('- Open with a Status section.\n- End with a Next 48 hours section.', 'handover', undefined)).toBe('handover');
    expect(kindOfWork('How we review a pull request\n\n- Start with a one-line summary.', 'review', undefined)).toBe('review');
    expect(kindOfWork('Competitive analysis\n\n- Open with a Verdict section.', 'ca', 'Essay')).toBe('essay');
  });
});

// A deletion needs both: material bound, and a kind of work a qualification covers. The mini study this pins:
// twelve explanations, no material and no kind, and the check deleted the author's own kind of analogy.
describe('the check may delete only with material bound, on a kind it was measured on', () => {
  it('with no material bound it lists, whatever the kind', () => {
    for (const cls of [null, '', 'essay', 'blog-post', 'contract', 'competitive-analysis']) expect(listsBecause({ cls, bound: false }), String(cls)).toBe('no material was bound to check against');
  });
  it('with material bound, a skill that names no kind lists, and so does a kind nobody measured', () => {
    expect(listsBecause({ cls: null, bound: true })).toBe('the skill names no kind of work the claim check was measured on');
    expect(listsBecause({ cls: 'Competitive analysis', bound: true })).toBe('the claim check is not measured on competitive-analysis');
  });
  it('--placeholders is the person asking for slots: no material needed, the kind still decides; "none" names no kind', () => {
    expect(listsBecause({ cls: null, bound: false, slots: true })).toBeNull();
    expect(listsBecause({ cls: 'essay', bound: false, slots: true })).toBeNull();
    expect(listsBecause({ cls: 'handover', bound: false, slots: true })).toBe('the claim check is not measured on handover');
    expect(listsBecause({ cls: 'none', bound: true })).toBe('the skill names no kind of work the claim check was measured on');
  });
  it('with material bound on measured prose or a known format, it may cut', () => {
    for (const cls of ['essay', 'blog posts', 'white-paper', 'contract', 'assistant-reply']) expect(listsBecause({ cls, bound: true }), cls).toBeNull();
  });
  it('an analogy the author always makes is kept and listed when nothing was bound', async () => {
    const piece = 'A battery holds chemicals that want to react.\n\nImagine water held behind a dam on a hillside.\n\nIn short, a battery stores energy as a chemical imbalance.\n';
    const opts = { claimSensor: reader(['Imagine water held behind a dam on a hillside.', 'In short, a battery stores energy as a chemical imbalance.'], 'SOURCE'), listsBecause: listsBecause({ cls: null, bound: false }) };
    const e = await enforceClaims('s', STD, piece, opts);
    expect(e).toMatchObject({ text: piece, cut: [] });
    expect(listedClaims(e.report)).toHaveLength(2);
    expect(e.report.failed).toBe(false);
  });
});

describe('no cut breaks a rule the draft was meeting', () => {
  const withRule = { standardVersionHash: 's', requirements: [{ requirementId: 'c1', statement: 'Close in at least twelve words.', authority: 'USER_ADOPTED', materiality: 'REQUIRED', appliesWhen: 'GENERAL', phase: 'STYLE',
    measurement: { observer: 'CLOSING', params: { minWords: 12 } } }] } as unknown as StandardVersion;
  const piece = 'A battery holds chemicals that want to react with each other, and it keeps them apart until a wire joins its two ends. Then the particles one end gives away travel round through the lamp to the end that wants them, and that travel is the current you use.\n\nThe middle says how the current flows.\n\nIn short, 40 teams measured a battery storing energy as a chemical imbalance.\n';
  const closing = 'In short, 40 teams measured a battery storing energy as a chemical imbalance.';
  it('the closing the standard requires is kept, still flagged, where the check may cut', async () => {
    expect(checkDraft('s', withRule, piece, { guardClaims: false }).checked.find((c) => c.requirementId === 'c1')?.result.verdict).toBe('MET');
    const e = await enforceClaims('s', withRule, piece, { claimSensor: reader([closing], 'SOURCE') });
    expect(e.cut).toEqual([]);
    expect(e.text).toBe(piece);
    expect(e.kept).toEqual([closing]);
    expect(e.report.failed).toBe(true);
  });
  it('a preference does not outweigh an invented claim, and a slot the person asked for is still left', async () => {
    const preferred = { ...withRule, requirements: withRule.requirements.map((q) => ({ ...q, materiality: 'PREFERRED' })) } as unknown as StandardVersion;
    expect((await enforceClaims('s', preferred, piece, { claimSensor: reader([closing], 'SOURCE') })).cut).toEqual([closing]);
    const slotted = await enforceClaims('s', withRule, piece, { claimSensor: reader([closing], 'SOURCE'), placeholders: true });
    expect(slotted.kept).toEqual([]);
    expect(slotted.text).not.toContain('40 teams');
  });
  it('a flagged sentence no rule rests on is cut as before', async () => {
    const middle = 'The middle says how the current flows.';
    const e = await enforceClaims('s', withRule, piece, { claimSensor: reader([middle], 'SOURCE') });
    expect(e.cut).toEqual([middle]);
    expect(e.text).toContain(closing);
  });
});

describe('on a kind of work nobody measured it on, the check lists and never cuts', () => {
  const QUARRY = '## Risks\nBuildbook could add a stone template. A firm that owns Estimata already has its prices typed in.\n';
  const flagged = ['Buildbook could add a stone template.'];
  it('measured, or no kind declared: the flagged sentence fails the check and is cut', async () => {
    const opts = { claimSensor: reader(flagged, 'SOURCE') };
    expect(checkDraft('s', STD, QUARRY, opts).failed).toBe(true);
    const e = await enforceClaims('s', STD, QUARRY, opts);
    expect(e.cut).toEqual(flagged);
    expect(e.text).not.toContain('stone template');
  });
  it('not measured: nothing fails, nothing is cut, and the sentence is listed with the reason', async () => {
    const opts = { claimSensor: reader(flagged, 'SOURCE'), listsBecause: 'the claim check is not measured on competitive-analysis' };
    const r = checkDraft('s', STD, QUARRY, opts);
    expect(r.failed).toBe(false);
    expect(r.checked.find((c) => c.requirementId === 'UNSOURCED')?.result).toMatchObject({ verdict: 'MET', detail: expect.stringContaining('the claim check is not measured on competitive-analysis: 1 sentence(s) listed to check, none cut') as string });
    expect(r.checked.find((c) => c.requirementId === CLAIMS_TO_CHECK)).toMatchObject({ materiality: 'PREFERRED', statement: expect.stringContaining('never cut, because the claim check is not measured on competitive-analysis') as string });
    expect(listedClaims(r)).toEqual(flagged);
    const e = await enforceClaims('s', STD, QUARRY, opts);
    expect(e).toMatchObject({ text: QUARRY, cut: [], kept: [] });
  });
  it('what the patterns find is listed too: no instrument deletes there', async () => {
    const story = 'Last week I interviewed 40 of our customers and 31 of them said they would switch.\n\nThe rest is plain.\n';
    expect(checkDraft('s', STD, story, { material: '' }).failed).toBe(true);
    const r = checkDraft('s', STD, story, { material: '', listsBecause: 'the claim check is not measured on handover' });
    expect(r.failed).toBe(false);
    expect(listedClaims(r).length).toBeGreaterThan(0);
    expect((await enforceClaims('s', STD, story, { material: '', listsBecause: 'the claim check is not measured on handover' })).text).toBe(story);
  });
  it('the three real drafts keep every sentence and every section', async () => {
    for (const [draft, flags] of [[BEACON, BEACON_FLAGGED], [SALTBOX, SALTBOX_FLAGGED], [PAGEWISE, PAGEWISE_FLAGGED]] as const) {
      const e = await enforceClaims('s', STD, draft, { claimSensor: reader(flags), listsBecause: 'the claim check is not measured on competitive-analysis' });
      expect(e.text).toBe(draft);
      expect(listedClaims(e.report)).toHaveLength(flags.length);
    }
  });
});

describe('where it does cut, no cut leaves a heading over nothing', () => {
  it('counts the headings whose section holds no word', () => {
    expect(emptyHeadings('## A\n\n## B\ntext\n')).toBe(1);
    expect(emptyHeadings('## A\n\n### A1\ntext\n\n## B\n\n\n')).toBe(1);
    expect(emptyHeadings('## A\n\n| x | y |\n|---|---|\n| 1 | 2 |\n')).toBe(0);
    expect(emptyHeadings('## A\n\n|---|---|\n')).toBe(1);
    expect(emptyHeadings('no headings at all')).toBe(0);
  });
  it('a text that lost a section\'s body is broken, for a cut and for a redraft', () => {
    expect(brokenByCut('## A\none\n\n## B\ntwo\n', '## A\n\n## B\ntwo\n')).toBe('a section with nothing under its heading');
    expect(brokenByCut('## A\none\n\n## B\ntwo\n', '## A\n\n## B\ntwo\n', { structureOnly: true })).toBe('a section with nothing under its heading');
    expect(brokenByCut('## A\none two\n\n## B\ntwo\n', '## A\none\n\n## B\ntwo\n')).toBeNull();
  });
  it('Beacon: the Risks section was cut to nothing; now its last flagged sentence stays, and the check fails on it', async () => {
    const e = await enforceClaims('s', STD, BEACON, { claimSensor: reader(BEACON_FLAGGED) });
    expect(emptyHeadings(e.text)).toBe(0);
    expect(e.kept).toEqual(['Sentrix could offer a 12-month term to small offices.']);
    expect(e.cut).toHaveLength(4);
    expect(e.text).toMatch(/## Risks\nSentrix could offer a 12-month term to small offices\./);
    expect(e.report.failed).toBe(true);
  });
  it('Saltbox: "Where we lose" keeps one sentence', async () => {
    const e = await enforceClaims('s', STD, SALTBOX, { claimSensor: reader(SALTBOX_FLAGGED) });
    expect(emptyHeadings(e.text)).toBe(0);
    expect(e.kept).toEqual(['Kitchenly sells a storefront, and we have no customer-facing ordering at all.']);
    expect(e.cut).toHaveLength(3);
  });
  it('Pagewise: the Verdict is one flagged sentence, so nothing is cut and the run says which', async () => {
    const e = await enforceClaims('s', STD, PAGEWISE, { claimSensor: reader(PAGEWISE_FLAGGED) });
    expect(e.text).toBe(PAGEWISE);
    expect(e.kept).toHaveLength(1);
    expect(e.report.failed).toBe(true);
  });
  it('a flagged sentence beside others in its section is cut as before', async () => {
    const e = await enforceClaims('s', STD, '## A\nOne plain sentence here. An invented one follows it.\n', { claimSensor: reader(['An invented one follows it.']) });
    expect(e).toMatchObject({ cut: ['An invented one follows it.'], kept: [] });
  });
});

// An independent review of the first version.
describe('what a review of the first version found', () => {
  it('prose is prose however its kind is spelled', () => {
    for (const cls of ['essays', 'post', 'blogpost', 'blog posts', 'op-ed', 'marketing', 'articles']) expect(unmeasuredKind(cls), cls).toBeNull();
  });
  it('a kind read from a title or a name is never a short name for a format', () => {
    expect(kindOfWork('# X\n\n- Open with a hook.', 'x', undefined)).toBe('x-work');
    expect(kindOfWork('- Open with a hook.', 'blog', undefined)).toBe('blog-work');
    expect(kindOfWork('---\ntitle: n\n---\nCompetitive analysis\n\n- Open with a Verdict section.', 'ca', undefined)).toBe('competitive-analysis');
    expect(kindOfWork('Q3 2026: plan\n\n- Open with a Verdict section.', 'plan', undefined)).toBe('plan');
    expect(kindOfWork('- Open with a hook.', 'x', 'x')).toBe('x-post');
  });
  it('a heading written with a rule under it, indented, or as a bold line is a heading whose section must not be emptied', async () => {
    expect(emptyHeadings('Risks\n-----\n\nVerdict\n=======\nGo.\n')).toBe(1);
    expect(emptyHeadings('  ## Risks\n\n## Verdict\nGo.\n')).toBe(1);
    expect(emptyHeadings('**Risks**\n\n**Verdict**\nGo.\n')).toBe(1);
    expect(emptyHeadings('A paragraph.\n\n---\n\nAnother one.\n')).toBe(0);
    const e = await enforceClaims('s', STD, 'Risks\n-----\nAn invented one stands here.\n\nVerdict\n-------\nGo.\n', { claimSensor: reader(['An invented one stands here.']) });
    expect(e).toMatchObject({ cut: [], kept: ['An invented one stands here.'] });
  });
});

describe('what a second review found: a paragraph over a rule, and a sentence in bold, are not headings', () => {
  it('a heading that asks a question or holds a colon is a heading, and a cut cannot empty it', async () => {
    for (const h of ['**Why now?**', "**What's next?**", '**FAQ: billing**', '**Risks, costs and owners**']) expect(emptyHeadings(`${h}\n\n## Next\nShip.\n`), h).toBe(1);
    expect(emptyHeadings('FAQ: billing\n---\n\nRisks (v2.0)\n---\nFew.\n')).toBe(1);
    const e = await enforceClaims('s', STD, '**Why now?**\n\nAn invented one stands here.\n\n## Next\nShip.\n', { claimSensor: reader(['An invented one stands here.']) });
    expect(e).toMatchObject({ cut: [], kept: ['An invented one stands here.'] });
  });
  it('a paragraph over a rule and a sentence in bold are not counted, and a cut beside one goes ahead', async () => {
    const e = await enforceClaims('s', STD, '**Bottom line: we should switch.**\n\nThe rival raised a lot. An invented one stands here.\n\n## Next\nShip.\n', { claimSensor: reader(['An invented one stands here.']) });
    expect(e).toMatchObject({ cut: ['An invented one stands here.'], kept: [] });
    expect(emptyHeadings('## Risks\n\nNone known today.\n---\n## Next\nShip.')).toBe(0);
    expect(emptyHeadings('Here is the note.\n---\n## Summary\nGood.')).toBe(0);
    expect(emptyHeadings('## Summary\n\nAll good.\n\n**Thank you for your business.**')).toBe(0);
    expect(emptyHeadings('## A\nx\n\n**Recommendation: approve the change.**\n\n## B\ny')).toBe(0);
  });
});
