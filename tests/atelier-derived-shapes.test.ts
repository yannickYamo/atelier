// tests/atelier-derived-shapes.test.ts — A FIGURE WORKED FROM THE MATERIAL IS THE WRITER READING IT, AND AN INVENTED ONE IS NOT.
//
// An analysis prices a scenario from a price list: fixed fee plus rate times volume, a gap between two offers, a
// year of it, a break-even. One operation on two figures recognised none of the six correct calculations in four
// real analyses, so each was cut as invented; a free two-step search recognised them and most invented figures
// too. The calculations are fixed and an offer's amounts come from one line of the material. The sentences are the
// tester's: 9 honest, 13 invented or wrong, on five price lists. Bar: honest 9 of 9 kept, invented at most 1 of 13.
import { describe, it, expect } from 'vitest';
import { derivedFromKnown } from '../core/loop/derived.js';

const M: Record<string, string> = {
  kettle: 'Tillcraft pricing page: $69 per month per terminal, 2.6% card fee.\nOrderly pricing page: $0 per month, 2.9% card fee.\nOur pricing: $49 per month per terminal, 2.5% card fee.',
  quarry: 'Buildbook pricing page: $79 per month per user.\nEstimata pricing page: $499 one-time licence.\nOur pricing: $29 per month per user.',
  saltbox: 'Kitchenly pricing page: $1,200 per month.\nPrepstack pricing page: $0.40 per box shipped.\nOur pricing: $600 per month plus $0.10 per box.',
  ledgerly: 'Expensify pricing page: Collect plan $5 per seat per month.\nOur pricing: $9 per seat per month.',
  fieldkit: 'ServiceTitan quotes start near $250 per technician per month.\nJobber Core is $49 per month for one user.\nOur pricing: $35 per seat per month.',
};
const HONEST: [string, string][] = [
  ['kettle', 'A cafe on $25,000 a month pays us $674, Tillcraft $719 and Orderly $725.'],
  ['kettle', 'At $8,000 a month we cost $249 and Orderly $232.'],
  ['quarry', 'A shop of three pays us $1,044 a year and Buildbook $2,844.'],
  ['quarry', 'A three-person firm pays us $87 a month and Buildbook $237.'],
  ['saltbox', 'At 10,000 boxes a month we cost $1,600, Prepstack $4,000 and Kitchenly $1,200.'],
  ['saltbox', 'At 3,000 boxes a month, Prepstack costs $1,200 and we cost $900.'],
  ['saltbox', 'Prepstack is cheaper below 2,000 boxes a month.'],
  ['ledgerly', 'A team of 200 pays us $21,600 a year.'],
  ['fieldkit', 'On a ten-technician shop that is a difference of about $2,150 a month against ServiceTitan and $140 against Jobber.'],
];
const INVENTED: [string, string][] = [
  ['kettle', 'A cafe on $25,000 a month pays us $690, Tillcraft $719 and Orderly $725.'],
  ['kettle', 'Orderly has 41,000 cafes on its books.'],
  ['quarry', 'A shop of three pays us $1,100 a year.'],
  ['quarry', 'Buildbook raised $38 million last year.'],
  ['saltbox', 'At 10,000 boxes a month we cost $1,750.'],
  ['saltbox', 'Prepstack ships 2.3 million boxes a month.'],
  ['ledgerly', 'Expensify has 714 employees.'],
  ['fieldkit', 'ServiceTitan has 8,000 customers.'],
  ['kettle', 'Churn at Tillcraft is 3.1% a month.'],
  ['quarry', 'Estimata sold 12,400 licences.'],
  ['saltbox', 'Kitchenly grew 27% this year.'],
  ['fieldkit', 'Jobber charges $64 for two users.'],
  ['saltbox', 'Prepstack is cheaper than us for anyone under 4,000 boxes a month.'],
];

describe('the tester\'s sentences', () => {
  it('every honest calculation is recognised: 9 of 9', () => {
    expect(HONEST.filter(([m, s]) => !derivedFromKnown(s, M[m])).map(([, s]) => s)).toEqual([]);
  });
  it('no invented or wrong figure is: 0 of 13 (the bar is at most 1)', () => {
    expect(INVENTED.filter(([m, s]) => derivedFromKnown(s, M[m])).map(([, s]) => s)).toEqual([]);
  });
});

describe('the three figures a looser version let through, and why each cannot be worked now', () => {
  it('a fixed fee of one offer against the card rates of two others is nobody\'s break-even', () => {
    expect(derivedFromKnown('A cafe on $25,000 a month pays us $690.', M.kettle)).toBe(false);
  });
  it('"one user" is not a fee, and $250 is not 2.5%', () => {
    expect(derivedFromKnown('Jobber charges $64 for two users.', M.fieldkit)).toBe(false);
  });
  it('a break-even takes each offer whole: the true one is 2,000 boxes, and 3,000 against the flat fee', () => {
    expect(derivedFromKnown('Prepstack is cheaper than us under 4,000 boxes a month.', M.saltbox)).toBe(false);
    expect(derivedFromKnown('Prepstack is cheaper than us under 2,000 boxes a month.', M.saltbox)).toBe(true);
    expect(derivedFromKnown('Prepstack passes Kitchenly at 3,000 boxes a month.', M.saltbox)).toBe(true);
  });
});

