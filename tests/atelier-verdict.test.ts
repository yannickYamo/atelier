// tests/atelier-verdict.test.ts — A VERDICT THAT CAN BE MET BY AN EMPTY SHELL, OR BY AN INVENTED NUMBER, IS NOT ONE.
//
// What a method requires was read too loosely to mean anything: a heading with nothing under it was a section, a row
// of dashes was a table, "open with" and "end with" said nothing of where, a figure that was the sum of any two
// numbers in the material was "sourced", and with no material bound the sourcing rule did not run at all. Each is
// held here by the smallest text that used to pass.
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { measure } from '../core/observers/registry.js';
import { stepsOf, methodProposals } from '../core/method/standard.js';
import { verifyText } from '../core/observers/verify.js';
import { planRepair } from '../core/loop/repair.js';
import { spanIntegrity } from '../core/loop/integrity.js';
import { aRequirement } from './fixtures.js';
import type { StandardVersion } from '../core/state/canonical-state.js';

const presence = (text: string, params: Record<string, number | readonly string[]>): { verdict: string; detail: string } => { const r = measure(text, { observer: 'PRESENCE', params }); return { verdict: r.verdict, detail: r.detail }; };
const cited = (text: string, material: string | null, request = ''): { verdict: string; missing: string[] } => {
  const r = measure(text, { observer: 'CITED', params: { allow: 0 } }, { request, material: material === null ? [] : [{ name: 'chart.md', text: material }] });
  return { verdict: r.verdict, missing: r.spans.map((s) => s.text) };
};

describe('a section is there when it has something in it, and where the method says it is', () => {
  const skeleton = '## Recommendation\n\n## Notes on the situation\n\nThe patient is stable and was reviewed this morning by the team.\n';
  it('a heading with nothing under it is not the section', () => {
    expect(presence(skeleton, { sections: ['Recommendation'], body: 1 })).toEqual({ verdict: 'VIOLATED', detail: 'the "Recommendation" section is empty' });
    expect(presence(skeleton, { sections: ['Notes'], body: 1 }).verdict).toBe('MET');
    // a section that holds only a table holds something
    expect(presence('## Prices\n\n| Vendor | Price |\n|---|---|\n| Acme | 12 |\n', { sections: ['Prices'], body: 1 }).verdict).toBe('MET');
  });
  it('as it was read before, for a standard that does not ask: the heading alone', () => {
    expect(presence(skeleton, { sections: ['Recommendation'] }).verdict).toBe('MET');
  });
  const piece = '## Background\n\nThe account was opened in March by the regional team.\n\n## Verdict\n\nBorealis wins for a small team of ten.\n\n## Risks\n\nEither vendor can change its list price.\n';
  it('"open with" is the first section, and "end with" is the last', () => {
    expect(presence(piece, { sections: ['Verdict'], opens: 1 })).toEqual({ verdict: 'VIOLATED', detail: 'the text opens with "Background", not with the "Verdict" section' });
    expect(presence(piece, { sections: ['Background'], opens: 1 }).verdict).toBe('MET');
    expect(presence(piece, { sections: ['Verdict'], closes: 1 })).toEqual({ verdict: 'VIOLATED', detail: 'the text ends with "Risks", not with the "Verdict" section' });
    expect(presence(piece, { sections: ['Risks'], closes: 1 }).verdict).toBe('MET');
  });
});

describe('work that marks its sections another way is read the way it is written', () => {
  const sbar = 'Situation: Mrs Hale, bed 9, is bleeding again after her procedure.\n\nBackground: She was admitted on Tuesday with a peptic ulcer.\n\n**Assessment**\n\nShe is pale and her pulse is rising.\n\nRecommendation:\nReview within the hour, please.\n';
  it('a label on its own line or opening one, plain or bold, is a section where the standard says labels are', () => {
    expect(presence(sbar, { sections: ['Situation', 'Background', 'Assessment', 'Recommendation'], labels: 1, body: 1 }).verdict).toBe('MET');
    expect(presence(sbar, { sections: ['Situation', 'Plan'], labels: 1 })).toEqual({ verdict: 'VIOLATED', detail: 'no "Plan" section' });
    expect(presence(sbar, { sections: ['Situation'] }).verdict).toBe('VIOLATED');
  });
  it('a numbered clause heading in capitals is one too', () => {
    const contract = '1. DEFINITIONS\n\n"Service" means the hosted product described in Schedule A.\n\n2. TERM\n\nThis agreement runs for the initial period.\n';
    expect(presence(contract, { sections: ['Definitions', 'Term'], labels: 1, body: 1 }).verdict).toBe('MET');
  });
  it('a sentence that happens to hold a colon is not a section', () => {
    expect(presence('We agreed one thing: the price holds for a year.\n', { sections: ['thing'], labels: 1 }).verdict).toBe('VIOLATED');
  });
});

