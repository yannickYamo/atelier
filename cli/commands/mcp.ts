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

import { createInterface } from 'node:readline';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as store from '../../core/state/store.js';
import { verifyText, describeVerify } from '../../core/observers/verify.js';
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
  { name: 'atelier_verify', description: 'Check a text against every measured rule of an Atelier skill. Returns each violation with the exact span; failed=true when a REQUIRED rule is broken. Rewrite only the spans it names.',
    inputSchema: { type: 'object', properties: { skill: { type: 'string' }, text: { type: 'string' } }, required: ['skill', 'text'], additionalProperties: false } },
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

const call = (name: string, args: Record<string, unknown>): { text: string; isError: boolean } => {
  if (name === 'atelier_list_skills') {
    const dir = join(DATA, 'skills');
    const names = existsSync(dir) ? readdirSync(dir).filter((n) => store.getActive({ root: DATA, skillName: n })) : [];
    const rows = names.map((n) => {
      const L: store.StoreLayout = { root: DATA, skillName: n };
      const sv = store.getSkillVersion(L, store.getActive(L) ?? '');
      return `${n}  —  ${sv?.description ?? ''}`;
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
    const report = verifyText(skill, standardOf(skill), text);
    return { isError: false, text: `${describeVerify(report)}\n\n${JSON.stringify({ failed: report.failed,
      violations: report.checked.filter((c) => c.result.verdict === 'VIOLATED').map((c) => ({ rule: c.requirementId, materiality: c.materiality,
        detail: c.result.detail, spans: c.result.spans.map((s) => ({ text: s.text, start: s.start, end: s.end, why: s.why })) })) })}` };
  }
  throw new Error(`unknown tool "${name}"`);
};

export async function mcp(): Promise<void> {
  const send = (msg: unknown): void => { process.stdout.write(`${JSON.stringify(msg)}\n`); };
  const rl = createInterface({ input: process.stdin });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let req: Rpc;
    try { req = JSON.parse(line) as Rpc; } catch { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }); continue; }
    if (req.id === undefined || req.id === null) continue;              // a notification: nothing to answer
    const reply = (result: unknown): void => { send({ jsonrpc: '2.0', id: req.id, result }); };
    try {
      switch (req.method) {
        case 'initialize':
          reply({ protocolVersion: typeof req.params?.protocolVersion === 'string' ? req.params.protocolVersion : '2025-06-18',
            capabilities: { tools: {} }, serverInfo: { name: 'atelier', version: version() } });
          break;
        case 'ping': reply({}); break;
        case 'tools/list': reply({ tools: TOOLS }); break;
        case 'tools/call': {
          const name = typeof req.params?.name === 'string' ? req.params.name : '';
          const args = (req.params?.arguments ?? {}) as Record<string, unknown>;
          try {
            const r = call(name, args);
            reply({ content: [{ type: 'text', text: r.text }], isError: r.isError });
          } catch (e) {
            reply({ content: [{ type: 'text', text: (e as Error).message }], isError: true });
          }
          break;
        }
        default: send({ jsonrpc: '2.0', id: req.id, error: { code: -32601, message: `method not found: ${req.method}` } });
      }
    } catch (e) {
      send({ jsonrpc: '2.0', id: req.id, error: { code: -32603, message: (e as Error).message } });
    }
  }
}
