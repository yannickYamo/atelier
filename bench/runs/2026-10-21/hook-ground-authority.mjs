// Tests 6 (hook), 7 (grounding), 8 + 12 (record head and certificate) and 9 (authority), on claims build 2.
// Usage: node hook-ground-authority.mjs [build]. Writes arms/hook.json, arms/grounding.json, arms/authority.json.
import { join } from 'node:path';
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cli, parseJson, ledger, log, spend, totalLine, DOMAINS, HERE, SCRATCH, CLI, PROXY, WRITER, setTag } from './lib.mjs';
import { stripFront, withArgs, summarise } from './verify.mjs';

const build = Number(process.argv[2] ?? 2);
const b = JSON.parse(readFileSync(join(HERE, 'ledger.json'), 'utf8')).entries.find((e) => e.step === 'test1' && e.fixture === 'claims' && e.build === build && e.exit === 0);
const stdDir = join(b.data, 'skills', 'claims', 'standards');
const snapshot = () => Object.fromEntries(readdirSync(stdDir).sort().map((f) => { const raw = readFileSync(join(stdDir, f), 'utf8'); return [f, createHash('sha256').update(raw).digest('hex').slice(0, 16)]; }));
const activeStd = () => { const d = join(b.data, 'skills', 'claims'); const a = JSON.parse(readFileSync(join(d, 'active.json'), 'utf8'));
  const v = JSON.parse(readFileSync(join(d, 'versions', `${a.skillVersionHash}.json`), 'utf8')); return v.standardVersionHash ?? v.standard ?? null; };
const before = { files: snapshot(), active: activeStd() };
mkdirSync(join(HERE, 'arms'), { recursive: true }); const s0 = spend().total;

// ── Test 6: the hook, on a planted defect, a PostToolUse Write event and a Stop event with a transcript ──
const hook = [];
const runHook = (label, event) => {
  setTag(`hook:${label}`);
  const t0 = process.hrtime.bigint();
  const r = spawnSync('node', [CLI, 'verify', '--skill', 'claims', '--hook'], { cwd: join(b.data, 'project'), env: { ...process.env, ATELIER_DATA: b.data, ANTHROPIC_BASE_URL: PROXY }, input: JSON.stringify(event), encoding: 'utf8' });
  const secs = Number(process.hrtime.bigint() - t0) / 1e9;
  hook.push({ label, exit: r.status, seconds: Number(secs.toFixed(2)), stderr: r.stderr.slice(0, 600) });
  log(`hook ${label}: exit ${r.status} in ${secs.toFixed(2)}s`);
};
const defects = join(DOMAINS, 'claims', 'defects');
for (const d of ['speculation', 'uncited', 'reserve']) {
  const text = readFileSync(join(defects, `e01.${d}.md`), 'utf8');
  runHook(`write:${d}`, { hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: join(SCRATCH, 'memo.md'), content: text } });
  const tr = join(SCRATCH, `transcript-${d}.jsonl`);
  writeFileSync(tr, [
    { type: 'user', message: { role: 'user', content: 'Draft the claims assessment memo for this claim file.' } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } },
  ].map((x) => JSON.stringify(x)).join('\n') + '\n');
  runHook(`stop:${d}`, { hook_event_name: 'Stop', transcript_path: tr, stop_hook_active: false });
}
runHook('write:golden-e01', { hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { content: stripFront(readFileSync(join(DOMAINS, 'claims', 'examples', 'e01.md'), 'utf8')) } });
runHook('not-json', 'this is not an event');
writeFileSync(join(HERE, 'arms', 'hook.json'), JSON.stringify(hook, null, 1));

// ── Test 7: one invented figure and one invented citation planted into golden e02 ──
const golden = stripFront(readFileSync(join(DOMAINS, 'claims', 'examples', 'e02.md'), 'utf8'));
const planted = golden
  .replace('## Facts\n\n', '## Facts\n\nThe insured has made 4 earlier claims under this policy, totalling 9,350 dollars. ')
  .replace('## Coverage analysis\n\n', '## Coverage analysis\n\nA witness statement confirms the items were in use that day [witness statement]. ');
