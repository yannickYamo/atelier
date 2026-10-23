// tests/atelier-rule-vs-examples.test.ts — A RULE THAT FORBIDS WHAT THE EXAMPLES DO IS SHOWN ONCE, AND KEPT AS WRITTEN.
//
// The defect: an owner stated "never use dashes" while four of their five pieces used a double hyphen for one. The dash
// count saw only the em dash, so the conflict was never shown, and every output was repaired away from the author's own
// habit with nobody asked. Now the dash family counts a typed double hyphen (item 3), and where a rule (stated, amended
// or added) forbids or caps something the examples measurably do, the build says so once, with how often the examples
// do it: "your examples use … in 4 of 5 pieces; your rule bans it; kept as you wrote it". The rule stays the owner's.
//
// Metric (plan round 1, item 5): the conflict shown on a build where a rule bans what the examples do. Expected lines are
// written out by hand from the fixture.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ruleAgainstExamples } from '../core/observers/derive.js';
import type { Measurement } from '../core/state/canonical-state.js';

const PLAIN = 'The ferry leaves the pier at eleven and the crossing is calm on most nights of the year.';
const body = Array.from({ length: 10 }, () => PLAIN).join(' ');
const withDash = `The quay -- which floods each spring -- reopened. ${body}`;
const pieces = [withDash, withDash, withDash, withDash, body];

describe('how often the examples do what a rule forbids', () => {
  it('a ban on dashes against pieces that type them as double hyphens: 4 of 5, kept as written', () => {
    const ban: Measurement = { observer: 'PATTERN_RATE', params: { pattern: ['EM_DASH'], maxPer1000: 0 } };
    expect(ruleAgainstExamples(ban, pieces)).toBe('your examples use em dashes (—) in 4 of 5 pieces; your rule bans it; kept as you wrote it');
  });
  it('a cap the pieces go past is said as a cap', () => {
    const cap: Measurement = { observer: 'PATTERN_RATE', params: { pattern: ['EM_DASH'], maxPer1000: 1 } };
    expect(ruleAgainstExamples(cap, pieces)).toBe('your examples go past it on em dashes (—) in 4 of 5 pieces; your rule caps it; kept as you wrote it');
  });
  it('another check the pieces break is said by count', () => {
    const short: Measurement = { observer: 'SENTENCE_LENGTH', params: { medianMax: 5 } };
    expect(ruleAgainstExamples(short, pieces)).toBe('5 of your 5 examples do not hold it; kept as you wrote it');
  });
  it('nothing is said where the pieces hold the rule, or where there are no pieces to read', () => {
    const ban: Measurement = { observer: 'PATTERN_RATE', params: { pattern: ['SEMICOLON'], maxPer1000: 0 } };
    expect(ruleAgainstExamples(ban, pieces)).toBeNull();
    expect(ruleAgainstExamples({ observer: 'PATTERN_RATE', params: { pattern: ['EM_DASH'], maxPer1000: 0 } }, [])).toBeNull();
  });
});

describe('through the binary: an amended rule against the pieces the skill was built from', () => {
  it('the conflict is said once, with the count, and the rule is minted as written', () => {
    const CLI = resolve('dist/cli/atelier.mjs');
    if (!existsSync(CLI)) throw new Error('build first');
    const root = mkdtempSync(join(tmpdir(), 'atelier-rve-'));
    const dir = join(root, 'pieces'); const proj = join(root, 'proj'); mkdirSync(dir); mkdirSync(proj);
    const long = (dash: boolean, i: number): string => `# Post ${i}\n\n${dash ? 'The quay -- which floods each spring -- reopened. ' : ''}${body} ${body}\n\nAnother paragraph about the harbour ${i}. ${body} ${body}\n`;
    [true, true, true, true, false].forEach((d, i) => { writeFileSync(join(dir, `p${i + 1}.md`), long(d, i + 1)); });
    const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: join(root, 'data'), ATELIER_PROJECT_DIR: proj };
    delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;
    const run = (...a: string[]): string => execFileSync('node', [CLI, ...a], { encoding: 'utf8', cwd: proj, env });
    run('new', dir, 'harbour posts');
    // the dash rule the build counted off the pieces (they type a double hyphen for one)
    const stdDir = join(root, 'data', 'skills', 'proj', 'standards');
    const std = JSON.parse(readFileSync(join(stdDir, readdirSync(stdDir)[0]), 'utf8')) as { requirements: { requirementId: string; measurement?: { params: { pattern?: string[] } } }[] };
    const id = std.requirements.find((r) => r.measurement?.params.pattern?.[0] === 'EM_DASH')?.requirementId ?? '';
    expect(id).not.toBe('');
    const out = run('amend', '--skill', 'proj', '--rule', id, '--measure', 'PATTERN_RATE:pattern=EM_DASH,maxPer1000=0', '--statement', 'Never use a dash.', '--reason', 'my rule');
    expect(out).toContain('Your examples use em dashes (—) in 4 of 5 pieces; your rule bans it; kept as you wrote it.');
    expect(out.match(/your rule bans it/g)).toHaveLength(1);
  });
});
