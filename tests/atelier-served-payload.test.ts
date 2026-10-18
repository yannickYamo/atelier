// WHAT THE WRITER IS SERVED, READ OFF THE BYTES. Every earlier round tested what the compiler held; none asserted what
// reached the model, and the owner's method reached it in part (51 of 127 sentences of one real method, no heading):
// the step reader decided what the writer was TOLD, when it should only decide what is CHECKED. These tests read the
// installed SKILL.md and its files, which a host serves as they are and `invoke` composes in one place (cli/served.ts).
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { derivedFromKnown, proseOf } from '../core/loop/derived.js';
import { markUnsupported } from '../cli/commands/invoke.js';
import { describeFrom } from '../cli/commands/method.js';
import { composeServed } from '../cli/served.js';

const CLI = resolve('dist/cli/atelier.mjs');

// A method shaped as real ones are: front matter with a description, a premise, headed rules written as plain prose
// (no must/never), worked Bad/Good lines, exceptions under a lead-in, and a check before sending that lists what to delete.
const METHOD = `---
name: plain-answers
description: 'Answer a support question so the reader can act at once: the action first, numbered steps, one next action.'
---

# Plain answers

The reader is busy and reads the first line only. Everything below serves that.

## Rules

### 1. Lead with the action

The first line is something the reader can do. Not context. Not a plan.

Bad: "There are a few things that could cause this."
Good: "Restart the worker with \`make restart\`."

### 2. Number the steps

When there is more than one step, write a numbered list. One action per line.

### 3. End with one next action

Close on the one thing to do next. If the task is finished, stop.

## When to break the rules

Override the defaults when:

- the reader asks for a full explanation;
- the reader says thanks and nothing is left to do.

## Before sending

Before sending, delete:

1. The first sentence if it announces what you are about to do.
2. Any closing pleasantry.

If nothing is left to delete, send.
`;

const PIECES: readonly { request: string; body: string }[] = [
  { request: 'My PDF import fails with "file cannot be read". What do I do?', body: 'Run `pip install --upgrade pdfplumber` and import the file again.\n\nThe old release cannot open encrypted statements; version 0.11 can.\n\n1. Upgrade the package.\n2. Import the statement again.\n3. Check the row count against the statement.' },
  { request: 'Why does /users/:id/invites return 404?', body: 'Delete line 12 of `config/routes.rb`, the second `resources :users`.\n\nRails matched the first declaration and never reached the nested one. With the duplicate gone the nested route wins, and the invites page loads again for every user.' },
  { request: 'The nightly report came out empty again. Why?', body: 'Set `TZ=UTC` in the cron job environment.\n\nThe report ran at 23:00 server time, which is already tomorrow in UTC, so it read an empty day. Pinning the timezone makes the window match the data, and the next run will fill.' },
  { request: 'Is the CSV export fixed? Can I close the ticket?', body: 'Close the ticket. The export works now.\n\nThe export was cutting rows at a page boundary because the query kept the old page size. It now streams every row, and the long export you ran finished in seconds without a gap.' },
];

const seed = (n: number, withMethod: boolean, key = false) => {
  const data = mkdtempSync(join(tmpdir(), 'atelier-sp-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-sp-proj-'));
  mkdirSync(join(proj, 'work'));
  if (withMethod) writeFileSync(join(proj, 'how.md'), METHOD);
  PIECES.slice(0, n).forEach((p, i) => { writeFileSync(join(proj, 'work', `a${i + 1}.md`), `---\nrequest: ${JSON.stringify(p.request)}\n---\n${p.body}\n`); });
  const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj };
  delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;
  // A key that reaches nothing: whatever the build does with a model set up, no call can succeed or be paid for.
  if (key) { env.ANTHROPIC_API_KEY = 'sk-test-not-a-key'; env.ANTHROPIC_BASE_URL = 'http://127.0.0.1:9'; }
  const run = (...a: string[]): { code: number; out: string } => {
    try { return { code: 0, out: execFileSync('node', [CLI, ...a], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000 }) }; }
    catch (e) { const x = e as { status: number; stdout: string; stderr: string }; return { code: x.status, out: x.stdout + x.stderr }; }
  };
  const skill = (name: string): Record<string, string> => {
    const dir = join(proj, '.claude', 'skills', name);
    const files: Record<string, string> = { 'SKILL.md': readFileSync(join(dir, 'SKILL.md'), 'utf8') };
    if (existsSync(join(dir, 'examples'))) for (const f of readdirSync(join(dir, 'examples'))) files[`examples/${f}`] = readFileSync(join(dir, 'examples', f), 'utf8');
    return files;
  };
  return { proj, run, skill };
};

