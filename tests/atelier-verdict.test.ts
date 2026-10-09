// tests/atelier-verdict.test.ts — A VERDICT THAT CAN BE MET BY AN EMPTY SHELL, OR BY AN INVENTED NUMBER, IS NOT ONE.
//
// What a method requires was read too loosely to mean anything: a heading with nothing under it was a section, a row
// of dashes was a table, "open with" and "end with" said nothing of where, a figure that was the sum of any two
// numbers in the material was "sourced", and with no material bound the sourcing rule did not run at all. Each is
// held here by the smallest text that used to pass.
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync } from 'node:fs';
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
    expect(cited('The fee is 1.25 times the base.', 'The fee is 125% of the base.').verdict).toBe('MET');
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
    expect(targets[0]).toMatchObject({ specifics: true });
    expect(text.slice(targets[0].start, targets[0].end)).toBe('Her haemoglobin has dropped to 74 g/L and she has lost about 850 ml in total.');
    // a rewrite that drops both figures is accepted: losing them is the repair
    expect(spanIntegrity(text.slice(targets[0].start, targets[0].end), 'Her haemoglobin has dropped and she has lost blood.', new Set(), true).ok).toBe(true);
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
    const clash = run(second, 'method', 'method.md', '--golden', 'example.md', '--yes');
    expect(clash.code).not.toBe(0);
    expect(clash.err).toMatch(/a skill called "method" already exists, and it was not built in this folder\. Building here would replace its standard\. Give this one a name of its own: --name <name>\./);
    // the first skill is as it was built, and the second builds under its own name
    expect(run(first, 'verify', '--skill', 'method', 'example.md').code).toBe(0);
    expect(run(second, 'method', 'method.md', '--golden', 'example.md', '--name', 'Second Review', '--yes').out).toMatch(/second-review/);
  }, 180_000);
  it('a bare heading added to a draft does not make it conformant, and a full one does', () => {
    const first = join(root, 'first');
    writeFileSync(join(first, 'shell.md'), '## Background\n\n## Assessment\n\nSafe to merge once the delay is capped.\n');
    const shell = run(first, 'verify', '--skill', 'method', 'shell.md');
    expect(shell.code).toBe(1);
    expect(`${shell.out}${shell.err}`).toMatch(/the "Background" section is empty/);
  }, 60_000);
});
