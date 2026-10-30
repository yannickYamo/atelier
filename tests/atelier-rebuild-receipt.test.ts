// tests/atelier-rebuild-receipt.test.ts — A REBUILD WRITES A RECEIPT, AND STATUS SAYS WHICH COMMAND REBUILT FROM WHICH VERSION.
//
// `atelier status` said "no receipt (built before receipts were kept)" for a skill a person had just rebuilt with
// `fix --add` or `amend`: the rebuild rendered the package again and wrote no receipt. A rebuild runs none of the build's
// reading stages (it carries what the version it derives from was built with: cli/runtime.ts `carriedFrom`), so its
// receipt is that version's, under the new hashes, and it names the command and the version it was rebuilt from.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as store from '../core/state/store.js';

const CLI = resolve('dist/cli/atelier.mjs');
const PIECES = [
  'The team shipped the fix on Monday, and the panel held. Nobody asked for more.\n\nThe plan was simple: ship, watch, write it down.',
  'A short note on the release. We watched the queue drain and the panel stay green.\n\nThen we wrote it down, as always.',
  'The outage lasted an hour. The panel went red, the queue filled, and we waited.\n\nWriting it down was the easy part.',
];

describe('the receipt of a rebuild (through the binary)', () => {
  let root = ''; let proj = '';
  const run = (...args: string[]): { out: string; code: number } => {
    const env: NodeJS.ProcessEnv = { ...process.env, ATELIER_DATA: join(root, 'data'), ATELIER_PROJECT_DIR: proj };
    delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;
    try { return { out: execFileSync('node', [CLI, ...args], { encoding: 'utf8', cwd: proj, env, stdio: ['ignore', 'pipe', 'pipe'] }), code: 0 }; }
    catch (e) { const x = e as { status?: number; stdout?: string; stderr?: string }; return { out: (x.stdout ?? '') + (x.stderr ?? ''), code: x.status ?? 1 }; }
  };
  const L = (): store.StoreLayout => ({ root: join(root, 'data'), skillName: 'posts' });
  beforeAll(() => {
    if (!existsSync(CLI)) throw new Error(`${CLI} is missing: run \`npm run build\` first.`);
    root = mkdtempSync(join(tmpdir(), 'atelier-rebuild-receipt-')); proj = join(root, 'proj');
    mkdirSync(proj); mkdirSync(join(proj, 'posts'));
    PIECES.forEach((p, i) => { writeFileSync(join(proj, 'posts', `p${i + 1}.md`), p); });
    expect(run('new', 'posts', '--no-model', '--name', 'posts').code).toBe(0);
  }, 120_000);
  afterAll(() => { if (root) rmSync(root, { recursive: true, force: true }); });

  it('an amend writes a receipt carried from the version it rebuilt, and status says so', () => {
    const before = store.getActive(L())!;
    const built = store.getReceipt(L(), before)!;
    expect(built).not.toBeNull();
    expect(run('status', '--skill', 'posts').out).toContain(`  build          receipt ${built.receiptHash}; complete`);

    // a level the standard does not hold yet, so the amend mints a new version; the same level again would be the same version
    const held = store.getStandard(L(), store.getSkillVersion(L(), before)!.standardVersionHash)!.latitude?.level;
    const a = run('amend', '--skill', 'posts', '--latitude', held === 'STRICT' ? 'creative' : 'strict', '--reason', 'the owner sets how strictly the work is held');
    expect(a.code, a.out).toBe(0);
    const after = store.getActive(L())!;
    expect(after).not.toBe(before);
    const carried = store.getReceipt(L(), after);
    expect(carried).not.toBeNull();
    // the new version's own hashes, the stages and models of the build it carries, and who rebuilt it from what
    const sv = store.getSkillVersion(L(), after)!;
    expect(carried).toMatchObject({ skillVersionHash: after, standardVersionHash: sv.standardVersionHash, architectureHash: sv.architectureHash, packageHash: sv.materializedHash,
      stages: built.stages, models: built.models, corpusHash: built.corpusHash, methodHash: built.methodHash, rebuilt: { from: before, by: 'amend' } });
    expect(carried!.receiptHash).not.toBe(built.receiptHash);

    const status = run('status', '--skill', 'posts').out;
    expect(status).not.toContain('no receipt');
    expect(status).toContain(`  build          receipt ${carried!.receiptHash}; complete; rebuilt by amend from ${before}`);
  });
  it('a rebuild that mints the same version again keeps that version\'s own receipt', () => {
    const active = store.getActive(L())!;
    const own = store.getReceipt(L(), active)!;
    const level = store.getStandard(L(), store.getSkillVersion(L(), active)!.standardVersionHash)!.latitude!.level.toLowerCase();
    expect(run('amend', '--skill', 'posts', '--latitude', level, '--reason', 'the same level again').code).toBe(0);
    expect(store.getActive(L())).toBe(active);
    expect(store.getReceipt(L(), active)).toEqual(own);
  });
  it('a version with no receipt, minted again by a rebuild, gets none: status says it was built before receipts were kept, never "rebuilt from itself"', () => {
    const active = store.getActive(L())!;
    const receipts = join(root, 'data', 'skills', 'posts', 'receipts');
    expect(readdirSync(receipts)).toContain(`${active}.json`);
    rmSync(join(receipts, `${active}.json`));
    const level = store.getStandard(L(), store.getSkillVersion(L(), active)!.standardVersionHash)!.latitude!.level.toLowerCase();
    expect(run('amend', '--skill', 'posts', '--latitude', level, '--reason', 'the same level again').code).toBe(0);
    expect(store.getActive(L())).toBe(active);
    expect(store.getReceipt(L(), active)).toBeNull();
    const status = run('status', '--skill', 'posts').out;
    expect(status).toContain('  build          no receipt (built before receipts were kept)');
    expect(status).not.toContain('rebuilt by');
  });
});