describe('a table is there when it has a row that says something', () => {
  it('a header over rows of dashes is not the table', () => {
    const empty = '| Vendor | Price |\n|---|---|\n| - | - |\n| | |\n';
    const r = measure(empty, { observer: 'TABLE', params: { columns: ['vendor', 'price'], minRows: 1 } });
    expect([r.verdict, r.detail]).toEqual(['VIOLATED', 'the table has 0 row(s), and 1 are required']);
    expect(measure('| Vendor | Price |\n|---|---|\n| Acme | 12 |\n', { observer: 'TABLE', params: { columns: ['vendor', 'price'], minRows: 1 } }).verdict).toBe('MET');
  });
});

describe('a figure is sourced when it was given, and not because some two numbers add up to it', () => {
  const chart = 'Mrs Hale is 64 years old. Respiratory rate 16 breaths a minute. Enoxaparin 40 mg once daily. 10 of 20 doses were given.';
  it('a dose that is the sum of an age and a breathing rate was not given', () => {
    expect(cited('Enoxaparin 80 mg tonight.', chart)).toEqual({ verdict: 'VIOLATED', missing: ['80 mg'] });
    expect(cited('Enoxaparin 40 mg tonight.', chart).verdict).toBe('MET');
  });
  it('a sum or a difference of two given amounts of the same thing was', () => {
    expect(cited('That is 20 seats in all.', 'The first order was 12 seats and the second was 8 seats.').verdict).toBe('MET');
    expect(cited('That leaves 4 seats.', 'The first order was 12 seats and the second was 8 seats.').verdict).toBe('MET');
    expect(cited('That is 20 dollars in all.', 'The first order was 12 seats and the second was 8 seats.').verdict).toBe('VIOLATED');
  });
  it('a share worked out from two given counts was, to the nearest point', () => {
    expect(cited('Half the doses, 50%, were given.', chart).verdict).toBe('MET');
    expect(cited('About 43% were given.', chart)).toEqual({ verdict: 'VIOLATED', missing: ['43%'] });
  });
  it('a multiple and the same thing as a percentage are one figure', () => {
    expect(cited('The fee is 1.25x the base.', 'The fee is 125% of the base.').verdict).toBe('MET');
  });
  it('a pair written with a slash, and a single digit with its unit, are figures', () => {
    expect(cited('Blood pressure 82/45.', 'Blood pressure 110/70 on admission.')).toEqual({ verdict: 'VIOLATED', missing: ['82/45'] });
    expect(cited('Blood pressure 110/70.', 'Blood pressure 110/70 on admission.').verdict).toBe('MET');
    expect(cited('Give 4 g tonight.', 'Paracetamol 1 g four times daily.')).toEqual({ verdict: 'VIOLATED', missing: ['4 g'] });
    expect(cited('Give 1 g tonight.', 'Paracetamol 1 g four times daily.').verdict).toBe('MET');
  });
  it('a date and a line of a file are not figures', () => {
    expect(cited('The term ends on 31 December 2027.', 'The agreement was signed in Leeds.').verdict).toBe('MET');
    expect(cited('On line 214 the handle is never closed.', 'The diff adds a retry loop.').verdict).toBe('MET');
  });
});

