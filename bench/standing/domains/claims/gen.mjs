// A claims-assessment domain, made in code: nothing here is a real insurer, insured, adjuster or policy. Ten memos
// an adjuster wrote to her method, each with its claim file (notice of loss, police or incident report, invoices,
// the policy); ten claim files as tasks; a checker written before any arm output existed; and drafts with planted
// defects for the planted-defect measure. Usage: node gen-claims.mjs <out dir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2]; if (!out) throw new Error('usage: node gen-claims.mjs <out dir>');
const INSUREDS = ['Larkspur Robotics Ltd', 'Mossbank Analytics Inc', 'Tindall & Vane LLP', 'Orchard Row Studio Ltd', 'Pellucid Health Inc', 'Quarry Lane Foods Ltd', 'Rushmere Logistics Inc', 'Saltmarsh Games Oy', 'Thornfield Legal Ltd', 'Umber Street Coffee Co',
  'Vellum Press Inc', 'Wayfarer Fintech Ltd', 'Yewtree Biotech AS', 'Zephyr Point Media Ltd', 'Alder Mews Architects', 'Bramble Hill Dental', 'Cinder Lane Hardware Inc', 'Dovecote Learning Ltd', 'Elmhurst Clinics LLP', 'Ferrous Gate Engineering Ltd'];
const PLACES = ['a co-working space on Fenwick Street', 'the insured\'s office on Harbour Lane', 'a client site in Kilburn', 'a shared workshop on Tanner Row', 'a hotel meeting room in Leeds', 'the insured\'s van, parked overnight', 'a conference venue in Bristol', 'a rented studio on Pike Street', 'a storage unit on Mill Road', 'a university library'];
const ITEMS = [['laptop', 'docking station'], ['camera body', 'lens'], ['two monitors', 'a desktop workstation'], ['a 3D printer', 'filament stock'], ['a tablet', 'a drawing display'], ['a projector', 'a sound bar'], ['a laptop', 'a phone'], ['a soldering station', 'an oscilloscope'], ['a label printer', 'a barcode scanner'], ['a laptop', 'an external drive']];
const HOW = ['theft from a locked locker', 'theft from an unlocked desk', 'water damage from a burst pipe', 'theft from a locked van', 'accidental drop during transport', 'theft from an unattended bag', 'power surge after a storm', 'theft from a locked office overnight', 'fire damage in a neighbouring unit', 'theft from a locked storage unit'];
const CLAUSE = { contents: '4.2', transit: '4.5', water: '4.7', surge: '4.9' };
const kind = (how) => (/water/.test(how) ? 'water' : /surge/.test(how) ? 'surge' : /transport/.test(how) ? 'transit' : 'contents');
const amounts = (i) => [1200 + ((i * 937) % 4100), 650 + ((i * 541) % 2200)];
const fmt = (n) => n.toLocaleString('en-US');
const date = (i) => `${3 + ((i * 5) % 24)} ${['March', 'April', 'June', 'September'][i % 4]} 2026`;
const reportDate = (i) => `${5 + ((i * 5) % 24)} ${['March', 'April', 'June', 'September'][i % 4]} 2026`;

const POLICY = `COMMERCIAL CONTENTS POLICY, EXTRACT

4. Cover
4.2 Contents. We cover loss of or damage to business contents at the premises named in the schedule, and at any other premises while in the insured's custody, caused by theft, fire, storm or escape of water.
4.5 Transit. We cover accidental loss of or damage to portable equipment while being carried by an employee between premises.
4.7 Escape of water. We cover damage to contents caused by water escaping from any fixed pipe, tank or appliance.
4.9 Electrical surge. We cover damage to electronic equipment caused by a surge in the electrical supply, where the equipment was connected through a surge protector.

7. Exclusions
7.1 Unattended property. We do not cover theft of portable equipment left unattended in a shared or public space, unless it was in a locked container or locked room at the time.
7.3 Wear and tear. We do not cover gradual deterioration.
7.5 Unproven loss. We do not cover a loss not reported to the police within seven days, where theft is alleged.

9. Reserves
9.1 The reserve on a contents claim is the sum of the invoices or valuations in the file, less the excess of 250 dollars where the policy schedule applies one. Where no excess is shown in the schedule, none applies.
`;

