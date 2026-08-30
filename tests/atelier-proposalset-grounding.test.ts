// tests/atelier-proposalset-grounding.test.ts — YOU APPROVE WHAT YOU SAW, AND ONLY YOUR OWN WORDS
// BECOME YOUR AUTHORSHIP.
//
// Two polarity properties, both against the real binary with a scripted backend, because both
// defects were invisible to unit tests:
//   1. PERSISTENCE — the preview and the acceptance used to be two model calls; `--yes` compiled a
//      re-roll the person never saw. The backend here answers A at preview, is switched to B, and
//      the acceptance must ratify A with zero further requests.
//   2. GROUNDING — the model's own `faithful: true` used to grant EXPERT_AUTHORED. The backend here
//      returns an invented rule marked faithful with a fabricated span, and it must never become
//      the person's authorship, never instruct.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { groundedInUserText } from '../core/ratification/grounding.js';

const CLI = resolve('dist/cli/atelier.mjs');

beforeAll(() => {
  if (!existsSync(CLI)) execFileSync('npm', ['run', 'build'], { stdio: 'ignore' });
}, 120_000);

// ── the scripted backend, OUT OF PROCESS ─────────────────────────────────────────────────────
//
// The tests drive the CLI with execFileSync, which blocks this process's event loop — an in-process
// server can then never accept the child's request, and the child waits out its full inference
// timeout against a socket that is listening and deaf. See tests/fixtures/scripted-backend.mjs.
interface Rule { statement: string; kind: string; appliesWhen: string; faithful: boolean; sourceSpan: string }
let backend: ChildProcess; let port = 0;

const setPayload = async (p: { rules: Rule[]; workType: string }): Promise<void> => {
  await fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify(p) });
};
const requestCount = async (): Promise<number> => {
  const r = await fetch(`http://127.0.0.1:${port}/__count`);
  return ((await r.json()) as { count: number }).count;
};

beforeAll(async () => {
  backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
  port = await new Promise<number>((ok, bad) => {
    backend.stdout!.on('data', (d: Buffer) => {
      const m = /PORT (\d+)/.exec(d.toString());
      if (m) ok(Number(m[1]));
    });
    backend.on('exit', () => { bad(new Error('scripted backend exited before listening')); });
  });
});
afterAll(() => { backend.kill(); });

/** Run the CLI against the scripted backend. Returns stdout, or `EXIT:<code>` plus stderr+stdout. */
const run = (dataRoot: string, projectDir: string, ...args: string[]): string => {
  try {
    return execFileSync('node', [CLI, ...args,
      '--provider', 'openai-compatible', '--base-url', `http://127.0.0.1:${port}`, '--model', 'scripted'], {
      encoding: 'utf8', cwd: projectDir,
      env: { ...process.env, ATELIER_DATA: dataRoot, ATELIER_PROJECT_DIR: projectDir },
    });
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return `EXIT:${err.status}\n${err.stderr ?? ''}${err.stdout ?? ''}`;
  }
};

const fresh = () => ({
  data: mkdtempSync(join(tmpdir(), 'atelier-pset-data-')),
  proj: mkdtempSync(join(tmpdir(), 'atelier-pset-proj-')),
});

const PROMPT = 'lead with the action, and never end with an offer of more help';
const RULE_A: Rule = { statement: 'Lead with the action.', kind: 'GENERATIVE', appliesWhen: 'GENERAL',
  faithful: true, sourceSpan: 'lead with the action' };
const RULE_B: Rule = { statement: 'Use exactly three bullets.', kind: 'GENERATIVE', appliesWhen: 'GENERAL',
  faithful: true, sourceSpan: 'lead with the action' };

describe('POLARITY 1: --yes ratifies the persisted preview, with zero further model calls', () => {
  it('the backend is switched between preview and acceptance, and the switch cannot matter', async () => {
    const { data, proj } = fresh();
    await setPayload({ rules: [RULE_A], workType: 'writing' });
    const preview = run(data, proj, 'skill', PROMPT);
    expect(preview).toContain('Lead with the action.');
    expect(preview).toContain('Nothing has been compiled');

    await setPayload({ rules: [RULE_B], workType: 'writing' });   // a re-roll would now produce B
    const before = await requestCount();
    const accepted = run(data, proj, 'skill', PROMPT, '--yes', '--name', 'focus');
    expect(await requestCount(), '--yes made a model call — the person approved bytes the system re-rolled').toBe(before);
    expect(accepted).toContain('using the proposal you were already shown');
    expect(accepted).toContain('Your skill is ready');

    const md = readFileSync(join(proj, '.claude', 'skills', 'focus', 'SKILL.md'), 'utf8');
    expect(md).toContain('Lead with the action.');
    expect(md).not.toContain('three bullets');
  });

  it('a DIFFERENT prompt invalidates the set and does call the model — the zero-call test cannot pass vacuously', async () => {
    const { data, proj } = fresh();
    await setPayload({ rules: [RULE_A], workType: 'writing' });
    run(data, proj, 'skill', PROMPT);
    const before = await requestCount();
    run(data, proj, 'skill', 'a different sentence about brevity');
    expect(await requestCount()).toBe(before + 1);
  });
});