describe('what an independent review found the first version of this got wrong', () => {
  it('the same amount written another way is the same amount', () => {
    expect(cited('Give 40 mg tonight.', 'The dose is 40 milligrams.').verdict).toBe('MET');
    expect(cited('The dose is 40 milligrams.', 'Give 40 mg tonight.').verdict).toBe('MET');
    expect(cited('A 40-mg tablet.', 'Give 40 mg tonight.').verdict).toBe('MET');
    expect(cited('Give 50 mcg.', 'Give 50 µg.').verdict).toBe('MET');
    expect(cited('Give 40 mg tonight.', '| Drug | Dose (mg) |\n|---|---|\n| Enoxaparin | 40 |\n').verdict).toBe('MET');
    expect(cited('Give 40 mg tonight.', 'She is 40 and well.').verdict).toBe('VIOLATED');
  });
  it('"times" counts occasions, and a slash is not always a reading', () => {
    expect(cited('We tried 3 times before it worked.', 'We tried 3 times before it worked.').verdict).toBe('MET');
    expect(cited('Take it 3 times a week.', 'Take it three times a week.').verdict).toBe('MET');
    expect(cited('Growth of 300%.', 'Take it 3 times a week.').verdict).toBe('VIOLATED');
    expect(cited('Support is 24/7 and the split is 50/50, for 1/3 of the users.', 'Nothing here.').verdict).toBe('MET');
  });
  it('amounts of the same thing add up, however they are described and rounded', () => {
    expect(cited('That is 20 customers in total.', 'It has 12 enterprise customers and 8 startup customers.').verdict).toBe('MET');
    expect(cited('A saving of $30.', 'It was 120 dollars, and is now $90.').verdict).toBe('MET');
    expect(cited('About 20,500 in all.', 'There were 12,437 users in March and 8,112 users in April.').verdict).toBe('MET');
    expect(cited('About 21,500 in all.', 'There were 12,437 users in March and 8,112 users in April.').verdict).toBe('VIOLATED');
  });
  it('an invented figure is not hidden by the word after it or before it', () => {
    expect(cited('Up to 45% may churn and 300 may leave; $900 may be lost.', 'Nothing here.').missing).toEqual(['45%', '300', '$900']);
    expect(cited('In May 2,000 users joined.', 'Nothing here.').missing).toEqual(['2,000']);
    expect(cited('The bottom line 40% churned; issue 120 refunds; grade 95 scores.', 'Nothing here.').missing).toEqual(['40%', '120', '95']);
  });
  it('a share is of one thing in the same thing, and two numbers that count nothing add up to nothing', () => {
    const plan = 'There are 8 seats and 2 admins and 5 teams and 3 plans.';
    for (const pct of ['25%', '40%', '60%', '160%', '250%', '38%', '63%']) expect(cited(`That is ${pct}.`, plan).verdict, pct).toBe('VIOLATED');
    expect(cited('Give 80 units of insulin.', 'Age: 64. Resp rate: 16.').verdict).toBe('VIOLATED');
  });
});

describe('sections, as the review found them misread', () => {
  it('a short section is still a section; only a bare heading is empty', () => {
    expect(presence('## Risks\n\nNone.\n\n## Total\n\n$4,200\n\n## Owners\n\n- Priya\n- Tom\n', { sections: ['Risks', 'Total', 'Owners'], body: 1 }).verdict).toBe('MET');
    expect(presence('Allergies: none known\n\nPlan: review tomorrow morning\n', { sections: ['Allergies', 'Plan'], body: 1, labels: 1 }).verdict).toBe('MET');
    expect(presence('## Risks\n\n### Legal\n\n### Market\n', { sections: ['Risks'], body: 1 })).toEqual({ verdict: 'VIOLATED', detail: 'the "Risks" section is empty' });
  });
  it('a line of the header, a lead-in in bold and a title in capitals are not sections', () => {
    const letter = 'Date: 12 May\nTo: the board\n\n## Situation\n\nWe are short of cash this quarter.\n\nNote: call me before Friday.\n';
    expect(presence(letter, { sections: ['Situation'], opens: 1, closes: 1, labels: 1 }).verdict).toBe('MET');
    expect(presence('**Acme Corp** signed on Tuesday and has asked for terms.\n\n2024 ANNUAL REPORT\n\nRevenue rose.\n', { sections: ['Acme Corp'], labels: 1 }).verdict).toBe('VIOLATED');
    expect(presence('**Acme Corp** signed on Tuesday and has asked for terms.\n\n2024 ANNUAL REPORT\n\nRevenue rose.\n', { sections: ['Annual Report'], labels: 1 }).verdict).toBe('VIOLATED');
  });
  it('"open with" is not met by a section that follows a page of something else, and every failure says where', () => {
    const late = `${'This preamble runs on for a while before any section is reached, which is not opening with it. '.repeat(2)}\n\n## Verdict\n\nBorealis wins.\n`;
    expect(presence(late, { sections: ['Verdict'], opens: 1 }).verdict).toBe('VIOLATED');
    const r = measure('## Owners\n', { observer: 'PRESENCE', params: { sections: ['Owners'], body: 1 } });
    expect(r.verdict).toBe('VIOLATED');
    expect(r.spans.length).toBeGreaterThan(0);
  });
});