describe('a year is a year, and an amount is an amount', () => {
  const m = M.saltbox;
  it('an amount that looks like a year is read as an amount', () => {
    expect(derivedFromKnown('We cost $600 and they cost $2,050 a month.', m)).toBe(false);
    expect(derivedFromKnown('We cost $600; the rival raised $2,000 in fees.', m)).toBe(false);
    expect(derivedFromKnown('Together we cost $2,050 a month.', m)).toBe(false);
  });
  it('a year beside a figure of the material is still a year', () => {
    expect(derivedFromKnown('We cost $600 a month in 2025.', m)).toBe(true);
    expect(derivedFromKnown('Kitchenly has charged $1,200 since 2019.', m)).toBe(true);
  });
});

describe('what the scenario may and may not carry', () => {
  it('the scenario is one number the sentence states, and something must follow from it', () => {
    expect(derivedFromKnown('At 5,000 boxes a month we cost $1,100.', M.saltbox)).toBe(true);
    // a number alone is a claim, not a scenario
    expect(derivedFromKnown('We ship 5,000 boxes a month.', M.saltbox)).toBe(false);
    // two numbers that agree with nothing in the price list
    expect(derivedFromKnown('At 5,000 boxes a month we cost $1,250.', M.saltbox)).toBe(false);
  });
  it('a scenario stated in one sentence does not source a figure in another', () => {
    expect(derivedFromKnown('We would cost $1,100.', M.saltbox)).toBe(false);
  });
  it('one operation on two figures is recognised as it always was', () => {
    expect(derivedFromKnown('17 times 6 is 102.', 'We ran 17 batches of 6.')).toBe(true);
    expect(derivedFromKnown('Revenue grew 25% in 2024.', 'Revenue went from 80 to 100.')).toBe(true);
  });
  it('past twenty figures in the material nothing is worked: almost any number would be', () => {
    const many = Array.from({ length: 21 }, (_, i) => `Plan ${i}: $${101 + i * 7} per month plus $0.${10 + i} per box.`).join('\n');
    expect(derivedFromKnown('At 5,000 boxes a month we cost $1,100.', `${M.saltbox}\n${many}`)).toBe(false);
  });
});

// The author's own held-back analyses, which the claim check failed three of four of, and the method's figure rule.
describe('the same arithmetic wherever a figure is checked', () => {
  it('the author\'s own priced scenarios are recognised', () => {
    expect(derivedFromKnown('A cafe doing $20,000 a month pays Orderly $580 in fees and us $549 with the subscription.', M.kettle)).toBe(true);
    expect(derivedFromKnown('At $40,000 the gap is $111 a month in our favour.', M.kettle)).toBe(true);
    expect(derivedFromKnown('Estimata is $499 once, which we pass after about six months for one user.', M.quarry)).toBe(true);
  });
  it('a method\'s "every figure from the sources" holds a priced scenario, and still not an invented total', async () => {
    const { measure } = await import('../core/observers/registry.js');
    const cited = (text: string): string => measure(text, { observer: 'CITED', params: { allow: 0 } }, { request: '', material: [{ name: 'sources.md', text: M.saltbox }] }).verdict;
    expect(cited('We charge $600 a month plus $0.10 a box. At 10,000 boxes a month we cost $1,600, Prepstack $4,000 and Kitchenly $1,200.')).toBe('MET');
    expect(cited('We charge $600 a month plus $0.10 a box. At 10,000 boxes a month we cost $1,750.')).toBe('VIOLATED');
    expect(cited('Prepstack ships 2.3 million boxes a month.')).toBe('VIOLATED');
  });
});