describe('POLARITY 2: an invented rule marked faithful never becomes the person\'s authorship', () => {
  it('fabricated span + faithful:true lands as MY READING, ratified-shown, never instructing', async () => {
    const { data, proj } = fresh();
    const invented: Rule = { statement: 'Never use more than three bullets.', kind: 'GENERATIVE',
      appliesWhen: 'GENERAL', faithful: true, sourceSpan: 'never use more than three bullets' };
    await setPayload({ rules: [RULE_A, invented], workType: 'writing' });

    const preview = run(data, proj, 'skill', PROMPT);
    expect(preview).toContain('MY READING');

    const accepted = run(data, proj, 'skill', PROMPT, '--yes', '--name', 'guard');
    // the compiler-computed summary: the grounded rule instructs, the invented one is shown
    expect(accepted).toMatch(/x1 instructs/);
    expect(accepted).toMatch(/x2 shown/);

    const md = readFileSync(join(proj, '.claude', 'skills', 'guard', 'SKILL.md'), 'utf8');
    const doStart = md.indexOf('## What to do');
    const doSection = md.slice(doStart, md.indexOf('\n## ', doStart + 1));
    expect(doSection).toContain('Lead with the action.');
    expect(doSection, 'an invented rule reached the instructions').not.toContain('three bullets');

    // and the standard records the difference: authored vs ratified
    const runsDir = join(data, 'runs');
    const pending = JSON.parse(readFileSync(join(runsDir, readdirSync(runsDir)[0], 'pending-standard.json'), 'utf8')) as
      { requirements: { statement: string; authority: string }[] };
    const byStatement = Object.fromEntries(pending.requirements.map((r) => [r.statement, r.authority]));
    expect(byStatement['Lead with the action.']).toBe('EXPERT_AUTHORED');
    expect(byStatement['Never use more than three bullets.']).toBe('EXPERT_RATIFIED');
  });

  it('the person\'s --work-type flag beats the model\'s guess', async () => {
    const { data, proj } = fresh();
    await setPayload({ rules: [RULE_A], workType: 'poetry' });
    const out = run(data, proj, 'skill', PROMPT, '--work-type', 'code review');
    expect(out).toContain('for code review');
    expect(out).not.toContain('for poetry');
  });
});

describe('the grounding rule itself', () => {
  const g = (statement: string, sourceSpan: string, userText: string, appliesWhen = 'GENERAL') =>
    groundedInUserText({ statement, appliesWhen, sourceSpan }, userText);

  it('the canonical laundering case: "keep answers concise" cannot ground a bullet-count rule', () => {
    expect(g('Never use more than three bullets.', 'keep answers concise', 'keep answers concise').grounded).toBe(false);
  });

  it('a restatement of the person\'s own words grounds', () => {
    expect(g('Lead with the action.', 'lead with the action', PROMPT).grounded).toBe(true);
    expect(g('Never end with an offer of more help.', 'never end with an offer of more help', PROMPT).grounded).toBe(true);
  });

  it('a span the person never wrote fails, whatever the statement', () => {
    const v = g('Lead with the action.', 'always lead with the action first', PROMPT);
    expect(v.grounded).toBe(false);
    expect(v.why).toBe('SPAN_NOT_IN_TEXT');
  });

  it('numbers must appear verbatim', () => {
    const text = 'cap lists at 5 items';
    expect(g('Cap lists at 5 items.', 'cap lists at 5 items', text).grounded).toBe(true);
    expect(g('Cap lists at 3 items.', 'cap lists at 5 items', text).why).toBe('NUMBER_NOT_IN_SPAN');
  });

  it('a condition is normative content too: an invented appliesWhen fails grounding', () => {
    const text = 'number the steps when there are steps';
    expect(g('Number the steps.', 'number the steps when there are steps', text, 'there are steps').grounded).toBe(true);
    expect(g('Number the steps.', 'number the steps', 'number the steps', 'the reader is an executive').grounded).toBe(false);
  });

  it('light inflection folds: "number the steps" grounds "numbering steps"', () => {
    expect(g('Numbering steps.', 'number the steps', 'number the steps').grounded).toBe(true);
  });
});