describe('steps, as the review found them misread', () => {
  const example = { task: 'Review the retry change.', material: [{ name: 'diff.md', text: 'The diff adds a retry loop.' }],
    reference: '## Verdict\n\nSafe to merge once the delay is capped.\n\n## Risks\n\nThe loop can spin for ever.\n\n## Sources\n\nThe diff, and the incident note.\n' };
  const of = (note: string, re: RegExp): ReturnType<typeof methodProposals>[number] | undefined => methodProposals(note, example).find((p) => re.test(p.statement));
  it('an instruction written as a sentence is kept', () => {
    const note = '# Review\n\nMake sure that you never give the verdict before reading the diff. It is important that you always cite the file. State which risks must be fixed before merge.\n\n- Open with a Verdict section.\n';
    expect(stepsOf(note).map((s) => s.text)).toEqual(['Open with a Verdict section.', 'Make sure that you never give the verdict before reading the diff.', 'It is important that you always cite the file.', 'State which risks must be fixed before merge.']);
  });
  it('a word like "first" or "last" inside a step says nothing of where the section is', () => {
    expect(of('- Include a Risks section listing the first three risks.\n', /^Include a Risks/)).toMatchObject({ obligation: 'DELIVERABLE', measurement: { params: { sections: ['Risks'], body: 1 } } });
    expect(of('- Include a Risks section listing the first three risks.\n', /^Include a Risks/)?.measurement?.params).not.toHaveProperty('opens');
    expect(of('- Include a Sources section with the last access date.\n', /^Include a Sources/)?.measurement?.params).not.toHaveProperty('closes');
  });
  it('a step that forbids a section, or asks for it only sometimes, is not a requirement that it be there', () => {
    for (const step of ['Do not end with a Sources section unless asked.', 'Add a Risks section only when the change touches billing.', 'Give the Risks section a second read before sending.',
      'With the Verdict section done, check the tone.', 'Put the answer under a heading that fits the reader best.']) {
      expect(of(`- ${step}\n`, new RegExp(`^${step.slice(0, 12)}`)), step).toMatchObject({ obligation: 'JUDGEMENT', measurement: null, demoted: null });
    }
  });
});

describe('with nothing bound, a figure was still not given', () => {
  it('the rule runs against the request alone, and an invented figure breaks it', () => {
    expect(cited('Her haemoglobin has dropped to 74 g/L.', null, 'Hand over bed 9.')).toEqual({ verdict: 'VIOLATED', missing: ['74 g'] });
    expect(cited('Raise the cap to 500 seats.', null, 'Should we raise the cap to 500 seats?').verdict).toBe('MET');
    expect(cited('She is stable and comfortable.', null, 'Hand over bed 9.').verdict).toBe('MET');
  });
});

