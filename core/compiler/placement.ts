// atelier/core/compiler/placement.ts — WHERE A COMPILED REQUIREMENT PHYSICALLY LANDS.
//
// PORTED IN LAW from the carrier adapter in the private predecessor. The law is:
//
//   **a compiler may only write to a carrier the serving path reads.**
//
// and the structure that enforces it — an adapter pairs "how to write it" with "how to prove the
// host can see it", in ONE object, because an adapter that can write but cannot prove reachability
// is precisely how the original defect happened.
//
// ─── THE DEFECT THE ORIGINAL EXISTS TO CLOSE, AND WHY IT RECURS HERE ───────────────────────────
//
// Its skill writer compiled a ratified rule into an edit and appended it to `SKILL.md`. On the skill
// where this was measured the selector read `references/{methodology,insights}.md` by declared anchor
// and `SKILL.md` contributed **0%**. A correct compile, correctly applied, produced a change the
// model could never see — and every measurement of it was a measurement of nothing.
//
// That defect is not specific to that system, and this is the load-bearing reason the module is here. A
// Claude Code skill has the SAME shape with the polarity reversed: `SKILL.md` is what the host
// loads, and everything under `references/` is DARK until `SKILL.md` points at it. So writing a
// requirement into a reference file without a pointer is the identical failure in the user's own
// host — installed, invisible, and indistinguishable from a behavioural miss.
//
// ─── WHY THE TWO ORIGINAL ADAPTERS ARE NOT PORTED ──────────────────────────────────────────────
//
// The original states "nothing here is pricing-specific", and about pricing it is right. It is not
// host-generic: both adapters hardcode that application's own skill directory layout, its compiled
// capability registry, and the prebuild step that regenerates it. Those paths and that mechanism are
// one private application's serving path. A user installing Atelier beside Claude Code has neither,
// so porting the instances would emit edits to files that do not exist while the probe attested
// reachability.
//
// So: the TYPE and the LAW port; the two instances are rewritten for the layouts Atelier actually
// installs beside — the same layouts `intake/package.ts` already classifies.
//
// ─── CARRIER AND KIND ARE DIFFERENT QUESTIONS, AND STAY THAT WAY ───────────────────────────────
//
// The original keys adapters off `Carrier`. Here they key off `ComponentKind`, because for a foreign
// package the two questions genuinely differ: Atelier's Carrier says HOW a rule is expressed (an
// instruction while writing, a check against the draft), and ComponentKind says WHERE it may live (a
// methodology file, a template, a reference). Collapsing them would make a fourth owner of a
// property that already has three too many.

import type { ComponentKind } from '../intake/package.js';

/** A concrete, reviewable file change. The adapter decides the bytes; it never applies them. */
export interface PlacementEdit {
  /** package-relative path the change lands in */
  readonly path: string;
  /** verbatim text to find. Empty string = an insertion rather than a replacement. */
  readonly find: string;
  readonly replace: string;
  /** why this is the right physical location, for the human reviewing standard fidelity */
  readonly rationale: string;
}

export interface PlacementRequest {
  readonly requirementId: string;
  /** the text being compiled in */
  readonly requirementText: string;
  /** package-relative path of the component being edited */
  readonly path: string;
  /** current bytes of that file, so the adapter can anchor precisely */
  readonly currentContent: string;
  /** current bytes of the package's SKILL.md — the host's entry point, needed to prove reachability */
  readonly entryContent: string;
}

export interface Reachability { readonly reachable: boolean; readonly why: string }

/**
 * A placement adapter.
 *
 * `reachabilityProbe` is the load-bearing half: given the post-edit content it answers *"can the
 * host see this?"* — not "did we write it". Refusing any adapter whose probe fails makes the
 * dark-content class of defect unrepresentable rather than merely discouraged.
 */
