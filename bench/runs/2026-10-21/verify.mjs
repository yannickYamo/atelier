// Tests 2 and 3 (recall named vs blocked; no false blocks), on every build of claims and labels: `atelier verify
// --json` on every golden example and every planted defect, with the example's material bound (--with name=file), and
// the domain's check.mjs as the oracle of what should be found. Writes arms/verify/<fixture>-b<n>.jsonl.
import { join } from 'node:path';
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { cli, parseJson, ledger, log, spend, totalLine, overBudget, DOMAINS, HERE, SCRATCH } from './lib.mjs';

const builds = JSON.parse(readFileSync(join(HERE, 'ledger.json'), 'utf8')).entries.filter((e) => e.step === 'test1' && e.standardHash && e.exit === 0);
// the method step a planted defect breaks, and the oracle rule that finds it
export const EXPECT = {
  claims: { date: ['x8', 'R8c'], reserve: ['x5', 'R5'], exclusion: ['x3', 'R3b'], speculation: ['x7', 'R7'], uncited: ['x2', 'R2'] },
  labels: { 'firearms-floor': ['x5', 'R5'], high: ['x4', 'R4'], paraphrase: ['x17', 'R17'], span: ['x12', 'R12'], taxonomy: ['x1', 'R1'] },
};
export const stripFront = (t) => t.replace(/^---\n[\s\S]*?\n---\n/, '');
export const withArgs = (dir) => readdirSync(dir).sort().flatMap((f) => ['--with', `${f.replace(/\.txt$/, '').replace(/-/g, ' ')}=${join(dir, f)}`]);
export function summarise(j) {
  if (!j) return null;
  const violated = (j.checked ?? []).filter((c) => c.result?.verdict === 'VIOLATED').map((c) => ({ id: c.requirementId, materiality: c.materiality, enforced: c.enforced ?? false, observer: c.observer, spans: (c.result.spans ?? []).slice(0, 3).map((s) => s.text.slice(0, 160)), detail: (c.result.detail ?? '').slice(0, 200) }));
  const recordFails = (j.record?.entries ?? []).filter((e) => e.result === 'FAIL').map((e) => ({ id: e.id, required: e.required, evidence: String(e.observation?.evidence ?? '').slice(0, 160) }));
  return { state: j.state, standard: j.standardVersionHash, failed: j.failed, violated, recordFails, certificate: j.certificate };
}

const main = async () => {
  for (const fixture of ['claims', 'labels']) {
    const { check } = await import(join(DOMAINS, fixture, 'check.mjs'));
    const files = [
      ...readdirSync(join(DOMAINS, fixture, 'examples')).filter((f) => f.endsWith('.md')).map((f) => ({ kind: 'golden', id: f.replace('.md', ''), path: join(DOMAINS, fixture, 'examples', f), material: join(DOMAINS, fixture, 'examples', f.replace('.md', '.material')) })),
      ...readdirSync(join(DOMAINS, fixture, 'defects')).map((f) => ({ kind: 'defect', id: 'e01', defect: f.split('.')[1], path: join(DOMAINS, fixture, 'defects', f), material: join(DOMAINS, fixture, 'examples', 'e01.material') })),
    ];
    for (const b of builds.filter((x) => x.fixture === fixture)) {
      if (overBudget()) { log('budget reached; verify stops'); return; }
      const rows = []; const before = spend().total;
      for (const f of files) {
        const text = stripFront(readFileSync(f.path, 'utf8'));
        const tmp = join(SCRATCH, 'verify-in', `${fixture}-${f.kind}-${f.defect ?? f.id}.txt`); mkdirSync(join(SCRATCH, 'verify-in'), { recursive: true }); writeFileSync(tmp, text);
        const r = cli(['verify', '--skill', fixture, tmp, ...withArgs(f.material), '--json'], { data: b.data, tag: `verify:${fixture}:b${b.build}` });
        const s = summarise(parseJson(r.stdout));
        const oracle = check(text, { id: f.id }).fails;
        const [step, rule] = f.defect ? EXPECT[fixture][f.defect] : [null, null];
        const hit = s && step ? s.violated.find((v) => v.id === step) : null;
        rows.push({ fixture, build: b.build, kind: f.kind, id: f.id, defect: f.defect ?? null, exit: r.status, oracle, oracleFinds: rule ? oracle.some((x) => x.startsWith(rule)) : null,
          expectStep: step, named: Boolean(hit), namedWithPassage: Boolean(hit && hit.spans.length), stepEnforced: hit ? hit.enforced : null, blocked: s?.state === 'BLOCKED', ...s, stderr: r.stderr.slice(0, 300) });
      }
      writeFileSync(join(HERE, 'arms', 'verify', `${fixture}-b${b.build}.jsonl`), rows.map((x) => JSON.stringify(x)).join('\n') + '\n');
      ledger({ step: 'test2+3', fixture, build: b.build, verifies: files.length, meterUsd: spend().total - before });
      log(`verify ${fixture} b${b.build}: ${files.length} files; ${totalLine()}`);
    }
  }
};
mkdirSync(join(HERE, 'arms', 'verify'), { recursive: true });
if (process.argv[1].endsWith('verify.mjs')) await main();