describe('a figure the material does not hold is cut, and the rewrite is let to lose it', () => {
  const v = { standardVersionHash: 'h', evidenceId: null, workType: 'handover', requirements: [aRequirement({ requirementId: 'x4', statement: 'Every figure is sourced.', materiality: 'REQUIRED', obligation: 'EXECUTION', measurement: { observer: 'CITED', params: { allow: 0 } } })] } as unknown as StandardVersion;
  it('the repair of that sentence is one whose specifics are meant to go', () => {
    const text = 'She is stable this morning. Her haemoglobin has dropped to 74 g/L and she has lost about 850 ml in total. The plan is unchanged.';
    const context = { request: 'Hand over bed 9.', material: [{ name: 'chart.md', text: 'Admitted Tuesday. Stable overnight.' }] };
    const targets = planRepair(text, verifyText('s', v, text, context));
    expect(targets).toHaveLength(1);
    const original = text.slice(targets[0].start, targets[0].end);
    expect(original).toBe('Her haemoglobin has dropped to 74 g/L and she has lost about 850 ml in total.');
    // THE FIGURES ARE WHAT MAY GO, AND ONLY THEY: the rest of the sentence is held as any rewrite is.
    const t = targets[0];
    // as the repair loop calls it (core/loop/repair.ts)
    const held = (replacement: string): boolean => spanIntegrity(original, replacement, new Set(t.drops), t.specifics && !t.mixed, new Set(t.swaps ?? []), t.recase ?? false, t.mixed ? t.claims ?? [] : []).ok;
    expect(t).toMatchObject({ specifics: true, mixed: true, claims: ['74 g', '850 ml'] });
    expect(held('Her haemoglobin has dropped and she has lost blood in total.')).toBe(true);
    expect(held('Her haemoglobin has not dropped and she has lost no blood.')).toBe(false);
  });
});

describe('a step is a step when it tells the writer what to do, however its sentence opens', () => {
  const example = { task: 'Review the retry change.', material: [{ name: 'diff.md', text: 'The diff adds a retry loop.' }],
    reference: '## Background\n\nThe change adds a retry loop around the upload call.\n\n## Security\n\nNo new input reaches the shell.\n\n## Assessment\n\nSafe to merge once the delay is capped.\n' };
  const of = (note: string, re: RegExp): ReturnType<typeof methodProposals>[number] | undefined => methodProposals(note, example).find((p) => re.test(p.statement));
  it('a verb that opens the sentence, a name in quotation marks, a section "called" or "on" something', () => {
    const note = '- Include a Background section that says what changed.\n- The review must have a "Security" section.\n- Write an Assessment section last.\n- Add a section called Background before anything else.\n';
    expect(of(note, /^Include a Background/)).toMatchObject({ obligation: 'DELIVERABLE', measurement: { observer: 'PRESENCE', params: { sections: ['Background'], body: 1 } } });
    expect(of(note, /"Security"/)).toMatchObject({ obligation: 'DELIVERABLE', measurement: { observer: 'PRESENCE', params: { sections: ['Security'], body: 1 } } });
    expect(of(note, /^Write an Assessment/)).toMatchObject({ obligation: 'DELIVERABLE' });
    expect(of(note, /^Add a section called/)).toMatchObject({ obligation: 'DELIVERABLE', measurement: { params: { sections: ['Background'] } } });
  });
  it('"open with" and "end with" are held to where the section is, and the owner is asked when their example disagrees', () => {
    const note = '- Open with a Background section.\n- End with an Assessment section.\n- Open with a Security section.\n';
    expect(of(note, /^Open with a Background/)).toMatchObject({ obligation: 'DELIVERABLE', measurement: { params: { sections: ['Background'], opens: 1, body: 1 } } });
    expect(of(note, /^End with an Assessment/)).toMatchObject({ obligation: 'DELIVERABLE', measurement: { params: { sections: ['Assessment'], closes: 1, body: 1 } } });
    expect(of(note, /^Open with a Security/)).toMatchObject({ obligation: 'JUDGEMENT', demoted: expect.stringMatching(/your example does not hold it .*opens with "Background"/) as unknown });
  });
  it('a section only mentioned in passing is still no requirement on the shape of the work', () => {
    const note = '- Never give the Assessment before reading the whole diff.\n- Keep the Background short.\n';
    expect(of(note, /^Never give/)).toMatchObject({ obligation: 'JUDGEMENT', measurement: null });
    expect(of(note, /^Keep the Background/)).toMatchObject({ obligation: 'JUDGEMENT', measurement: null });
  });
  it('a sentence that describes the work is not an instruction because it holds the word "never"', () => {
    const note = '# Handover\n\nIt is read in under two minutes by a registrar who has never met the patient.\n\nNever recommend before the assessment.\n\n- Include a Background section.\n';
    expect(stepsOf(note).map((s) => s.text)).toEqual(['Include a Background section.', 'Never recommend before the assessment.']);
  });
  it('work whose sections are labels, not headings, is read as it is written', () => {
    const sbar = { task: 'Hand over bed 9.', material: [], reference: 'Situation: Mrs Hale, bed 9, is bleeding again after her procedure.\n\nBackground: She was admitted on Tuesday with a peptic ulcer.\n\nRecommendation: Review within the hour, please.\n' };
    const p = methodProposals('- Open with a Situation section.\n- End with a Recommendation section.\n', sbar);
    expect(p[0]).toMatchObject({ obligation: 'DELIVERABLE', measurement: { observer: 'PRESENCE', params: { sections: ['Situation'], opens: 1, body: 1, labels: 1 } } });
    expect(p[1]).toMatchObject({ obligation: 'DELIVERABLE', measurement: { params: { sections: ['Recommendation'], closes: 1, labels: 1 } } });
  });
});

