// cli/commands/mcp.ts — THE STANDARD AS A TOOL ANY AGENT CAN CALL.
//
//   atelier mcp        (stdio; the plugin registers it, or any MCP client can)
//
// The embeddable unit is not the skill file. A skill is read by one host when one person invokes it;
// "every output our team produces follows the standard" needs the CHECK to be callable wherever the
// writing happens — another agent, an editor, a pipeline. This exposes it over the Model Context
// Protocol with no dependency beyond Node: newline-delimited JSON-RPC 2.0 on stdin and stdout.
//
// Tools, all read-only and free (no model is called):
//   atelier_list_skills   the skills built on this machine, with what each is for
//   atelier_rules         a skill's standard: every rule, its weight, and how it is checked
//   atelier_verify        any text against a skill's measured rules, with the spans that broke one
//   atelier_skill_report  a skill's evaluation: what every output is checked by and how far each check can be
//                         trusted (the card printed when it was built), and, given a run, that run's evaluation
//   atelier_new           build a skill from a folder of work and a method note: the review screen first; the skill
//                         is built only when the PERSON has approved what the screen shows (approve: true)
//   atelier_run           new work with a skill, written, checked, repaired, recorded: the whole run record
//   atelier_report        a run's record, or a skill's weights and clashes
//   atelier_rate          the person's own ruling on a run (ship as is, or not), recorded on the skill
//   atelier_fix           a piece written again for what was wrong, in the person's words
//
// The reading tools change nothing. The building tools run the same commands a person runs at the terminal, in a
// child process with this server's environment (the model key, ATELIER_DATA, ATELIER_PROJECT_DIR), so an app that
// reaches Atelier through MCP has the same front door and the same records. The person approves the standard, never
// the agent: atelier_new builds nothing until approve is true, and the agent must have shown them the screen.

import { checksFor } from '../checks.js';
import { skillCardFor } from '../skill-card.js';
import { renderSkillCard } from '../../core/eval/skill-card.js';
import { renderPanel } from '../../core/eval/summary.js';
import { recordForText } from '../eval-run.js';
import { stateLine } from '../../core/eval/run-card.js';
import { needsReview, partlyChecked } from '../../core/eval/record.js';
import { getEval } from '../../core/state/eval-store.js';
import { createInterface } from 'node:readline';
import { existsSync, readdirSync, mkdtempSync } from 'node:fs';
import { writeAtomic } from '../../core/state/fs-atomic.js';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import * as store from '../../core/state/store.js';
import { describeVerify } from '../../core/observers/verify.js';
import { checkDraftAsync } from '../../core/loop/run-repair.js';
import { describeTaste, vetoMisses, actsAsMiss } from '../../core/taste/reader.js';
import { recordTaste } from './taste.js';
import { checkClass } from '../../core/observers/doc-class.js';
import { observerFor } from '../../core/observers/registry.js';
import type { StandardVersion } from '../../core/state/canonical-state.js';
import { isGeneralScope } from '../../core/state/canonical-state.js';
import { DATA } from '../runtime.js';
import { version } from '../help.js';

interface Rpc { jsonrpc: '2.0'; id?: number | string | null; method?: string; params?: Record<string, unknown> }