export interface PlacementAdapter {
  readonly kind: ComponentKind;
  readonly id: string;
  readonly plan: (req: PlacementRequest) => { ok: true; edit: PlacementEdit } | { ok: false; reason: string };
  readonly reachabilityProbe: (postEditContent: string, req: PlacementRequest) => Reachability;
  /**
   * Companion changes this edit needs elsewhere to become servable. Returned so a HALF-materialized
   * change can be refused: it would look installed and serve nothing.
   */
  readonly companionDeclarations: (req: PlacementRequest) => readonly string[];
}

/**
 * The heading a rule gets, derived from what the rule SAYS.
 *
 * The first version derived it from the requirement id, which in this product is `p1`, `p2`, `p3` —
 * so improving a user's skill appended four sections titled "## P1" through "## P4" to a file they
 * wrote themselves. Reviewable in the sense that the bytes are visible, and unreadable in every way
 * that matters: the headings name our internal counters and say nothing about the rules.
 *
 * The id still identifies the rule; it goes on the provenance line, where a reader who wants it can
 * find it and everyone else is not made to read it.
 */
export function titleFrom(req: { requirementId: string; requirementText: string }): string {
  const first = req.requirementText.trim().split(/(?<=[.!?])\s|\n/)[0] ?? '';
  const clean = first.replace(/\s+/g, ' ').replace(/[.:;,]+$/, '').trim();
  if (!clean) return req.requirementId;
  if (clean.length <= 68) return clean;
  // cut on a word boundary rather than mid-word — a heading ending "unnecessa" reads as damage
  const cut = clean.slice(0, 68);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 40))}…`;
}

/** The one marker that says which parts of a user's file Atelier is responsible for. */
export const PROVENANCE_PREFIX = '_Added by Atelier from your own examples';

/**
 * The bytes one rule contributes.
 *
 * Every added section carries the provenance line, because this is someone else's file. Without it a
 * user cannot tell six months later which paragraphs they wrote and which a tool appended, and the
 * only safe response to that is to distrust the whole file.
 */
function sectionFor(req: PlacementRequest, title: string): string {
  const gap = req.currentContent.endsWith('\n') ? '\n' : '\n\n';
  // A one-sentence rule becomes its own heading, and repeating it as the body underneath says the
  // same thing twice in a file the user has to read. Heading-only is the honest rendering there.
  const body = title === req.requirementText.trim().replace(/[.:;,]+$/, '') ? '' : `${req.requirementText}\n\n`;
  return `${gap}## ${title}\n\n${body}${PROVENANCE_PREFIX} · \`${req.requirementId}\`. Delete this section to remove the rule._\n`;
}

