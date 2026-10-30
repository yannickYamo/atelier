// atelier/core/measurement/permission.ts — WHAT AN INSTRUMENT HAS EARNED.
//
// Lifted into the shipped package from the research observer in the private predecessor, where it sat
// beside a parked research instrument. The VOCABULARY is product-side — the aggregation layer needs
// it to say what an observation is worth — while the instrument that failed to earn anything stays
// in research. Moving the type rather than re-declaring it keeps one owner.
//
// Nothing currently holds VETO or CERTIFY. v1 and v2 were not qualified; v3's construct was not
// established. The enum exists so that when something does earn a permission there is somewhere for
// it to be recorded, and so that "unqualified" is a value rather than an absence.

/** OBSERVE authorises nothing; it reports. VETO may block. CERTIFY may clear. */
export type ObserverPermission = 'OBSERVE' | 'VETO' | 'CERTIFY';

/** The default, and today the only honest value for every instrument in this system. */
export const UNQUALIFIED: readonly ObserverPermission[] = ['OBSERVE'];
