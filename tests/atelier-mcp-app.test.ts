// tests/atelier-mcp-app.test.ts — ATELIER AS AN APP, REACHED THROUGH MCP: BUILD, RUN, REPORT, RATE, WITH THE PERSON APPROVING.
//
// The MCP server's building tools run the same commands a person runs at the terminal, in a child process with the
// server's environment. The model is the scripted backend, named through the environment (ATELIER_PROVIDER,
// ATELIER_BASE_URL, ATELIER_MODEL), as an app's deployment would name its own.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CLI = resolve('dist/cli/atelier.mjs');
const NOTE = 'How we review a change\n\n1. Open with a Summary section.\n2. Then a Must fix section.\n3. End with a Verdict section.\n4. Weigh the risk of the change before the style of it.\n';
const piece = (verdict: string): string => `---\nrequest: Review this change.\n---\n## Summary\nThe change touches the runner and keeps its tests. It is small and the tests pass on it.\n\n## Must fix\nNone.\n\n## Verdict\n${verdict}\n`;
const REVIEW = '## Summary\nIt adds a retry and keeps its tests.\n\n## Must fix\nNone.\n\n## Verdict\nApprove\n';

interface Reply { result: { content: { text: string }[]; isError?: boolean; tools?: { name: string }[] } }

describe.skipIf(!existsSync(CLI))('the MCP server as the front door', () => {
  let backend: ChildProcess; let port = 0;
  const data = mkdtempSync(join(tmpdir(), 'atelier-mcpapp-data-')); const proj = mkdtempSync(join(tmpdir(), 'atelier-mcpapp-proj-'));
  const env = (): NodeJS.ProcessEnv => {
    const e: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: data, ATELIER_PROJECT_DIR: proj, ATELIER_PROVIDER: 'openai-compatible', ATELIER_BASE_URL: `http://127.0.0.1:${port}`, ATELIER_MODEL: 'scripted' };
    delete e.ANTHROPIC_API_KEY; delete e.ANTHROPIC_AUTH_TOKEN;
    return e;
  };
  const mcp = (calls: Record<string, unknown>[]): Reply[] => {
    const input = calls.map((params, i) => JSON.stringify({ jsonrpc: '2.0', id: i + 1, method: params.method ?? 'tools/call', params: params.method ? {} : params })).join('\n');
    return execFileSync('node', [CLI, 'mcp'], { encoding: 'utf8', cwd: proj, env: env(), input, maxBuffer: 64 * 1024 * 1024 }).trim().split('\n').map((l) => JSON.parse(l) as Reply);
  };
  beforeAll(async () => {
    backend = spawn(process.execPath, [resolve('tests/fixtures/scripted-backend.mjs')], { stdio: ['ignore', 'pipe', 'inherit'] });
    port = await new Promise<number>((ok, bad) => {
      backend.stdout!.on('data', (d: Buffer) => { const m = /PORT (\d+)/.exec(d.toString()); if (m) ok(Number(m[1])); });
      backend.on('exit', () => { bad(new Error('scripted backend exited before listening')); });
    });
    await fetch(`http://127.0.0.1:${port}/__set`, { method: 'POST', body: JSON.stringify({ byTool: { emit_piece: { piece: REVIEW } } }) });
    mkdirSync(join(proj, 'examples'));
    writeFileSync(join(proj, 'method.md'), NOTE);
    ['Approve', 'Request changes', 'Comment'].forEach((v, i) => { writeFileSync(join(proj, 'examples', `e${i + 1}.md`), piece(v)); });
  }, 60_000);
  afterAll(() => { backend?.kill(); });

  it('lists the building tools beside the reading tools', () => {
    const [r] = mcp([{ method: 'tools/list' }]);
    expect(r.result.tools!.map((t) => t.name).sort()).toEqual(['atelier_fix', 'atelier_list_skills', 'atelier_new', 'atelier_rate', 'atelier_report', 'atelier_rules', 'atelier_run', 'atelier_skill_report', 'atelier_verify']);
  });
  it('atelier_new shows the screen and builds nothing until the person approves; then it builds, and atelier_run returns the whole record', () => {
    const [shown] = mcp([{ name: 'atelier_new', arguments: { work: 'examples', method: 'method.md', name: 'review' } }]);
    expect(shown.result.isError).toBe(false);
    expect(shown.result.content[0].text).toMatch(/Nothing (has been|was) built/);
    expect(shown.result.content[0].text).toContain('Checked on every run');
    expect(existsSync(join(data, 'skills', 'review'))).toBe(false);
    const [built] = mcp([{ name: 'atelier_new', arguments: { work: 'examples', method: 'method.md', name: 'review', approve: true } }]);
    expect(built.result.isError, built.result.content[0].text).toBe(false);
    expect(built.result.content[0].text).toContain('Your skill "review" is ready.');
    expect(existsSync(join(data, 'skills', 'review'))).toBe(true);
    const [ran] = mcp([{ name: 'atelier_run', arguments: { skill: 'review', task: 'Review the retry change.', material: 'The diff adds a retry loop around the upload call.' } }]);
    expect(ran.result.isError, ran.result.content[0].text).toBe(false);
    const text = ran.result.content[0].text;
    const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as { output: string; invocationId: string; eval: unknown; report: string[] };
    expect(json.output).toContain('## Verdict');
    expect(typeof json.invocationId).toBe('string');
    expect(json.eval).toBeDefined();
    // where the work stands is in the evaluation the record carries
    expect(JSON.stringify(json.eval)).toMatch(/VERIFIED|NEEDS_REVIEW|NEEDS REVIEW|BLOCKED|CONFORMANT/);
    const [report, rated, bad] = mcp([
      { name: 'atelier_report', arguments: { run: json.invocationId } },
      { name: 'atelier_rate', arguments: { run: json.invocationId, ship: true, why: 'reads as ours' } },
      { name: 'atelier_rate', arguments: { run: json.invocationId } },
    ]);
    expect(report.result.isError, report.result.content[0].text).toBe(false);
    expect(report.result.content[0].text).toContain(json.invocationId);
    expect(rated.result.isError, rated.result.content[0].text).toBe(false);
    expect(bad.result.isError).toBe(true);
  }, 180_000);
  it('refuses what it cannot run before spending anything', () => {
    const [noWork, badName, noTask] = mcp([
      { name: 'atelier_new', arguments: { work: '' } },
      { name: 'atelier_new', arguments: { work: 'examples', name: 'Not A Name' } },
      { name: 'atelier_run', arguments: { skill: 'review', task: '' } },
    ]);
    expect(noWork.result.isError).toBe(true); expect(badName.result.isError).toBe(true); expect(noTask.result.isError).toBe(true);
  });
});