/** The method's lines that carry words: headings, sentences, list items, Bad/Good lines. */
const methodLines = (note: string): string[] => note.replace(/^---[\s\S]*?\n---\n/, '').split('\n').map((l) => l.trim()).filter(Boolean)
  .map((l) => l.replace(/^#+\s*/, '').replace(/^(?:[-*]|\d+[.)])\s+/, ''));

describe('the owner\'s method reaches the writer whole', () => {
  it('every line of the method, its headings and worked examples included, is served in order, in the native skill and in what a run composes', () => {
    const { run, skill } = seed(4, true);
    const r = run('new', 'work', '--method', 'how.md', '--name', 'plain');
    expect(r.code, r.out).toBe(0);
    const files = skill('plain');
    for (const text of [files['SKILL.md'], composeServed(files, '').servedText]) {
      let from = 0;
      for (const line of methodLines(METHOD)) {
        const at = text.indexOf(line, from);
        expect(at, `not served, or out of order: "${line}"`).toBeGreaterThan(-1);
        from = at;
      }
    }
  }, 120_000);

  it('a delete-list keeps its lead-in, and a stated step is said once', () => {
    const { run, skill } = seed(4, true);
    expect(run('new', 'work', '--method', 'how.md', '--name', 'plain').code).toBe(0);
    const md = skill('plain')['SKILL.md'];
    // the items to delete sit under "Before sending, delete:", never restated as things to do
    expect(md).toMatch(/Before sending, delete:\n\n1\. The first sentence if it announces what you are about to do\./);
    expect(md.split('The first sentence if it announces').length - 1).toBe(1);
    expect(md.split('Close on the one thing to do next.').length - 1).toBe(1);
    // the owner's steps are not told to be read as judgement; what was learned from the pieces is
    expect(md).toContain('## My method');
    expect(md).not.toContain('Apply the standard below as judgment, not as a checklist');
  }, 120_000);

  it('the host is told when to load it in the owner\'s words', () => {
    const { run, skill } = seed(4, true);
    expect(run('new', 'work', '--method', 'how.md', '--name', 'plain').code).toBe(0);
    // quoted: it holds ": ", which a plain YAML value cannot
    expect(skill('plain')['SKILL.md']).toMatch(/^---\nname: plain\ndescription: "Answer a support question so the reader can act at once: the action first/);
  }, 120_000);
});

describe('each finished example is served once, with the request it answered', () => {
  it('no piece twice, and every request beside its own answer', () => {
    const { run, skill } = seed(4, true);
    expect(run('new', 'work', '--method', 'how.md', '--name', 'plain').code).toBe(0);
    const files = skill('plain');
    const examples = Object.entries(files).filter(([f]) => /^examples\/(?:exemplar|voice-\d+)\.md$/.test(f));
    for (const p of PIECES) {
      const firstLine = p.body.split('\n')[0];
      const holding = examples.filter(([, t]) => t.includes(firstLine));
      expect(holding.length, `served ${holding.length} times: ${firstLine}`).toBe(1);
      expect(holding[0][1]).toContain(`The request it answered: ${p.request}`);
    }
  }, 120_000);

  it('a habit only counted off the pieces is checked, not handed to the writer as a card', () => {
    const { run, skill } = seed(4, true);
    expect(run('new', 'work', '--method', 'how.md', '--name', 'plain').code).toBe(0);
    for (const [f, t] of Object.entries(skill('plain'))) {
      if (!/^examples\/x\d+\.md$/.test(f)) continue;
      expect(t, `${f} is a counted band served as a card`).not.toMatch(/a new piece stays between|none of my pieces has one/);
    }
  }, 120_000);
});

describe('two or three examples build a skill, with a model set up or not', () => {
  for (const n of [2, 3]) {
    it(`${n} examples and a key: built, never refused, and every example served`, () => {
      const { run, skill } = seed(n, false, true);
      const r = run('new', 'work', 'answer support questions', '--name', 'few');
      expect(r.code, r.out).toBe(0);
      expect(r.out).toContain(`With ${n} example(s), rules read by a model could not be checked`);
      const served = Object.values(skill('few')).join('\n');
      for (const p of PIECES.slice(0, n)) expect(served, `not served: ${p.request}`).toContain(p.body.split('\n')[0]);
      expect(skill('few')['SKILL.md']).toMatch(/^---\nname: few\ndescription: Use when asked to answer support questions\./);
    }, 120_000);
  }
});

describe('a figure is worked only from what was supplied in prose', () => {
  const diff = 'diff --git a/db.py b/db.py\nindex 3a1..9b2 100644\n--- a/db.py\n+++ b/db.py\n@@ -12,7 +12,9 @@ def purge():\n-    PAGE = 1000\n+    PAGE = 10000\n+    for i in range(23):\n         run()\n';
  it('numbers in a diff count as written, never as operands', () => {
    expect(derivedFromKnown('This leaves 2.3M rows orphaned.', diff)).toBe(false);
    expect(derivedFromKnown('I ran the tests and 3 of 12 fail.', diff)).toBe(false);
    expect(derivedFromKnown('The page size goes from 1000 to 10000.', diff)).toBe(true);
    expect(proseOf(`Notes: 40 rows a day.\n\n${diff}`)).not.toMatch(/PAGE|@@/);
  });
  it('a fenced block (the skill\'s own rule text) is no operand either', () => {
    expect(derivedFromKnown('It leaves 2.3M rows.', 'Our notes.\n\n```\nKeep 23 items and 10 lines.\n```')).toBe(false);
  });
});

describe('a claim the material does not show is marked where it stands', () => {
  it('in place, by its words, even when its code was blanked for the reader', () => {
    const text = '1. `a.py:8`: `flush()` is never awaited, so the last line is lost. I ran the tests and 3 of 12 fail.\n2. Fine.';
    const out = markUnsupported(text, ['I ran the tests and 3 of 12 fail.', ':           is never awaited, so the last line is lost.']);
    expect(out).toContain('3 of 12 fail. [needs verification: not shown in what you supplied]');
    expect(out).toContain('the last line is lost. [needs verification: not shown in what you supplied]');
    expect(out).not.toContain('Not found in what you supplied');
  });
  it('one it cannot find is listed after the text, as before', () => {
    expect(markUnsupported('Plain text.', ['A sentence that is not there.'])).toMatch(/\n---\nNot found in what you supplied \(check before you use this\):\n- "A sentence that is not there\."/);
  });
});

describe('the description a host reads', () => {
  it('the owner\'s own, else the purpose and the method\'s first line', () => {
    expect(describeFrom(METHOD, null, 'x')).toBe('Answer a support question so the reader can act at once: the action first, numbered steps, one next action.');
    expect(describeFrom('# Review\n\nWe review for risk before style.\n\n1. Open with the verdict.', 'review pull requests', 'r')).toBe('Use when asked to review pull requests. We review for risk before style.');
  });
});

describe('what an independent review found in the first round', () => {
  it('a rebuild serves the same bytes: the exemplar keeps its request, and a note changed only in its front matter is the same package', () => {
    const { proj, run, skill } = seed(4, true);
    expect(run('new', 'work', '--method', 'how.md', '--name', 'plain').code).toBe(0);
    const first = skill('plain');
    expect(first['examples/exemplar.md']).toContain('The request it answered:');
    writeFileSync(join(proj, 'how.md'), METHOD.replace('name: plain-answers', 'name: plain-answers\ntitle: Plain answers') + '\n\n');
    const again = run('new', 'work', '--method', 'how.md', '--name', 'plain', '--yes');
    expect(again.code, again.out).toBe(0);
    expect(again.out).not.toMatch(/already exists with different content/);
    const rebuilt = run('build', '--name', 'plain');
    expect(rebuilt.code, rebuilt.out).toBe(0);
    expect(skill('plain')).toEqual(first);
  }, 180_000);

  it('marking is linear in the text and never lands on a word inside another word', () => {
    const line = `${'the alpha beta gamma delta '.repeat(80)}end.`;
    const t0 = Date.now();
    expect(markUnsupported(line, ['the  alpha  beta  gamma  zeta'])).toContain('Not found in what you supplied');
    expect(Date.now() - t0).toBeLessThan(500);
    const out = markUnsupported('The string is wrong. The `x` in `y` is wrong.', ['The  in  is wrong.']);
    expect(out).toBe('The string is wrong. The `x` in `y` is wrong. [needs verification: not shown in what you supplied]');
    // a full stop inside code is no sentence end
    expect(markUnsupported('2. `a.py:9`: Written before `meta.json`, so 2.3M rows are lost.', [': Written before            , so 2.3M rows are lost.']))
      .toBe('2. `a.py:9`: Written before `meta.json`, so 2.3M rows are lost. [needs verification: not shown in what you supplied]');
  });

  it('a block-scalar description is read whole, and one holding ": " is written as YAML that parses', async () => {
    expect(describeFrom('---\ndescription: >\n  Answer briefly,\n  action first.\n---\n# x\n\nBody.', null, 'x')).toBe('Answer briefly, action first.');
    const { yamlScalar } = await import('../renderers/agent-skill/render.js');
    expect(yamlScalar('Use when asked to review. Note: risk first.')).toBe('"Use when asked to review. Note: risk first."');
    expect(yamlScalar('Use when asked to review.')).toBe('Use when asked to review.');
  });

  it('prose after a diff is prose again, a "- " list item included', () => {
    const diff = 'diff --git a/a.py b/a.py\n--- a/a.py\n+++ b/a.py\n@@ -1,2 +1,2 @@\n-x = 1\n+x = 2\n y = 3\n';
    const prose = proseOf(`${diff}\n- The orders table holds 40 rows per user and 1000 users.`);
    expect(prose).toContain('40 rows per user');
    expect(prose).not.toContain('x = 2');
    expect(derivedFromKnown('That is 40000 rows.', `${diff}\n- The orders table holds 40 rows per user and 1000 users.`)).toBe(true);
  });
});
