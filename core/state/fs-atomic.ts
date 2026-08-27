// atelier/core/state/fs-atomic.ts — A WRITE IS EITHER THE OLD FILE OR THE NEW ONE, NEVER HALF.
//
// Everything in this system is append-only except one pointer, and that property is worth exactly as
// much as the weakest write behind it. `writeFileSync` truncates and then fills: interrupt it between
// those two steps, by Ctrl-C or a crash or a full disk, and what is left on disk is neither version.
//
// The ratification ledger is the acute case, because it is the one artifact whose entire value is that
// it cannot be lost. A standard can be recompiled and a package can be rebuilt. What a person decided,
// and what they were shown at the moment they decided it, cannot be reconstructed afterwards from
// anything else in the store.
//
// rename(2) is atomic within a filesystem, so the reader sees one file or the other and never a
// partial one. The temporary file is created BESIDE the target rather than under the system temp
// directory: a rename across a device boundary is not atomic, it silently degrades to copy-then-
// unlink, and the guarantee this module exists to provide would be gone with no error to notice.
//
// The temp name carries the pid so two processes writing the same path cannot collide on the
// scratch file. They can still race on the rename, and that is the correct outcome: last writer
// wins with a whole file, rather than both writers producing a torn one.

import { mkdirSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';

/**
 * Write `text` to `path` so that a reader at any instant sees either the previous contents or the
 * complete new contents. Creates the parent directory if it does not exist.
 *
 * Use this for every persisted file. `appendFileSync` on a JSONL ledger is a different and
 * acceptable pattern, because an interrupted append damages only the trailing line and the reader
 * is written to survive exactly that (see `readEvents` in `store.ts`).
 */
export function writeAtomic(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = join(dirname(path), `.${basename(path)}.${process.pid}.tmp`);
  try {
    writeFileSync(tmp, text);
    renameSync(tmp, path);
  } catch (e) {
    // The failure being reported is the write. A failure to clean up the scratch file is noise on
    // top of it, and swallowing the original error to report the cleanup would hide the real cause.
    try { unlinkSync(tmp); } catch { /* the write already failed; this is the tidy-up */ }
    throw e;
  }
}
