// tests/atelier-verify-hook.test.ts — VERIFY AS A HOST'S HOOK, AND THE ONE RECORD HEAD EVERY DOOR PRINTS.
//
// `atelier verify --skill <name> --hook` reads Claude Code's hook JSON on stdin and answers with the exit code a host
// acts on: 2 (block, reasons on stderr) only where something REQUIRED was seen to fail; 0 otherwise, including when the
// event carries nothing to check, because a guard's own failure never blocks the person. And `verify --json` opens with
// the same head `run --json` does (core/eval/certificate.ts): schema, state, standard, skill version, certificate, record.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { RECORD_SCHEMA } from '../core/eval/certificate.js';
import { textFromTranscript } from '../cli/commands/verify.js';

const CLI = resolve('dist/cli/atelier.mjs');
const PIECES = [
  'The team shipped the fix on Monday, and the panel held. Nobody asked for more.\n\nThe plan was simple: ship, watch, write it down.',
  'A short note on the release. We watched the queue drain and the panel stay green.\n\nThen we wrote it down, as always.',
  'The outage lasted an hour. The panel went red, the queue filled, and we waited.\n\nWriting it down was the easy part.',
];
// a text that breaks the skill's required tell rule: em dashes where the author writes none
const BAD = 'The release — the one we shipped — went out on Monday — late — and the panel — for once — held.\n';
const GOOD = 'The release went out on Monday, late, and the panel held. We wrote it down.\n';

