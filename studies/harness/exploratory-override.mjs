// studies/harness/exploratory-override.mjs — THE BUILDER'S MATERIALITY OVERRIDE, IN THE OPEN.
//
// Mints the StandardVersion for the exploratory endpoint by re-ratifying the nine rules the
// external reviewer marked PREFERRED as REQUIRED. The reviewer did NOT make this ruling; the
// builder did, over the orchestrating assistant's recorded objection, and the supersession reason
// below says so. Every step is a shipped core function — decide(), the compiler, the renderer,
// the store — so the act is auditable, not hand-edited.
import { authorityStateOf, assertSupersessionRecorded } from '../../dist/core/state/canonical-state.js';
import { compileArchitecture, roleFor } from '../../dist/core/architecture/compile.js';
import { renderAgentSkill, assertPortable } from '../../dist/renderers/agent-skill/render.js';
import * as store from '../../dist/core/state/store.js';
import { decide } from '../../dist/core/ratification/authority.js';
import { draftHash, appendDecision, stampVersion } from '../../dist/core/ratification/decision-record.js';
import { ClaudeCodeAdapter } from '../../dist/adapters/claude-code/adapter.js';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';

const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);
const L = { root: `${homedir()}/.atelier`, skillName: 'reviewer-voice' };
const PREV = '6c32949758c91780';
const RAISED = ['p1', 'p2', 'p4', 'p5', 'p9', 'p10', 'p13', 'p16', 'p17'];
const REASON =
  'BUILDER OVERRIDE, exploratory endpoint only: the nine rules the external reviewer ruled '
  + 'PREFERRED on 2026-09-04 are re-ratified REQUIRED by the BUILDER, who is not the standard\'s '
  + 'owner, on the builder\'s interpretation of the reviewer\'s informal debrief ("required felt '
  + 'too absolute; their preferred means require"). The reviewer has not ruled REQUIRED on any of '
  + 'them. The orchestrating assistant objected on the record (see '
  + 'studies/EXPLORATORY_OVERRIDE_ENDPOINT.md). No result on this standard is a confirmatory claim.';

const prev = store.getStandard(L, PREV);
if (!prev) throw new Error('standard not found');
const decisions = [];
const requirements = prev.requirements.map((r) => {
  if (!RAISED.includes(r.requirementId)) return r;
  const out = decide(r, { verb: 'APPROVE', materiality: 'REQUIRED' });
  decisions.push({ shown: r, outcome: out });
  return out.requirement;
});
const body = { evidenceId: prev.evidenceId, workType: prev.workType, requirements };
const minted = { standardVersionHash: sha(JSON.stringify(body)), ...body,
  authorityState: authorityStateOf(requirements), mintedAt: new Date().toISOString(),
  supersedes: prev.standardVersionHash, reason: REASON };
assertSupersessionRecorded(minted);
const existing = store.getStandard(L, minted.standardVersionHash);
const next = existing ?? minted;

const activeHash = store.getActive(L);
const sv = store.getSkillVersion(L, activeHash);
const arch = compileArchitecture(next);
const pkg = renderAgentSkill(next, arch, 'reviewer-voice', sv.description ?? 'exploratory override build');
assertPortable(pkg);
const skill = { skillVersionHash: sha(`${arch.architectureHash}|${pkg.packageHash}`), skillName: 'reviewer-voice',
  standardVersionHash: next.standardVersionHash, architectureHash: arch.architectureHash,
  materializedHash: pkg.packageHash, builtAt: new Date().toISOString(), description: sv.description };
store.putStandard(L, next); store.putSkillVersion(L, skill); store.putArchitecture(L, arch);
store.putPackage(L, pkg); store.setActive(L, skill.skillVersionHash);
const inst = new ClaudeCodeAdapter().install(pkg, `${homedir()}/atelier-b2-study`);
if (!inst.ok) throw new Error(`install failed: ${inst.reason}`);

let ledger = { standardDraftHash: draftHash(decisions.map((d) => d.shown)), records: [] };
for (const d of decisions) {
  ledger = appendDecision(ledger, d.shown, d.outcome.ledgerDecision,
    { note: REASON, decidedAt: next.mintedAt });
}
ledger = stampVersion(ledger, next.standardVersionHash);
for (const rec of ledger.records) store.appendEvent(L, { kind: 'LEDGER_DECISION', record: rec, at: next.mintedAt });

const roles = requirements.map((r) => `${r.requirementId}:${roleFor(r)}`).join(' ');
console.log(`S2 ${next.standardVersionHash} supersedes ${prev.standardVersionHash}${existing ? ' (already existed, reused)' : ''}`);
console.log(`skillVersion ${skill.skillVersionHash} arch ${arch.architectureHash} pkg ${pkg.packageHash} installed=${inst.ok}`);
console.log(roles);