const unattended = (how) => /unlocked|unattended/.test(how);
const memo = (i, ins, place, items, how, [a, b], locked) => {
  const k = kind(how); const clause = CLAUSE[k]; const total = a + b;
  const facts = [
    `${ins} reported the loss on ${date(i)} [notice of loss].`,
    `The loss occurred at ${place} [notice of loss].`,
    `The items are ${items[0]} and ${items[1]} [invoice 1], [invoice 2].`,
    /theft/.test(how) ? `The theft was reported to the police on ${reportDate(i)} [police report].` : `The incident was recorded on ${reportDate(i)} [incident report].`,
    /theft/.test(how) ? `The ${locked ? 'items were in a locked container at the time' : 'items were not in a locked container at the time'} [police report].` : null,
  ].filter(Boolean);
  const coverage = [
    `The loss falls under clause ${clause} of the policy, which covers ${k === 'contents' ? 'theft of or damage to business contents in the insured\'s custody' : k === 'transit' ? 'accidental damage to portable equipment carried between premises' : k === 'water' ? 'damage from water escaping a fixed pipe' : 'damage from an electrical surge through a protector'} [policy].`,
    /theft/.test(how) ? (locked ? `Exclusion 7.1 does not apply: the items were in a locked container [police report], [policy].` : `Exclusion 7.1 applies: the items were unattended in a shared space and not in a locked container [police report], [policy].`) : `Exclusion 7.1 does not apply: no theft is alleged [policy].`,
    /theft/.test(how) ? `Exclusion 7.5 does not apply: the loss was reported to the police within seven days [police report], [policy].` : null,
  ].filter(Boolean);
  const covered = !(/theft/.test(how) && !locked);
  const decision = covered ? `Covered under clause ${clause}. The claim is accepted.` : `Not covered: exclusion 7.1 applies. The claim is declined, and the insured is told why in the terms of the policy.`;
  const reserve = covered ? `The reserve is ${fmt(total)} dollars, the sum of the two invoices (${fmt(a)} dollars and ${fmt(b)} dollars) [invoice 1], [invoice 2]; the schedule applies no excess [policy].` : `No reserve is set: the claim is declined.`;
  return `## Summary\n\n${ins}: ${how} of ${items[0]} and ${items[1]} at ${place}. ${covered ? `Covered under clause ${clause}; reserve ${fmt(total)} dollars.` : 'Declined under exclusion 7.1.'}\n\n## Facts\n\n${facts.join(' ')}\n\n## Coverage analysis\n\n${coverage.join(' ')}\n\n## Decision\n\n${decision}\n\n## Reserve\n\n${reserve}\n`;
};
const file = (i, ins, place, items, how, [a, b], locked) => ({
  'notice-of-loss.txt': `NOTICE OF LOSS\nInsured: ${ins}\nPolicy: CC-${1000 + i * 37}\nDate reported: ${date(i)}\nLoss: ${how} of ${items[0]} and ${items[1]}\nLocation: ${place}\n`,
  [/theft/.test(how) ? 'police-report.txt' : 'incident-report.txt']: `${/theft/.test(how) ? 'POLICE REPORT' : 'INCIDENT REPORT'}\nReference: ${/theft/.test(how) ? 'CR' : 'IR'}/${2026}/${4000 + i * 13}\nDate: ${reportDate(i)}\nReported by: ${ins}\nItems: ${items[0]}, ${items[1]}\nCircumstances: ${how} at ${place}. ${/theft/.test(how) ? (locked ? 'The items were in a locked container at the time.' : 'The items were left in a shared area and were not in a locked container.') : 'No third party involved.'}\n`,
  'invoice-1.txt': `INVOICE 1\nSupplier: Beacon Office Supply\nItem: ${items[0]}\nAmount: ${fmt(a)} dollars\n`,
  'invoice-2.txt': `INVOICE 2\nSupplier: Crane & Sons Electronics\nItem: ${items[1]}\nAmount: ${fmt(b)} dollars\n`,
  'policy.txt': POLICY,
});