describe('verify --hook and the record head (through the binary)', () => {
  let root = ''; let proj = '';
  const run = (stdin: string | null, ...args: string[]): { out: string; err: string; code: number } => {
    const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: join(root, 'data'), ATELIER_PROJECT_DIR: proj };
    delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;
    const errFile = join(root, 'err.txt'); const inFile = join(root, 'in.json');
    if (stdin !== null) writeFileSync(inFile, stdin);
    try {
      const out = execFileSync('sh', ['-c', `node "${CLI}" ${args.map((x) => `'${x}'`).join(' ')} ${stdin === null ? '' : `<"${inFile}"`} 2>"${errFile}"`], { encoding: 'utf8', cwd: proj, env });
      return { out, err: execFileSync('cat', [errFile], { encoding: 'utf8' }), code: 0 };
    } catch (e) {
      const x = e as { status?: number; stdout?: string };
      return { out: x.stdout ?? '', err: execFileSync('cat', [errFile], { encoding: 'utf8' }), code: x.status ?? 1 };
    }
  };
  beforeAll(() => {
    if (!existsSync(CLI)) throw new Error(`${CLI} is missing: run \`npm run build\` first.`);
    root = mkdtempSync(join(tmpdir(), 'atelier-verify-hook-')); proj = join(root, 'proj');
    mkdirSync(proj); mkdirSync(join(proj, 'posts'));
    PIECES.forEach((p, i) => { writeFileSync(join(proj, 'posts', `p${i + 1}.md`), p); });
    expect(run(null, 'new', 'posts', '--no-model', '--name', 'posts').code).toBe(0);
    writeFileSync(join(proj, 'bad.md'), BAD); writeFileSync(join(proj, 'good.md'), GOOD);
  }, 120_000);
  afterAll(() => { if (root) rmSync(root, { recursive: true, force: true }); });

  it('a Write event whose content breaks a required rule: exit 2, the rules on stderr, nothing on stdout', () => {
    const r = run(JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: join(proj, 'x.md'), content: BAD } }), 'verify', '--skill', 'posts', '--hook');
    expect(r.code, r.err).toBe(2);
    expect(r.err).toMatch(/breaks \d+ required rule\(s\) of the "posts" standard/);
    expect(r.out.trim()).toBe('');
  });
  it('an Edit event is checked by the file at its path; a clean file exits 0', () => {
    const r = run(JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: join(proj, 'good.md') } }), 'verify', '--skill', 'posts', '--hook');
    expect(r.code, r.err).toBe(0);
    const bad = run(JSON.stringify({ tool_input: { file_path: join(proj, 'bad.md') } }), 'verify', '--skill', 'posts', '--hook');
    expect(bad.code).toBe(2);
  });
  it('a Stop event is checked by the last assistant message of the transcript', () => {
    const t = join(proj, 'transcript.jsonl');
    writeFileSync(t, [JSON.stringify({ type: 'user', message: { content: 'write it' } }), JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: BAD }] } })].join('\n'));
    expect(run(JSON.stringify({ hook_event_name: 'Stop', transcript_path: t, stop_hook_active: false }), 'verify', '--skill', 'posts', '--hook').code).toBe(2);
    writeFileSync(t, JSON.stringify({ type: 'assistant', message: { content: GOOD } }));
    expect(run(JSON.stringify({ hook_event_name: 'Stop', transcript_path: t }), 'verify', '--skill', 'posts', '--hook').code).toBe(0);
  });
  it('an event with nothing to check exits 0 and says so; a guard that cannot check at all exits 2: never passed silently', () => {
    expect(run(JSON.stringify({ hook_event_name: 'Stop', stop_hook_active: false }), 'verify', '--skill', 'posts', '--hook')).toMatchObject({ code: 0, err: expect.stringContaining('nothing to check in this hook event') as string });
    expect(run('not json', 'verify', '--skill', 'posts', '--hook')).toMatchObject({ code: 2, err: expect.stringContaining('not JSON') as string });
    expect(run(JSON.stringify({ tool_input: { content: GOOD } }), 'verify', '--skill', 'nope', '--hook')).toMatchObject({ code: 2, err: expect.stringContaining('no built skill') as string });
    expect(run(null, 'verify', '--skill', 'nope', 'good.md').code).toBe(2);
  });
  it('a tool event on a source-code file is not checked by a prose skill: exit 0 and a one-line note naming the file', () => {
    // the content would break the dash rule in a prose file; in a code file it is a comment, and the skill has nothing to say about code
    const code = `// the limiter — see the design note\nexport const limit = 3;\n`;
    const r = run(JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: join(proj, 'src', 'limiter.ts'), content: code } }), 'verify', '--skill', 'posts', '--hook');
    expect(r.code, r.err).toBe(0);
    expect(r.err.trim()).toBe(`atelier: nothing to check: ${join(proj, 'src', 'limiter.ts')} is code`);
    // an Edit by path, the file on disk, the same
    mkdirSync(join(proj, 'src'), { recursive: true }); writeFileSync(join(proj, 'src', 'limiter.py'), `# the limiter — see the note\nLIMIT = 3\n`);
    expect(run(JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: join(proj, 'src', 'limiter.py') } }), 'verify', '--skill', 'posts', '--hook').code).toBe(0);
    // prose keeps the contract: a markdown file, and a file with no extension, are checked and block
    expect(run(JSON.stringify({ tool_input: { file_path: join(proj, 'notes.md'), content: BAD } }), 'verify', '--skill', 'posts', '--hook').code).toBe(2);
    expect(run(JSON.stringify({ tool_input: { file_path: join(proj, 'NOTES'), content: BAD } }), 'verify', '--skill', 'posts', '--hook').code).toBe(2);
  });
  it('the block message prints the spans plain verify prints, under each rule', () => {
    const r = run(JSON.stringify({ tool_input: { file_path: join(proj, 'x.md'), content: BAD } }), 'verify', '--skill', 'posts', '--hook');
    expect(r.code).toBe(2);
    // the same `› "…"  (why)` lines as `atelier verify` on the file, for the rules that blocked: BAD carries six em dashes,
    // so the dash rule shows five and counts the sixth
    const spans = (s: string): string[] => s.split('\n').filter((l) => l.trimStart().startsWith('› ')).map((l) => l.trim());
    expect(spans(r.err).filter((l) => l === '› "—"  (an em dash)')).toHaveLength(5);
    expect(spans(r.err)).toContain('› …and 1 more');
    const plain = run(null, 'verify', '--skill', 'posts', 'bad.md');
    for (const l of spans(r.err)) expect(spans(plain.out)).toContain(l);
  });
  it('a Stop event the stop hook already ran on (stop_hook_active) exits 0 with a note: the host must not loop', () => {
    const t = join(proj, 'transcript-active.jsonl');
    writeFileSync(t, JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: BAD }] } }));
    const r = run(JSON.stringify({ hook_event_name: 'Stop', transcript_path: t, stop_hook_active: true }), 'verify', '--skill', 'posts', '--hook');
    expect(r.code, r.err).toBe(0);
    expect(r.err).toContain('stop_hook_active');
    // the same transcript with the flag off blocks: the pass above is the flag's, not the text's
    expect(run(JSON.stringify({ hook_event_name: 'Stop', transcript_path: t, stop_hook_active: false }), 'verify', '--skill', 'posts', '--hook').code).toBe(2);
  });
  it('a Stop event is checked by the whole last assistant turn: one transcript line per content block, parsed, not matched', () => {
    const t = join(proj, 'transcript-blocks.jsonl');
    // the host writes one line per block: the text, then a thinking-only line last; the turn's text is what is checked
    writeFileSync(t, [
      JSON.stringify({ type: 'user', message: { content: 'write it' } }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'An earlier answer, clean.' }] } }),
      JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', content: 'ok' }] } }),
      '{"type": "assistant", "message": {"content": [{"type": "text", "text": ' + JSON.stringify(BAD) + '}]}}',
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'thinking', thinking: 'done' }] } }),
      '',
    ].join('\n'));
    const r = run(JSON.stringify({ hook_event_name: 'Stop', transcript_path: t, stop_hook_active: false }), 'verify', '--skill', 'posts', '--hook');
    expect(r.code, r.err).toBe(2);
    expect(r.err).not.toContain('nothing to check');
    // and only the last turn: the text before the person's last message is not what the Stop is about
    writeFileSync(t, [
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: BAD }] } }),
      JSON.stringify({ type: 'user', message: { content: 'and now the clean one' } }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: GOOD }] } }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: {} }] } }),
    ].join('\n'));
    expect(run(JSON.stringify({ hook_event_name: 'Stop', transcript_path: t }), 'verify', '--skill', 'posts', '--hook').code).toBe(0);
  });
  it('a turn that called a tool is checked whole: the text before the call, the tool result inside the turn, host lines skipped, back to the person\'s last message', () => {
    const t = join(proj, 'transcript-tool.jsonl');
    const mixed = (a: string, b: string): string => [
      JSON.stringify({ type: 'user', message: { content: 'write it' } }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'An earlier answer, before the person spoke again.' }] } }),
      JSON.stringify({ type: 'user', message: { content: [{ type: 'text', text: 'now this' }] } }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: a }] } }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: {} }] } }),
      JSON.stringify({ type: 'progress', data: {} }),
      JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', content: 'ok' }] } }),
      JSON.stringify({ type: 'system', content: 'a host note' }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: b }] } }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'thinking', thinking: 'done' }] } }),
    ].join('\n');
    writeFileSync(t, mixed('A', 'B'));
    expect(textFromTranscript(t)).toBe('A\nB');
    // through the hook: the prose before the tool call is what breaks the rule, and it is checked
    writeFileSync(t, mixed(BAD, GOOD));
    expect(run(JSON.stringify({ hook_event_name: 'Stop', transcript_path: t, stop_hook_active: false }), 'verify', '--skill', 'posts', '--hook').code).toBe(2);
  });
  it('--json opens with the one record head: schema, state, standard, skill version, certificate, record', () => {
    const r = run(null, 'verify', '--skill', 'posts', 'bad.md', '--json');
    expect(r.code).toBe(1);
    const j = JSON.parse(r.out) as Record<string, unknown> & { certificate: { checks: { total: number }; readers: { claims: { gate: string; qualified: boolean } | null }; errorBound: null }; record: { state: string } };
    expect(Object.keys(j).slice(0, 6)).toEqual(['schema', 'state', 'standardVersionHash', 'skillVersion', 'certificate', 'record']);
    expect(j.schema).toBe(RECORD_SCHEMA);
    expect(j.state).toBe('BLOCKED'); expect(j.record.state).toBe('BLOCKED');
    expect(j.certificate.checks.total).toBeGreaterThan(0);
    // with no key the claim check is the pattern check, and the certificate says so rather than imply a measured reader
    expect(j.certificate.readers.claims).toMatchObject({ gate: 'pattern', qualified: false });
    expect(j.certificate.errorBound).toBeNull();
  });
});
