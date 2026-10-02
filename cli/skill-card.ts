// cli/skill-card.ts — THE SKILL'S EVALUATION CARD, BUILT FROM WHAT THE SKILL VERSION HOLDS.
//
// Called at the end of `build` (so at the end of `atelier new … --accept`), stored once per skill version, and
// read back by `atelier report --skill` and the MCP tool. Every line comes from the stored standard, profile,
// release and instruments: nothing here runs a model or estimates anything new.

import * as store from '../core/state/store.js';
import * as fstore from '../core/state/fidelity-store.js';
import { putSkillCard, getSkillCard } from '../core/state/eval-store.js';
import { isGeneralScope } from '../core/state/canonical-state.js';
import { QUALIFIED_READERS } from '../core/loop/claim-extract.js';
import { featureOf, LAYER_LABEL } from '../core/observers/features.js';
import { FORMATS } from '../core/observers/formats.js';
import { tasteRules } from '../core/taste/reader.js';
import { tastePermissions } from '../core/taste/calibration.js';
import { claimSensorFor } from './checks.js';
import { readerModel } from './commands/taste.js';
import type { SkillCard } from '../core/eval/skill-card.js';

/** The card for the skill's active version (or `skillVersion`), built from its stored state and stored once. */
export function skillCardFor(L: store.StoreLayout, opts: { heldBack?: number; skillVersion?: string } = {}): SkillCard | null {
  const sv = opts.skillVersion ?? store.getActive(L);
  const version = sv ? store.getSkillVersion(L, sv) : null;
  const std = version ? store.getStandard(L, version.standardVersionHash) : null;
  if (!sv || !version || !std) return null;
  const stored = getSkillCard(L, sv);
  if (stored) return stored;
  const live = std.requirements.filter((q) => q.authority !== 'EXPERT_REJECTED' && q.materiality !== 'INCIDENTAL');
  const evidence = store.getEvidence(L);
  // The claim check as it would run now: instrument, qualification and the rates it was measured at.
  const sensor = claimSensorFor('', '', false);
  const measured = sensor.version ? QUALIFIED_READERS.find((r) => r.version === sensor.version && r.measured)?.measured ?? null : null;
  const cls = store.getDocClass(L);
  const answers = cls ? (FORMATS as Record<string, { claims?: string } | undefined>)[cls]?.claims === 'list' : false;
  const active = fstore.getActiveRelease(L)?.release ?? null;
  const profile = active?.profileHash ? fstore.getProfile(L, active.profileHash) : fstore.getProfile(L);
  const pooled = profile?.bands.filter((b) => b.cls === 'all') ?? [];
  const layers = new Map<string, { steering: number; monitored: number }>();
  for (const b of pooled) {
    const layer = LAYER_LABEL[featureOf(b.id)?.layer ?? 1];
    const x = layers.get(layer) ?? { steering: 0, monitored: 0 };
    layers.set(layer, b.role === 'MONITOR' ? { ...x, monitored: x.monitored + 1 } : { ...x, steering: x.steering + 1 });
  }
  const qual = profile ? fstore.getQualification(L, profile.hash) : null;
  const rulesRead = tasteRules(std);
  const perms = rulesRead.length ? tastePermissions(rulesRead, store.readEvents(L), readerModel()) : null;
  const card: SkillCard = {
    schema: 1, skill: L.skillName, skillVersion: sv, standardVersion: std.standardVersionHash, builtAt: new Date().toISOString(),
    corpus: evidence ? { pieces: evidence.items.length, heldBack: opts.heldBack ?? 0 } : null,
    rules: {
      total: live.length, required: live.filter((q) => q.materiality === 'REQUIRED').length,
      counted: live.filter((q) => q.measurement).length, read: live.filter((q) => !q.measurement).length,
      conditional: live.filter((q) => !isGeneralScope(q.appliesWhen)).length,
      needsMaterial: live.filter((q) => q.prerequisites?.length).length,
    },
    claims: { instrument: sensor.instrument, qualified: sensor.qualified, answers,
      measured: measured ? { caught: measured.caught, planted: measured.planted, leftAlone: measured.leftAlone, clean: measured.clean, on: measured.on } : null },
    fidelity: profile ? {
      profile: profile.hash, features: pooled.length, steering: pooled.filter((b) => b.role !== 'MONITOR').length,
      layers: [...layers].map(([layer, x]) => ({ layer, ...x })),
      classes: [...new Set(profile.bands.map((b) => b.cls).filter((c) => c !== 'all'))],
      baseline: profile.baseline ?? null, operators: Boolean(profile.effects),
      detector: profile.detector ? { families: profile.detector.families ?? [], cvAuc: profile.detector.cvAuc,
        qualified: qual?.instruments.find((i) => i.kind === 'detector')?.result.passes ?? null } : null,
    } : null,
    release: active ? { id: active.id, drafts: active.settings.drafts, editBudget: active.settings.editBudget, retrievalK: active.settings.retrievalK,
      notesCap: active.settings.notesCap, loop: active.settings.editBudget > 0 || Boolean(active.settings.diversity) } : null,
    taste: rulesRead.length ? { rules: rulesRead.length, validated: (perms?.veto.size ?? 0) > 0, labelled: perms?.pooled.trials ?? 0 } : null,
    notMeasured: [
      rulesRead.length ? 'the reading-based rules, until the taste reader is validated by your labels' : 'argument, stance and content',
      profile ? `voice beyond the ${pooled.length} counted features` : 'your range (built without a corpus: no profile)',
      ...(profile?.detector ? ['whether the detector holds for model families it was not trained on'] : []),
    ],
    next: [`atelier invoke --skill ${L.skillName} "<task>"`, `atelier report <run>`, `atelier rate <run> yes|no`, `atelier eval --skill ${L.skillName}`,
      ...(profile ? [`atelier qualify --skill ${L.skillName}`] : []), ...(rulesRead.length ? [`atelier taste --skill ${L.skillName} --calibrate`] : [])],
  };
  putSkillCard(L, card);
  return card;
}