const hasHeading = (text: string, title: string): boolean =>
  text.split('\n').some((l) => /^#{2,3}\s/.test(l) && l.replace(/^#{2,3}\s+/, '').trim().toLowerCase() === title.toLowerCase());

// ── adapter 1: a section in SKILL.md ──────────────────────────────────────────────────────────

/**
 * Writes a `## Heading` section into the skill's entry point.
 *
 * Reachability is trivially satisfiable here and the probe still runs, because "trivially true" and
 * "asserted true" differ exactly when someone later changes what the host loads. The probe checks
 * the heading actually parses — an edit that mangles it produces a section the host renders as body
 * text of whatever came before.
 */
export const SkillMdSection: PlacementAdapter = {
  kind: 'skill_methodology',
  id: 'skill-md-section',

  plan: (req) => {
    const title = titleFrom(req);
    if (hasHeading(req.currentContent, title)) {
      return { ok: false, reason: `"${title}" already exists as a section — adding a second one would give the rule two statements that can drift apart` };
    }
    return { ok: true, edit: {
      path: req.path, find: '', replace: sectionFor(req, title),
      rationale: 'the entry point the host loads for every invocation, so a rule here is read on every run',
    } };
  },

  reachabilityProbe: (post, req) => {
    const title = titleFrom(req);
    return hasHeading(post, title)
      ? { reachable: true, why: `"${title}" parses as a heading in the file the host always loads` }
      : { reachable: false, why: 'no heading produced — the text would be read as part of the preceding section' };
  },

  companionDeclarations: () => [],
};

// ── adapter 2: a reference document ───────────────────────────────────────────────────────────

/**
 * Writes into a `references/` document.
 *
 * THIS IS THE ADAPTER THE LAW EXISTS FOR. A reference file is loaded only when the entry point
 * points at it, so the edit is inert on its own and the probe reads the ENTRY, not the file it just
 * wrote. That inversion is the whole point: probing the file you edited always says yes.
 */
export const ReferenceDoc: PlacementAdapter = {
  kind: 'knowledge_unit',
  id: 'reference-doc',

  plan: (req) => {
    const title = titleFrom(req);
    if (hasHeading(req.currentContent, title)) {
      return { ok: false, reason: `"${title}" already exists in ${req.path}` };
    }
    return { ok: true, edit: {
      path: req.path, find: '', replace: sectionFor(req, title),
      rationale: 'a reference document, which keeps the entry point short — at the cost of needing a pointer to it',
    } };
  },

  reachabilityProbe: (_post, req) => {
    // Deliberately ignores the post-edit content of the file being written.
    const named = req.entryContent.includes(req.path)
      || req.entryContent.includes(req.path.split('/').pop() ?? ' ');
    return named
      ? { reachable: true, why: `the entry point names ${req.path}, so the host will load it` }
      : { reachable: false, why: `nothing in SKILL.md points at ${req.path} — the host never loads it, so this rule would be installed and dark` };
  },

  companionDeclarations: (req) =>
    req.entryContent.includes(req.path) ? [] : [`SKILL.md: link ${req.path} so the host loads it — without this the rule is written and never read`],
};

export const ADAPTERS: readonly PlacementAdapter[] = [SkillMdSection, ReferenceDoc];

/** Adapter for a kind, or null. A kind with no adapter cannot be compiled to — say so loudly. */
export const adapterFor = (k: ComponentKind): PlacementAdapter | null =>
  ADAPTERS.find((a) => a.kind === k) ?? null;

/**
 * Apply one edit to content. THE ONE OWNER of what an edit means.
 *
 * `planPlacement` computes the post-edit content to run its probe against, and the applier writes
 * the same bytes to disk. If those two disagreed by so much as a newline, the probe would be
 * attesting reachability for content that never landed — which is the failure this whole module is
 * about, arriving one level down.
 *
 * `find: ''` is an append, matching the adapters' insertion form.
 */
export function applyEdit(content: string, edit: PlacementEdit): string {
  return edit.find === '' ? content + edit.replace : content.replace(edit.find, edit.replace);
}

export type PlacementResult =
  | { readonly ok: true; readonly edit: PlacementEdit; readonly reachability: Reachability; readonly companions: readonly string[] }
  | { readonly ok: false; readonly reason: string };

/**
 * Plan one placement and REFUSE it unless the host can reach the result.
 *
 * Applying the edit to compute the post-edit content is what makes the probe mean anything: a probe
 * against the pre-edit file answers a question nobody asked — and it uses the same `applyEdit` the
 * writer does, so the probe cannot attest content the disk never receives.
 */
export function planPlacement(kind: ComponentKind, req: PlacementRequest): PlacementResult {
  const adapter = adapterFor(kind);
  if (!adapter) return { ok: false, reason: `no adapter for ${kind} — Atelier will not write to a carrier it cannot prove the host reads` };

  const planned = adapter.plan(req);
  if (!planned.ok) return { ok: false, reason: planned.reason };

  const post = applyEdit(req.currentContent, planned.edit);

  const reachability = adapter.reachabilityProbe(post, req);
  if (!reachability.reachable) {
    return { ok: false, reason: `${reachability.why}. Refusing: a change the host cannot see is indistinguishable from a change that did not work.` };
  }
  return { ok: true, edit: planned.edit, reachability, companions: adapter.companionDeclarations(req) };
}
