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
//
// Nothing here can change a standard. The calling agent does the rewriting; this says what to rewrite.

import { checksFor } from '../checks.js';
import { createInterface } from 'node:readline';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
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
  { name: 'atelier_verify', description: 'Check a text against every measured rule of an Atelier skill, and for invented specifics (stories told as lived, quotations, attributions, links, figures) that do not trace to the skill\'s material (UNSOURCED). Returns each violation with the exact span; failed=true when a REQUIRED rule is broken. Rewrite only the spans it names; delete each UNSOURCED sentence outright: do not reword it, and never replace it with another invented claim.',
    inputSchema: { type: 'object', properties: { skill: { type: 'string' }, text: { type: 'string' },
      class: { type: 'string', description: 'the kind of document the text is ("blog-post", "support-reply"); refused when the skill measures another kind' },
      material: { type: 'string', description: 'notes, figures or sources the text may draw on, beyond the skill\'s own material' },
      taste: { type: 'boolean', description: 'also read the rules no count can check (argument, figure, register…); calls a model' },
      task: { type: 'string', description: 'the task the text was written for, so conditional rules are judged against it' } },
    required: ['skill', 'text'], additionalProperties: false } },
] as const;

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
    const report = await checkDraftAsync(skill, v, text, checksFor(L, { material, task: typeof args.task === 'string' ? args.task : '' }));
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
    return { isError: false, text: `${describeVerify(report)}${taste ? `\n\n${taste.text}` : ''}${cls.note ? `\n(${cls.note})` : ''}\n\n${JSON.stringify({ failed: report.failed || (taste?.failed ?? false),
      violations: report.checked.filter((c) => c.result.verdict === 'VIOLATED').map((c) => ({ rule: c.requirementId, materiality: c.materiality,
        detail: c.result.detail, spans: c.result.spans.map((s) => ({ text: s.text, start: s.start, end: s.end, why: s.why })) })),
      ...(taste ? { taste: taste.verdicts, ...(taste.couldNotRun ? { tasteCouldNotRun: true } : {}) } : {}) })}` };
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
