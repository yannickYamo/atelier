// tests/harper-engine.ts — WHETHER THE REAL GRAMMAR ENGINE CAN LOAD HERE, PROBED ONCE PER TEST FILE.
//
// harper.js is an optional dependency, so a checkout without it is a supported install and its suite must be green.
// Most of the suite never needs it: the binary and the in-process code read grammar through the fixed stub
// (vitest.config.ts sets ATELIER_GRAMMAR=stub). The tests that read text with harper itself, in process or through
// the binary with ATELIER_GRAMMAR=on, assert harper's own findings ("He are" → "is", "cosy" kept), which no stand-in
// can make honestly: those are skipped, by name, when the engine cannot load, and run in full wherever it can.
import { describe, it } from 'vitest';

export const harperInstalled: boolean = await Promise.all([import('harper.js'), import('harper.js/binary')]).then(() => true, () => false);
export const NO_HARPER = 'harper.js is not installed (an optional dependency): the tests that need the real grammar engine are skipped';
if (!harperInstalled) console.warn(`skipped: ${NO_HARPER}`);

/** A block that reads text with the real engine: skipped, hooks and all, when it cannot load. */
export const describeWithEngine = describe.skipIf(!harperInstalled);
/** One test that reads text with the real engine, beside others in its block that do not. */
export const itWithEngine = it.skipIf(!harperInstalled);