const TOOLS = [
  { name: 'atelier_list_skills', description: 'List the Atelier skills built on this machine and what each is for.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'atelier_rules', description: "A skill's ratified standard: every rule, its weight (REQUIRED instructs), and how it is checked.",
    inputSchema: { type: 'object', properties: { skill: { type: 'string' } }, required: ['skill'], additionalProperties: false } },
  { name: 'atelier_verify', description: 'Check a text against every measured rule of an Atelier skill, and for invented specifics (stories told as lived, quotations, attributions, links, figures) that do not trace to the skill\'s material (UNSOURCED). With no material stored or passed, or on a kind of work the claim check was not measured on, those are returned as a list to check and do not fail. Returns each violation with the exact span; failed=true when a REQUIRED rule is broken; delivery is what the skill\'s consequence table does with the text (SHIP, SHIP_LABELLED, PERSON: ask the person, BLOCK). Rewrite only the spans it names; where UNSOURCED fails, delete each such sentence outright: do not reword it, and never replace it with another invented claim. Where it is only listed, leave the text and tell the person.',
    inputSchema: { type: 'object', properties: { skill: { type: 'string' }, text: { type: 'string' },
      class: { type: 'string', description: 'the kind of document the text is ("blog-post", "support-reply"); refused when the skill measures another kind' },
      material: { type: 'string', description: 'notes, figures or sources the text may draw on, beyond the skill\'s own material' },
      taste: { type: 'boolean', description: 'also read the rules no count can check (argument, figure, register…); calls a model' },
      task: { type: 'string', description: 'the task the text was written for, so conditional rules are judged against it' } },
    required: ['skill', 'text'], additionalProperties: false } },
  { name: 'atelier_skill_report', description: "How an Atelier skill is evaluated: the owner's rules (counted or only read), the invented-claim check with the rates it was measured at, the author's range with its out-of-sample baseline, the style detector and the model families it is valid for, and what is not measured. Given a run id, that run's evaluation instead: CONFORMANT or NOT CONFORMANT with the gates that decided it. Read this before telling the person a run can ship.",
    inputSchema: { type: 'object', properties: { skill: { type: 'string' },
      run: { type: 'string', description: 'an invocation id: return that run\'s evaluation rather than the skill\'s card' } },
    required: ['skill'], additionalProperties: false } },
  { name: 'atelier_new', description: 'Build a skill from a folder of a person\'s finished work, with their method note when they have one. Without approve it shows the screen a person approves from and builds nothing; show that screen to the person. With approve: true it builds exactly that. Calls a model where one is set up.',
    inputSchema: { type: 'object', properties: { work: { type: 'string', description: 'a file, or a folder of their finished pieces' },
      method: { type: 'string', description: 'their method note, when they wrote one' }, purpose: { type: 'string', description: 'what the skill is for, in their words' },
      name: { type: 'string', description: 'the skill\'s name; read from the folder when left out' },
      approve: { type: 'boolean', description: 'true only when the person has seen the screen and said to build it' } },
    required: ['work'], additionalProperties: false } },
  { name: 'atelier_run', description: 'New work with a skill: written, checked against every rule, repaired where a required rule broke, recorded. Returns the work and its whole record (state VERIFIED, NEEDS REVIEW or BLOCKED, its delivery SHIP, SHIP_LABELLED, PERSON or BLOCK, the rules as they fared, the run id). A run whose delivery is PERSON waits for the person\'s ruling: show it to them. Before writing a piece it may return up to three questions only the person can answer (questions: id, ask, options, default) and the plan it wrote from: the work was written with the defaults, served to the writer as assumptions and never as the person\'s answers; ask the person, and run again with their answers. Calls a model.',
    inputSchema: { type: 'object', properties: { skill: { type: 'string' }, task: { type: 'string', description: 'the request, in the person\'s words' },
      material: { type: 'string', description: 'notes, figures or sources the work must draw on' },
      files: { type: 'array', items: { type: 'string' }, description: 'paths of material files to bind for this run' },
      answers: { type: 'string', description: 'the person\'s answers to the questions an earlier run returned, as "id=choice,..." (a letter or their own words); never answered on their behalf' } },
    required: ['skill', 'task'], additionalProperties: false } },
  { name: 'atelier_report', description: 'A run\'s record (its evaluation and trace) given its run id, or a skill\'s weights and settled clashes given the skill.',
    inputSchema: { type: 'object', properties: { run: { type: 'string' }, skill: { type: 'string' } }, additionalProperties: false } },
  { name: 'atelier_rate', description: 'Record the person\'s own ruling on a run: whether they would ship it as it stands, and why. Only the person rules; never rate on their behalf.',
    inputSchema: { type: 'object', properties: { run: { type: 'string' }, ship: { type: 'boolean' }, why: { type: 'string' } }, required: ['run', 'ship', 'why'], additionalProperties: false } },
  { name: 'atelier_fix', description: 'Write the last piece again for what was wrong, in the person\'s words; the skill is left alone. Calls a model.',
    inputSchema: { type: 'object', properties: { what: { type: 'string' }, skill: { type: 'string' } }, required: ['what'], additionalProperties: false } },
] as const;

