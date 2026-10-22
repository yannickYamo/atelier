// Test 5 (consistency) and the consumer comparison. Two arms per fixture, the same writer model:
//   atelier: `atelier invoke --skill <n> "<request>" --with <material> --model claude-sonnet-5-5 --json` on the build
//            chosen in RESULTS.md (the skill's own record, costUsd from its --json);
//   plain:   the same model called once with the method (or SKILL.md) as the system prompt and the material in the
//            user message (fetch to the Messages API through the study's meter).
// Usage: node consistency.mjs <claims|labels|adhd> <arm atelier|plain> <runs> [build]   (resumable: a kept output is not redone)
import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { cli, parseJson, ledger, log, spend, totalLine, overBudget, setTag, DOMAINS, ADHD, HERE, WRITER, PROXY } from './lib.mjs';

const [fixture, arm, runsArg, buildArg] = process.argv.slice(2); const runs = Number(runsArg);
const BUILD = { claims: 2, labels: 2, adhd: 1 }; const build = Number(buildArg ?? BUILD[fixture]);
const skill = fixture === 'adhd' ? 'i-have-adhd' : fixture;
const b = JSON.parse(readFileSync(join(HERE, 'ledger.json'), 'utf8')).entries.find((e) => e.step === 'test1' && e.fixture === fixture && e.build === build && e.exit === 0 && e.standardHash);

/** The ten tasks: request, material (name, path) and the id check.mjs knows them by. */
export function tasksOf(fx) {
  if (fx === 'adhd') {
    return readFileSync(join(ADHD, 'evals/cases.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).slice(0, 10)
      .map((c) => ({ id: c.id, request: c.prompt, material: [], criteria: c.criteria }));
  }
  return Array.from({ length: 10 }, (_, i) => {
    const dir = join(DOMAINS, fx, 'tasks', `t${i}`);
    const files = fx === 'claims' ? ['notice-of-loss.txt', existsSync(join(dir, 'police-report.txt')) ? 'police-report.txt' : 'incident-report.txt', 'invoice-1.txt', 'invoice-2.txt', 'policy.txt'] : ['transcript.txt', 'taxonomy.txt', 'policy.txt'];
    return { id: `t${i}`, request: fx === 'claims' ? 'Draft the claims assessment memo for this claim file.' : 'Label this clip for brand suitability under the policy, as JSON.',
      material: files.map((f) => ({ name: f.replace(/\.txt$/, '').replace(/-/g, ' '), path: join(dir, f) })) };
  });
}
const systemOf = (fx) => (fx === 'adhd' ? readFileSync(join(ADHD, 'skills/i-have-adhd/SKILL.md'), 'utf8') : readFileSync(join(DOMAINS, fx, 'method.md'), 'utf8'));
// The third arm, beyond the plan: the method and the owner's finished examples pasted as the system prompt (what
// Atelier serves the writer, without its checks), to separate what the examples carry from what the checks add.
const examplesOf = (fx) => readdirSync(join(DOMAINS, fx, 'examples')).filter((f) => f.endsWith('.md')).sort()
  .map((f) => `--- example ${f.replace('.md', '')} ---\n${readFileSync(join(DOMAINS, fx, 'examples', f), 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '')}`).join('\n\n');
const systemFor = (fx, arm) => (arm === 'plainx' ? `${systemOf(fx)}\n\nFinished examples, written to this method:\n\n${examplesOf(fx)}` : systemOf(fx));
const PRICE = { in: 2, out: 10, cw: 2.5, cr: 0.2 };

async function plain(task, arm) {
  const user = [task.request, ...task.material.map((m) => `--- ${m.name} ---\n${readFileSync(m.path, 'utf8')}`)].join('\n\n');
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${PROXY}/v1/messages`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: WRITER, max_tokens: 4000, system: systemFor(fixture, arm), messages: [{ role: 'user', content: user }] }) });
    if (res.ok) { const j = await res.json(); const u = j.usage ?? {};
      return { text: (j.content ?? []).filter((c) => c.type === 'text').map((c) => c.text).join(''), costUsd: ((u.input_tokens ?? 0) * PRICE.in + (u.output_tokens ?? 0) * PRICE.out + (u.cache_creation_input_tokens ?? 0) * PRICE.cw + (u.cache_read_input_tokens ?? 0) * PRICE.cr) / 1e6, stop: j.stop_reason }; }
    await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
  }
  return { text: null, costUsd: 0, error: 'four failures' };
}

const main = async () => {
  const dir = join(HERE, 'arms', 'consistency', fixture, arm); mkdirSync(dir, { recursive: true });
  for (let run = 1; run <= runs; run++) {
    for (const task of tasksOf(fixture)) {
      const base = join(dir, `${task.id}.r${run}`);
      if (existsSync(`${base}.json`)) continue;
      if (overBudget()) { log('budget reached; consistency stops'); return; }
      const s0 = spend().total; const t0 = Date.now(); let rec;
      if (arm === 'plain' || arm === 'plainx') {
        setTag(`t5:${fixture}:${arm}`); const p = await plain(task, arm);
        rec = { fixture, arm, task: task.id, run, text: p.text, costUsd: p.costUsd, stop: p.stop, error: p.error ?? null };
      } else {
        const r = cli(['invoke', '--skill', skill, task.request, ...task.material.flatMap((m) => ['--with', `${m.name}=${m.path}`]), '--model', WRITER, '--json', '--test-run'], { data: b.data, tag: `t5:${fixture}:atelier` });
        const j = parseJson(r.stdout);
        rec = { fixture, arm, task: task.id, run, text: j?.output ?? j?.answer ?? null, state: j?.state ?? null, costUsd: j?.costUsd ?? null, exit: r.status, standard: j?.standardVersionHash ?? null,
          headKeys: j ? ['schema', 'state', 'standardVersionHash', 'skillVersion', 'certificate', 'record'].filter((k) => k in j) : [], certificate: j?.certificate ?? null, stderr: r.stderr.slice(0, 400) };
        writeFileSync(`${base}.full.json`, r.stdout);
      }
      rec.meterUsd = spend().total - s0; rec.seconds = (Date.now() - t0) / 1000;
      if (rec.text) writeFileSync(`${base}.${fixture === 'labels' ? 'json.txt' : 'md'}`, rec.text);
      writeFileSync(`${base}.json`, JSON.stringify(rec, null, 1));
      ledger({ step: 'test5', fixture, arm, task: task.id, run, costUsd: rec.costUsd, meterUsd: rec.meterUsd });
      log(`t5 ${fixture} ${arm} ${task.id} r${run}: ${rec.text ? 'ok' : 'NO TEXT'} ${rec.state ?? ''} cost $${(rec.costUsd ?? 0).toFixed(4)} meter $${rec.meterUsd.toFixed(4)}; ${totalLine()}`);
    }
  }
};
if (process.argv[1].endsWith('consistency.mjs')) await main();