describe('through the binary: a skill is its owner\'s, and another folder does not replace it', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'atelier-verdict-')));
  const run = (dir: string, ...args: string[]): { code: number; out: string; err: string } => {
    const env = { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(ATELIER|ANTHROPIC|OPENAI)_/.test(k))), ATELIER_DATA: join(root, 'data'), ATELIER_PROJECT_DIR: dir };
    const r = spawnSync(process.execPath, [resolve('dist/cli/atelier.mjs'), ...args], { encoding: 'utf8', cwd: dir, env });
    return { code: r.status ?? -1, out: r.stdout, err: r.stderr };
  };
  const project = (name: string, step: string): string => {
    const dir = join(root, name); mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'method.md'), `- ${step}\n- Weigh the risk before recommending anything.\n`);
    writeFileSync(join(dir, 'example.md'), '---\nrequest: Review the retry change.\n---\n## Background\n\nThe change adds a retry loop around the upload call.\n\n## Assessment\n\nSafe to merge once the delay is capped.\n');
    return dir;
  };
  it('two people whose method file has the same name do not overwrite each other', () => {
    const first = project('first', 'Open with a Background section.'); const second = project('second', 'End with an Assessment section.');
    const built = run(first, 'method', 'method.md', '--golden', 'example.md', '--yes');
    expect(built.code, built.err).toBe(0);
    const stored = (): string => { const d = join(root, 'data', 'skills', 'method'); return `${readdirSync(join(d, 'standards')).sort().join(',')}|${readFileSync(join(d, 'active.json'), 'utf8')}`; };
    const asBuilt = stored();
    const clash = run(second, 'method', 'method.md', '--golden', 'example.md', '--yes');
    expect(clash.code).not.toBe(0);
    expect(clash.err).toMatch(/a skill called "method" already exists, and this folder has no record of building it\. Building here would replace its standard\. Give this one a name of its own: --name <name>\./);
    // the first skill is as it was built, standard and version, and the second builds under its own name
    expect(stored()).toBe(asBuilt);
    // a name longer than a skill's name can be is the name it is cut to, and is refused as that
    const long = 'a-name-that-runs-well-past-the-forty-characters-a-skill-may-carry';
    expect(run(first, 'method', 'method.md', '--golden', 'example.md', '--name', long, '--review').out).toMatch(/--name a-name-that-runs-well-past-the-forty-char(?:a)? --yes|--name [a-z-]{1,40} --yes/);
    expect(run(second, 'method', 'method.md', '--golden', 'example.md', '--name', 'Second Review', '--yes').out).toMatch(/second-review/);
  }, 180_000);
  it('a method whose every step the example holds is built in one call, with nothing to confirm', () => {
    const third = project('third', 'Open with a Background section.');
    const r = run(third, 'method', 'method.md', '--golden', 'example.md', '--name', 'third');
    expect(r.code, r.err).toBe(0);
    expect(r.out).not.toMatch(/Nothing has been built/);
    expect(run(third, 'verify', '--skill', 'third', 'example.md').code).toBe(0);
  }, 120_000);
  it('a bare heading added to a draft does not make it conformant, and a full one does', () => {
    const first = join(root, 'first');
    writeFileSync(join(first, 'shell.md'), '## Background\n\n## Assessment\n\nSafe to merge once the delay is capped.\n');
    const shell = run(first, 'verify', '--skill', 'method', 'shell.md');
    expect(shell.code).toBe(1);
    expect(`${shell.out}${shell.err}`).toMatch(/the "Background" section is empty/);
  }, 60_000);
});
