// studies/harness/override-generate.mjs — EXPLORATORY_OVERRIDE_ENDPOINT generation runner.
// One serving function; arms differ only in served bytes. Resumable: existing trial files are
// kept, so a crash re-run finishes the set without regenerating anything.
// PRINTS NO GENERATION TEXT — builder blinding is operational, not promised.
import { AnthropicInferenceClient } from '../../dist/providers/anthropic.js';
import { GenerationIncomplete } from '../../dist/core/inference/client.js';
import Anthropic from '@anthropic-ai/sdk';
import { TASKS } from './override-tasks.mjs';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const MODEL = 'claude-opus-5';
const OUT = join(homedir(), 'atelier-b2-study', 'override');
const TRIALS = join(OUT, 'trials');
mkdirSync(TRIALS, { recursive: true });
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const client = new Anthropic();               // token counting only
const infer = new AnthropicInferenceClient(MODEL);   // every generation goes through this

// ── served bytes ────────────────────────────────────────────────────────────────
const skillDir = join(homedir(), 'atelier-b2-study', '.claude', 'skills', 'reviewer-voice');
const parts = [readFileSync(join(skillDir, 'SKILL.md'), 'utf8')];
const exDir = join(skillDir, 'examples');
if (existsSync(exDir)) for (const f of readdirSync(exDir).sort()) parts.push(readFileSync(join(exDir, f), 'utf8'));
const T_BYTES = parts.join('\n\n---\n\n');

const corpusDir = join(homedir(), 'atelier-b2-study', 'corpus');
const CORPUS = readdirSync(corpusDir).sort().filter((f) => f.endsWith('.md'))
  .map((f) => `=== ${f} ===\n${readFileSync(join(corpusDir, f), 'utf8')}`).join('\n\n');

const countTokens = async (text) => (await client.messages.countTokens({
  model: MODEL, system: text, messages: [{ role: 'user', content: 'x' }] })).input_tokens;

const FREE_TEXT_SCHEMA = {
  type: 'object', properties: { piece: { type: 'string' } }, required: ['piece'], additionalProperties: false,
};

// ── B2 guide: corpus only, token-matched ±15%, regenerate-never-adjust-T ────────
async function guide(tTokens) {
  const gPath = join(OUT, 'b2-guide.md');
  if (existsSync(gPath)) {
    const g = readFileSync(gPath, 'utf8');
    return { g, gTokens: await countTokens(g) };
  }
  let instruction = tTokens;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const r = await infer.complete({
      stableBlock: `Below are four pieces of writing by one author.\n\n${CORPUS}`,
      variableBlock: `Write a practical style guide, roughly ${instruction} tokens long, that would teach a capable `
        + `writer to produce new pieces exactly as this author would — voice, structure, habits, `
        + `tendencies, what to do and what to avoid. Output only the guide itself.`,
      userMessage: 'Write the guide now.', toolName: 'emit_piece', toolDescription: 'Emit the finished guide.',
      schema: FREE_TEXT_SCHEMA, maxTokens: Math.ceil(tTokens * 1.6) + 500 });
    const g = String((r.json ?? {}).piece ?? '');
    const gTokens = await countTokens(g);
    const ratio = gTokens / tTokens;
    console.log(`guide attempt ${attempt}: ${gTokens} tokens vs T ${tTokens} (ratio ${ratio.toFixed(2)}) ${r.termination.kind} model=${r.modelId}`);
    if (ratio >= 0.85 && ratio <= 1.15) { writeFileSync(gPath, g); return { g, gTokens }; }
    instruction = Math.round(instruction * (tTokens / gTokens));
  }
  throw new Error('guide would not token-match in 4 attempts');
}

// ── one serving function ────────────────────────────────────────────────────────
// THE PRODUCT'S OWN SERVING PATH, NOT A SECOND ONE.
//
// This called the vendor SDK directly and read the provider's raw termination field itself, making the runner the
// owner of a validity rule core already owns — the study-semantics census caught it. Termination
// now comes from the shipped adapter: a generation that did not finish raises
// `GenerationIncomplete` and never reaches disk as data, which is the documented path for the one
// caller that must COUNT truncations rather than crash on them.
async function generate(taskId, arm, served, userText) {
  const f = join(TRIALS, `${taskId}.${arm}.md`);
  if (existsSync(f)) return null;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const r = await infer.complete({
        stableBlock: served ?? '', variableBlock: userText,
        userMessage: 'Write it now. Output only the piece itself.',
        toolName: 'emit_piece', toolDescription: 'Emit the finished piece.',
        schema: FREE_TEXT_SCHEMA, maxTokens: 2000,
      });
      const text = String((r.json ?? {}).piece ?? '');
      writeFileSync(f, text);
      return { taskId, arm, sha256: sha256(text), resolvedModel: r.modelId,
        termination: r.termination.kind, in: r.inputTokens, out: r.outputTokens };
    } catch (e) {
      if (e instanceof GenerationIncomplete) {
        return { taskId, arm, sha256: null, resolvedModel: null,
          termination: e.termination.kind, in: null, out: e.outputTokens };
      }
      if (attempt === 4) throw e;
      await new Promise((res) => setTimeout(res, attempt * 5000));
    }
  }
}

const tTokens = await countTokens(T_BYTES);
const { g: G_BYTES, gTokens } = await guide(tTokens);
console.log(`T served ${tTokens} tokens · B2 guide ${gTokens} tokens · ratio ${(gTokens / tTokens).toFixed(3)}`);

const jobs = [];
for (const [id, task] of TASKS) {
  const kind = id[0];
  jobs.push([id, 'T', T_BYTES, task]);
  if (kind === 'E' || kind === 'J') jobs.push([id, 'B2', G_BYTES, task]);
  if (kind === 'K') jobs.push([id, 'B0', null, task]);
}
console.log(`jobs: ${jobs.length} generations (${TASKS.length} tasks)`);

const manifest = [];
let done = 0;
const workers = Array.from({ length: 4 }, async () => {
  while (jobs.length) {
    const [id, arm, sys, task] = jobs.shift();
    const m = await generate(id, arm, sys, task);
    done++;
    if (m) { manifest.push(m); console.log(`${done}: ${id}.${arm} out=${m.out} ${m.termination}`); }
    else console.log(`${done}: ${id}.${arm} (already on disk)`);
  }
});
await Promise.all(workers);

const mPath = join(OUT, 'manifest.json');
const prior = existsSync(mPath) ? JSON.parse(readFileSync(mPath, 'utf8')) : { entries: [] };
const seen = new Set(manifest.map((m) => `${m.taskId}.${m.arm}`));
const entries = [...prior.entries.filter((e) => !seen.has(`${e.taskId}.${e.arm}`)), ...manifest];
writeFileSync(mPath, JSON.stringify({ tTokens, gTokens, servedShaT: sha256(T_BYTES), servedShaB2: sha256(G_BYTES), entries }, null, 1));
const trunc = entries.filter((e) => e.termination !== 'COMPLETE');
console.log(`manifest: ${entries.length} entries · did not finish: ${trunc.length}${trunc.length ? ' -> ' + trunc.map((e) => `${e.taskId}.${e.arm}:${e.termination}`).join(' ') : ''}`);
console.log('models seen:', [...new Set(entries.map((e) => e.resolvedModel))].join(', '));