// A fact sheet, 20 honest and 20 invented sentences (the tester's set). The worked calculations must not loosen the
// method's figure rule: a first version of them "broke even" a head count against a customer count and passed two
// more invented percentages. What the rule still passes is known and stated: a true figure moved to another subject
// ("210 engineers"), a wrong year or quarter, a single digit. Those need the subject read, which this does not do.
describe('the method\'s figure rule on a fact sheet: no looser than it was', () => {
  const sheet = 'Q3 2026 fact sheet, Northwind Analytics.\nRevenue: $48.2 million in Q3 2026, up 12% from Q3 2025.\nCustomers: 3,400 paying customers; 210 enterprise customers.\n'
    + 'Pricing: Starter $29 per user per month; Business $79 per user per month.\nHeadcount: 640 employees, 180 in engineering.\nChurn: 3.1% monthly gross churn on Starter; 0.8% on Business.\n'
    + 'Founded 2016 in Austin. Series C of $90 million in March 2025.\nData centres: 4 regions. Uptime: 99.95% over the last 12 months.';
  const honest = ['Northwind made $48.2 million in Q3 2026.', 'Revenue grew 12% year on year.', 'It has 3,400 paying customers.', 'Of these, 210 are enterprise customers.', 'Starter costs $29 per user per month.',
    'Business is $79 a user each month.', 'The company employs 640 people.', 'Engineering is 180 of the 640 staff.', 'Monthly churn on Starter is 3.1%.', 'Business churns at 0.8% a month.', 'It was founded in 2016.',
    'It raised a $90 million Series C in March 2025.', 'It runs in 4 regions.', 'Uptime was 99.95% over twelve months.', 'Business costs $50 more per user than Starter.', 'About 3.4k customers pay today.',
    'Revenue was roughly $48 million last quarter.', 'We recommend a 30-day trial for enterprise buyers.', 'Most of the 3,400 customers are on Starter, by our estimate.', 'Engineering is about 28% of headcount.'];
  const caught = ['Revenue grew 18% year on year.', 'It has 4,100 paying customers.', 'Starter costs $39 per user per month.', 'The company employs 720 people.', 'It raised $120 million in its Series C.',
    'Uptime was 99.99% over twelve months.', 'Northwind holds 22% of its market.', 'Net revenue retention is 118%.', 'Average deal size is $14,000 a year.', 'It plans to hire 200 people in 2027.', 'Gross margin is 76%.'];
  const notCaught = ['Monthly churn on Business is 3.1%.', 'Enterprise customers grew 12% this year.', 'It was founded in 2014.', 'It runs in 6 regions.', 'Together the two plans cost $108 per user.',
    'It has 210 engineers.', 'Its Series C closed in March 2024.', 'Revenue was $48.2 million in Q2 2026.', 'It has 640 enterprise customers.'];
  it('11 of 20 invented figures fail it, and the 9 it cannot see are named here; 1 of 20 honest sentences fails it', async () => {
    const { measure } = await import('../core/observers/registry.js');
    const fails = (t: string): boolean => measure(t, { observer: 'CITED', params: { allow: 0 } }, { request: '', material: [{ name: 'sheet.md', text: sheet }] }).verdict === 'VIOLATED';
    expect(caught.filter((t) => !fails(t))).toEqual([]);
    expect(notCaught.filter(fails)).toEqual([]);
    expect(honest.filter(fails)).toEqual(['We recommend a 30-day trial for enterprise buyers.']);
  });
});

// An independent review of the first version: any figure of the material was a "rate", so a head count times twelve
// sourced a number of people, two invented numbers vouched for each other, and a count satisfied a percentage.
describe('what a review of the first version found', () => {
  const sheet = 'Pricing: Starter $29 per user per month.\nHeadcount: 640 employees.\nData centres: 4 regions.';
  it('only prices are worked from, and only into amounts of money', async () => {
    const { measure } = await import('../core/observers/registry.js');
    const fails = (t: string): boolean => measure(t, { observer: 'CITED', params: { allow: 0 } }, { request: '', material: [{ name: 'sheet.md', text: sheet }] }).verdict === 'VIOLATED';
    for (const t of ['Net revenue retention is 48% a year.', 'It plans to hire 7,680 people a year.', 'It has 55 offices and 35,200 contractors.', 'It has 9 offices and 261 partners.',
      'Each of its 9 regions has 5,760 servers.', 'No one doubts its 611 patents.', 'Its ten largest customers pay $6,400 each.']) expect(fails(t), t).toBe(true);
  });
  it('the claim check reads the same', () => {
    expect(derivedFromKnown('With 40 offices the firm employs 480 people.', 'Founded with 12 staff in one room.')).toBe(false);
    expect(derivedFromKnown('Estimata employs 30 people and has 14,970 users.', M.quarry)).toBe(false);
    expect(derivedFromKnown('With 100 users, churn is 7,900%.', M.quarry)).toBe(false);
    expect(derivedFromKnown('Tillcraft holds 26% of a market of 1,000 shops.', M.kettle)).toBe(false);
    expect(derivedFromKnown('Growth runs at 36% a year.', 'We have 3 seats and 40 staff.')).toBe(false);
    expect(derivedFromKnown('The 40 staff serve nine hundred customers.', 'We have 3 seats and 40 staff.')).toBe(false);
  });
  it('a figure with a scale word is read as it always was', () => {
    const m = 'Revenue was $1.5 million last year. We have 3 million users.';
    expect(derivedFromKnown('Revenue was $1.5 million last year.', m)).toBe(true);
    expect(derivedFromKnown('We have 3 million users.', m)).toBe(true);
    expect(derivedFromKnown('The team has 3 million users.', 'We have 3 seats.')).toBe(false);
  });
});