const plantedPath = join(SCRATCH, 'verify-in', 'claims-e02-planted.md'); writeFileSync(plantedPath, planted);
writeFileSync(join(HERE, 'arms', 'grounding-input.md'), planted);
const material = join(DOMAINS, 'claims', 'examples', 'e02.material');
const grounding = [];
for (const [label, extra] of [['with material', withArgs(material)], ['without material', []]]) {
  const r = cli(['verify', '--skill', 'claims', plantedPath, ...extra, '--json'], { data: b.data, tag: `grounding:${label}` });
  const j = parseJson(r.stdout); const s = summarise(j);
  const unsourced = (j?.checked ?? []).filter((c) => /UNSOURCED/.test(c.requirementId)).flatMap((c) => (c.result?.spans ?? []).map((x) => x.text.slice(0, 160)));
  const figureSeen = JSON.stringify(j ?? {}).includes('9,350') || JSON.stringify(j ?? {}).includes('9350');
  const citationSeen = JSON.stringify(j ?? {}).includes('witness statement');
  grounding.push({ label, exit: r.status, state: j?.state, figureSeen, citationSeen, unsourced, violated: s?.violated?.map((v) => ({ id: v.id, materiality: v.materiality, enforced: v.enforced, spans: v.spans, detail: v.detail })), claimsReader: j?.certificate?.readers?.claims ?? null, recordHead: j ? ['schema', 'state', 'standardVersionHash', 'skillVersion', 'certificate', 'record'].filter((k) => k in j) : [] });
  writeFileSync(join(HERE, 'arms', `grounding-${label.replace(' ', '-')}.json`), r.stdout);
  log(`grounding ${label}: state ${j?.state}, figure seen ${figureSeen}, citation seen ${citationSeen}`);
}
// and repair with material: on a memo an invention is listed or flagged, never cut
{
  const r = cli(['verify', '--skill', 'claims', plantedPath, ...withArgs(material), '--repair', '--json', '--model', WRITER], { data: b.data, tag: 'grounding:repair' });
  const j = parseJson(r.stdout); const out = j?.output ?? j?.text ?? j?.repaired ?? '';
  writeFileSync(join(HERE, 'arms', 'grounding-repair.json'), r.stdout);
  grounding.push({ label: 'repair with material', exit: r.status, state: j?.state, keys: j ? Object.keys(j) : null, figureKept: /9,350/.test(out), citationKept: /witness statement/.test(out), outputLength: out.length });
  log(`grounding repair: figure kept ${/9,350/.test(out)}, citation kept ${/witness statement/.test(out)}`);
}
writeFileSync(join(HERE, 'arms', 'grounding.json'), JSON.stringify(grounding, null, 1));

// ── Test 9: the standard hash before and after; qualifications beside the standard and outside its hash ──
const after = { files: snapshot(), active: activeStd() };
const stdFile = JSON.parse(readFileSync(join(stdDir, `${after.active}.json`), 'utf8'));
const authority = { build, before, after, sameFiles: JSON.stringify(before.files) === JSON.stringify(after.files), sameActive: before.active === after.active,
  standardFileKeys: Object.keys(stdFile), qualificationsInFile: 'qualifications' in stdFile, qualificationIds: Object.keys(stdFile.qualifications ?? {}),
  qualifiedIds: Object.entries(stdFile.qualifications ?? {}).filter(([, q]) => q?.qualified).map(([k]) => k),
  // recomputed here from { evidenceId, workType, requirements } (the documented hash input), and again with the
  // qualifications folded in: the first must equal the file's name, the second must not
  recomputed: createHash('sha256').update(JSON.stringify({ evidenceId: stdFile.evidenceId, workType: stdFile.workType, requirements: stdFile.requirements })).digest('hex').slice(0, 16),
  withQualifications: createHash('sha256').update(JSON.stringify({ evidenceId: stdFile.evidenceId, workType: stdFile.workType, requirements: stdFile.requirements, qualifications: stdFile.qualifications })).digest('hex').slice(0, 16),
  requirementsMentionQualified: JSON.stringify(stdFile.requirements ?? []).includes('"qualified"') };
authority.hashMatchesName = authority.recomputed === after.active;
writeFileSync(join(HERE, 'arms', 'authority.json'), JSON.stringify(authority, null, 1));
ledger({ step: 'test6+7+9', build, meterUsd: spend().total - s0 });
log(`hook/grounding/authority done; ${totalLine()}`);