/** The atelier binary this server was started from, run as a person would run it, in the project the server serves. */
function runCli(args: readonly string[]): { text: string; isError: boolean } {
  const cwd = process.env.ATELIER_PROJECT_DIR ?? process.cwd();
  const r = spawnSync(process.execPath, [...process.execArgv, process.argv[1], ...args], { encoding: 'utf8', cwd, env: process.env, maxBuffer: 64 * 1024 * 1024 });
  const text = `${r.stdout ?? ''}${r.stderr ? `\n${r.stderr}` : ''}`.trim();
  return { text: text || `(atelier ${args[0]} said nothing)`, isError: (r.status ?? 1) !== 0 };
}
const str = (x: unknown): string | null => (typeof x === 'string' && x.trim() ? x : null);
const NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;

const standardOf = (skill: string): StandardVersion => {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(skill)) throw new Error(`"${skill}" is not a skill name.`);
  const L: store.StoreLayout = { root: DATA, skillName: skill };
  const active = store.getActive(L);
  const sv = active ? store.getSkillVersion(L, active) : null;
  const v = sv ? store.getStandard(L, sv.standardVersionHash) : null;
  if (!v) throw new Error(`no built skill called "${skill}". List them with atelier_list_skills.`);
  return v;
};

const call = async (name: string, args: Record<string, unknown>): Promise<{ text: string; isError: boolean }> => {
  if (name === 'atelier_list_skills') {
    const dir = join(DATA, 'skills');
    // One unreadable skill must not hide the others.
    const rows = (existsSync(dir) ? readdirSync(dir) : []).flatMap((n) => {
      try {
        const L: store.StoreLayout = { root: DATA, skillName: n };
        const active = store.getActive(L);
        if (!active) return [];
        return [`${n}  —  ${store.getSkillVersion(L, active)?.description ?? ''}`];
      } catch { return [`${n}  —  (unreadable)`]; }
    });
    return { text: rows.length ? rows.join('\n') : 'No skills are built on this machine yet.', isError: false };
  }
  const skill = typeof args.skill === 'string' ? args.skill : '';
  if (name === 'atelier_skill_report') {
    standardOf(skill);
    const L: store.StoreLayout = { root: DATA, skillName: skill };
    if (typeof args.run === 'string' && args.run) {
      const e = getEval(L, args.run);
      return e ? { isError: false, text: `${renderPanel(e)}\n\n${JSON.stringify(e)}` } : { isError: true, text: `no evaluation recorded for run ${args.run} of "${skill}".` };
    }
    const card = skillCardFor(L);
    return card ? { isError: false, text: `${renderSkillCard(card)}\n\n${JSON.stringify(card)}` } : { isError: true, text: `no built skill called "${skill}".` };
  }
  if (name === 'atelier_rules') {
    const v = standardOf(skill);
    const live = v.requirements.filter((r) => r.authority !== 'EXPERT_REJECTED');
    return { isError: false, text: live.map((r) => `${r.requirementId} [${r.materiality ?? 'undeclared'}] ${r.kind === 'BOUNDARY' ? 'AVOID: ' : ''}${r.statement}`
      + (isGeneralScope(r.appliesWhen) ? '' : `\n   only when: ${r.appliesWhen}`)
      + (r.measurement ? `\n   checked: ${observerFor(r.measurement.observer).describe(r.measurement.params)}` : '')).join('\n') };
  }
  if (name === 'atelier_verify') {
    const text = typeof args.text === 'string' ? args.text : '';
    if (!text.trim()) return { isError: true, text: 'there is no text to check. An empty input passing would read as a clean result.' };
    const v = standardOf(skill);
    const L: store.StoreLayout = { root: DATA, skillName: skill };
    const cls = checkClass(store.getDocClass(L), typeof args.class === 'string' ? args.class : null);
    if (!cls.ok) return { isError: true, text: cls.why };
    const material = [...store.getMaterial(L).map((m) => m.text), typeof args.material === 'string' ? args.material : ''].join('\n\n');
    // The rules read against what the text was made from (figures given, lines cited) are given the same material.
    const named = [...store.getMaterial(L).map((m) => ({ name: m.name, text: m.text })), ...(typeof args.material === 'string' && args.material.trim() ? [{ name: 'material', text: args.material }] : [])];
    const checks = checksFor(L, { material, task: typeof args.task === 'string' ? args.task : '', context: { ...(typeof args.task === 'string' && args.task ? { request: args.task } : {}), material: named }, ...(typeof args.class === 'string' ? { cls: args.class } : {}), bound: store.getMaterial(L).length > 0 || (typeof args.material === 'string' && args.material.trim().length > 0) });
    const report = await checkDraftAsync(skill, v, text, checks);
    // The same record a run carries (cli/eval-run.ts): an agent checking its own text is told what was read in full,
    // what in part and what not at all, and never takes "nothing failed" for "verified".
    const record = recordForText({ L, std: v, text, report, sensor: checks.claimSensor, claimsOff: false, answers: checks.format?.claims === 'list', unmeasured: checks.listsBecause ?? null, act: checks.claimAct, material: checks.evidence ?? '' });
    // The reading-based rules, on request: this calls a model, and every other check here is free.
    // A miss on a rule where the reader holds VETO fails the check, as on the command line. A reader that
    // cannot run costs nothing of the counted report: it is said, and the counted result stands.
    // A reading held back for calibration returns no verdicts, only whether it failed.
    let taste: { verdicts: unknown[]; text: string; failed: boolean; couldNotRun?: boolean } | null = null;
    if (args.taste === true) {
      try {
        const { readings, permissions, held } = await recordTaste(L, v, text, typeof args.task === 'string' ? args.task : null, null,
          { spentUsd: 0, capUsd: 1, maxCalls: 3 });
        taste = { text: describeTaste(readings, new Map(v.requirements.map((r) => [r.requirementId, r])), permissions.veto, held),
          failed: vetoMisses(readings, permissions.veto).length > 0,
          verdicts: held ? [] : readings.map((r) => ({ rule: r.requirementId, verdict: r.verdict, kind: r.kind ?? null, quote: r.quote ?? null, why: r.why,
            authority: actsAsMiss(r) && permissions.veto.has(r.key) ? 'VETO' : 'OBSERVE' })) };
      } catch (e) {
        taste = { text: `(the taste reader could not run: ${(e as Error).message.split('\n')[0]})`, failed: false, verdicts: [], couldNotRun: true };
      }
    }
    return { isError: false, text: `${describeVerify(report, partlyChecked(record))}${taste ? `\n\n${taste.text}` : ''}${cls.note ? `\n(${cls.note})` : ''}\n\n${record.state.replace('_', ' ')}: ${stateLine(record)}\n\n${JSON.stringify({ failed: record.state === 'BLOCKED' || (taste?.failed ?? false), state: record.state, delivery: record.delivery ?? null,
      notVerified: record.entries.filter(needsReview).map((e) => ({ rule: e.id, statement: e.statement, why: e.reason, ...(e.observation.unchecked ? { unchecked: e.observation.unchecked } : {}) })),
      violations: report.checked.filter((c) => c.result.verdict === 'VIOLATED').map((c) => ({ rule: c.requirementId, materiality: c.materiality,
        detail: c.result.detail, spans: c.result.spans.map((s) => ({ text: s.text, start: s.start, end: s.end, why: s.why })) })),
      ...(taste ? { taste: taste.verdicts, ...(taste.couldNotRun ? { tasteCouldNotRun: true } : {}) } : {}) })}` };
  }
  if (name === 'atelier_new') {
    const work = str(args.work); if (!work) return { isError: true, text: 'work: a file or a folder of the person\'s finished pieces is required.' };
    const method = str(args.method); const purpose = str(args.purpose); const skillName = str(args.name);
    if (skillName && !NAME.test(skillName)) return { isError: true, text: `"${skillName}" is not a skill name (lower case, digits, hyphens).` };
    // THE PERSON APPROVES. Without approve the method path shows its screen and builds nothing (--review); the discovery
    // path proposes and waits for --accept. With approve both paths build exactly what was shown.
    const a = ['new', work, ...(method ? ['--method', method] : []), ...(purpose ? [purpose] : []), ...(skillName ? ['--name', skillName] : []),
      ...(args.approve === true ? ['--yes', '--accept'] : method ? ['--review'] : [])];
    const r = runCli(a);
    return { ...r, text: args.approve === true ? r.text : `${r.text}\n\nNothing was built. Show this to the person; build it with approve: true once they say so.` };
  }
  if (name === 'atelier_run') {
    const task = str(args.task); if (!task) return { isError: true, text: 'task: the request is required.' };
    if (!NAME.test(skill)) return { isError: true, text: `"${skill}" is not a skill name.` };
    const files = Array.isArray(args.files) ? args.files.filter((f): f is string => typeof f === 'string' && f.trim().length > 0) : [];
    const withs = files.flatMap((f) => ['--with', f]);
    const material = str(args.material);
    if (material) { const dir = mkdtempSync(join(tmpdir(), 'atelier-mcp-')); const f = join(dir, 'material.md'); writeAtomic(f, material); withs.push('--with', `material=${f}`); }
    const answers = str(args.answers);
    return runCli(['invoke', '--skill', skill, task, '--json', ...withs, ...(answers ? ['--answers', answers] : [])]);
  }
  if (name === 'atelier_report') {
    const run = str(args.run);
    if (run) return runCli(['report', run]);
    if (NAME.test(skill)) return runCli(['report', '--skill', skill]);
    return { isError: true, text: 'give a run id, or a skill.' };
  }
  if (name === 'atelier_rate') {
    const run = str(args.run); const why = str(args.why);
    if (!run || !why || typeof args.ship !== 'boolean') return { isError: true, text: 'run, ship (true or false) and why are required.' };
    return runCli(['rate', run, args.ship ? 'yes' : 'no', why]);
  }
  if (name === 'atelier_fix') {
    const what = str(args.what); if (!what) return { isError: true, text: 'what: what was wrong, in the person\'s words, is required.' };
    return runCli(['fix', what, ...(NAME.test(skill) ? ['--skill', skill] : [])]);
  }
  throw new Error(`unknown tool "${name}"`);
};