mkdirSync(join(out, 'examples'), { recursive: true }); mkdirSync(join(out, 'tasks'), { recursive: true }); mkdirSync(join(out, 'defects'), { recursive: true });
const cases = [];
for (let i = 0; i < 20; i++) {
  const ins = INSUREDS[i]; const place = PLACES[i % 10]; const items = ITEMS[i % 10]; const how = HOW[i % 10]; const am = amounts(i); const locked = !unattended(how);
  const c = { i, ins, place, items, how, am, locked, clause: CLAUSE[kind(how)], covered: !(/theft/.test(how) && !locked), total: am[0] + am[1], date: date(i), reportDate: reportDate(i) };
  cases.push(c);
  const f = file(i, ins, place, items, how, am, locked);
  if (i < 10) {
    const id = `e${String(i + 1).padStart(2, '0')}`;
    mkdirSync(join(out, 'examples', `${id}.material`), { recursive: true });
    for (const [n, t] of Object.entries(f)) writeFileSync(join(out, 'examples', `${id}.material`, n), t);
    writeFileSync(join(out, 'examples', `${id}.md`), `---\nrequest: Draft the claims assessment memo for this claim file.\n---\n${memo(i, ins, place, items, how, am, locked)}`);
  } else {
    const id = `t${i - 10}`;
    mkdirSync(join(out, 'tasks', id), { recursive: true });
    for (const [n, t] of Object.entries(f)) writeFileSync(join(out, 'tasks', id, n), t);
  }
}
writeFileSync(join(out, 'cases.json'), JSON.stringify(cases, null, 1));
writeFileSync(join(out, 'method.md'), `How I write a claims assessment memo

1. Open with a Summary section: one paragraph on who, what, where, and the decision.
2. Then a Facts section. Every fact cites the document in the file it comes from, in square brackets: [notice of loss], [police report], [invoice 1].
3. Then a Coverage analysis section. The coverage conclusion cites the policy clause it rests on, and every exclusion that could apply is addressed and cited.
4. Then a Decision section: covered or not covered, and under which clause.
5. End with a Reserve section. The reserve equals the sum of the invoices in the file, less any excess the schedule applies, and cites the invoices.
6. Never speculate about the insured's intent or honesty.
7. Never use the words "fraud", "scam", "liar" or "suspicious".
8. Take every date, name and figure from the file: add none of your own.
`);
// planted defects on the first example: the date moved, the reserve wrong, exclusion 7.1 unaddressed, a speculation
const e1 = memo(0, INSUREDS[0], PLACES[0], ITEMS[0], HOW[0], amounts(0), true);
writeFileSync(join(out, 'defects', 'e01.date.md'), e1.replace(`reported to the police on ${reportDate(0)}`, `reported to the police on ${date(0)}`));
writeFileSync(join(out, 'defects', 'e01.reserve.md'), e1.replace(`The reserve is ${fmt(amounts(0)[0] + amounts(0)[1])} dollars`, `The reserve is ${fmt(amounts(0)[0] + amounts(0)[1] + 200)} dollars`));
writeFileSync(join(out, 'defects', 'e01.exclusion.md'), e1.replace(/Exclusion 7\.1 does not apply[^.]*\. /, ''));
writeFileSync(join(out, 'defects', 'e01.speculation.md'), e1.replace('## Decision\n\n', '## Decision\n\nThe insured\'s account is suspicious and may be a scam. '));
writeFileSync(join(out, 'defects', 'e01.uncited.md'), e1.replace(' [notice of loss].', '.'));
console.log('claims domain written to', out, 'cases', cases.length);
