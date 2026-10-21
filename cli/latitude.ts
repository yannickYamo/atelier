// cli/latitude.ts — THE LATITUDE OF A SKILL AT ITS BUILD, AND OF ONE RUN.
//
// At the build: the owner's `--latitude`, or the reading of their examples, method and purpose (core/observers/latitude.ts),
// kept in the run until the close mints it into the standard; said in one line with how to change it. A continuation
// keeps what was read. At a run: the skill's level, tightened by the request where the reading quotes the request.

import { DATA, argv, flag, loadSession, saveSession, canReach, contextReaderClient, contextReaderModel } from './runtime.js';
import * as store from '../core/state/store.js';
import { readContext } from '../core/inference/reading.js';
import { LATITUDE, REQUEST_LATITUDE, parseLatitude, type LatitudeInput } from '../core/observers/latitude.js';
import type { Latitude, LatitudeLevel, StandardVersion } from '../core/state/canonical-state.js';
import { latitudeOf } from '../core/state/canonical-state.js';

const noModel = (): boolean => argv.includes('--no-model') || process.env.ATELIER_BUILD_NO_MODEL === '1' || !canReach('discovery');

/**
 * The level this build mints. `--latitude` is the owner's and decides; a value it cannot read is said and the reading
 * decides instead (a mistyped flag never stops a build). Kept in the run, so a continuation does not read again.
 */
export async function settleLatitude(input: LatitudeInput): Promise<Latitude> {
  const s = loadSession();
  const asked = flag('--latitude');
  const owned = parseLatitude(asked);
  if (asked !== undefined && !owned) console.log(`(--latitude takes strict, grounded or creative; "${asked}" is none of them, so the level is read from your work.)`);
  let lat: Latitude;
  // THE OWNER'S LEVEL OUTLIVES THE RUN THAT SET IT: the skill built again keeps it (a level read by a model is read again).
  const set = builtStandard(s.skillName)?.latitude;
  if (owned) lat = { level: owned, evidence: [], by: 'owner' };
  else if (s.latitude) return s.latitude;
  else if (set?.by === 'owner') lat = set;
  else {
    const off = noModel();
    const d = await readContext(LATITUDE, input, off ? null : contextReaderClient(), off ? null : contextReaderModel(), { spentUsd: 0, capUsd: 0.05, maxCalls: 1 });
    lat = { level: d.value.level, evidence: d.value.evidence, by: d.by === 'model' ? 'model' : 'floor' };
    // A READER THAT CANNOT BE REACHED IS NOT ASKED AGAIN THIS BUILD (as cli/commands/build.ts does for the work form).
    if (d.by === 'floor' && d.why?.startsWith('the reader could not be asked')) process.env.ATELIER_BUILD_NO_MODEL = '1';
  }
  saveSession({ ...loadSession(), latitude: lat });
  return lat;
}

/** The standard the skill of this name is built on now, or null before its first build. */
export function builtStandard(skillName: string | null | undefined): StandardVersion | null {
  if (!skillName) return null;
  const L = { root: DATA, skillName }; const active = store.getActive(L);
  const sv = active ? store.getSkillVersion(L, active) : null;
  return sv ? store.getStandard(L, sv.standardVersionHash) : null;
}

/** The unmeasured-rules choice the owner typed, if any. */
export const unmeasuredSaid = (): 'accept' | 'review' | undefined => {
  const u = flag('--unmeasured')?.trim().toLowerCase();
  return u === 'accept' || u === 'review' ? u : undefined;
};

/** The one line the build screen says about the latitude, and how to change it. */
export function latitudeLine(v: Pick<StandardVersion, 'latitude' | 'acceptedUnmeasured'>): string {
  const lat = v.latitude;
  const level = latitudeOf(v);
  const from = !lat || lat.by === 'floor' ? 'the default' : lat.by === 'owner' ? 'as you set it' : `read from "${lat.evidence[0] ?? ''}"`;
  const accepted = v.acceptedUnmeasured?.length ?? 0;
  return `Latitude: ${level.toLowerCase()}, ${from}${accepted ? `; ${accepted} unmeasured rule${accepted === 1 ? '' : 's'} accepted (listed, not sent to review)` : ''}. `
    + 'Change: --latitude strict|grounded|creative, --unmeasured accept|review; or atelier amend --latitude <level>.';
}

/** The level one run was held at: the skill's, the run's, the request's words that tightened it, and who decided. */
export interface RunLatitude { readonly skill: LatitudeLevel; readonly level: LatitudeLevel; readonly quote: string | null; readonly by: string }

/** The level one run is held at: the skill's, tightened by the request where the reading quotes it. Never looser. */
export async function runLatitude(std: Pick<StandardVersion, 'latitude'> | null, request: string, model: string | null): Promise<RunLatitude> {
  const skill = latitudeOf(std);
  const d = await readContext(REQUEST_LATITUDE, { level: skill, request }, model ? contextReaderClient() : null, model, { spentUsd: 0, capUsd: 0.02, maxCalls: 1 }, 'context judge');
  return { skill, level: d.value.level, quote: d.value.quote, by: d.by };
}