const SUPPORTED = ['2025-06-18', '2025-03-26', '2024-11-05'];

async function handle(req: Rpc): Promise<unknown> {
  if (req.id === undefined || req.id === null) return null;            // a notification: nothing to answer
  if (!req.method) return null;                                         // a response to us: nothing to answer
  const ok = (result: unknown): unknown => ({ jsonrpc: '2.0', id: req.id, result });
  try {
    switch (req.method) {
      case 'initialize': {
        // Echo the client's version when it is one we speak; otherwise offer our newest.
        const asked = typeof req.params?.protocolVersion === 'string' ? req.params.protocolVersion : '';
        return ok({ protocolVersion: SUPPORTED.includes(asked) ? asked : SUPPORTED[0],
          capabilities: { tools: {} }, serverInfo: { name: 'atelier', version: version() } });
      }
      case 'ping': return ok({});
      case 'tools/list': return ok({ tools: TOOLS });
      case 'tools/call': {
        const name = typeof req.params?.name === 'string' ? req.params.name : '';
        const args = (req.params?.arguments ?? {}) as Record<string, unknown>;
        try {
          const r = await call(name, args);
          return ok({ content: [{ type: 'text', text: r.text }], isError: r.isError });
        } catch (e) {
          return ok({ content: [{ type: 'text', text: (e as Error).message }], isError: true });
        }
      }
      default: return { jsonrpc: '2.0', id: req.id, error: { code: -32601, message: `method not found: ${req.method}` } };
    }
  } catch (e) {
    return { jsonrpc: '2.0', id: req.id, error: { code: -32603, message: (e as Error).message } };
  }
}

export async function mcp(): Promise<void> {
  const send = (msg: unknown): void => { process.stdout.write(`${JSON.stringify(msg)}\n`); };
  const rl = createInterface({ input: process.stdin });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let parsed: Rpc | Rpc[];
    try { parsed = JSON.parse(line) as Rpc | Rpc[]; } catch { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }); continue; }
    if (Array.isArray(parsed)) {
      const replies = (await Promise.all(parsed.map(handle))).filter((r) => r !== null);
      if (replies.length) send(replies);
    } else {
      const r = await handle(parsed);
      if (r !== null) send(r);
    }
  }
}
