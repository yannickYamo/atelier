// atelier/core/state/trace.ts — WHAT A RUN READ AND WROTE OF THE STORE, FOR THE GUARD THAT EVERY ARTIFACT HAS A READER.
//
// A fix that stopped serving the persona to the writer left it built on every skill and read by nothing on the default
// run, and no test noticed: the tests that guarded its use followed the compiled path. With ATELIER_TRACE_STORE set to a
// file, every store file read and written is appended to it, and so is every top-level field read of the objects read,
// so a test can hold what a build writes against what a default run reads (tests/atelier-consumers.test.ts). Unset,
// nothing here does anything.

import { appendFileSync } from 'node:fs';

const target = (): string | undefined => (process.env.ATELIER_TRACE_STORE?.trim() ? process.env.ATELIER_TRACE_STORE : undefined);
const line = (kind: 'R' | 'W' | 'F', what: string): void => { const t = target(); if (t) appendFileSync(t, `${kind} ${what}\n`); };

export const traceRead = (path: string): void => { line('R', path); };
export const traceWrite = (path: string): void => { line('W', path); };

/** The value, recording each top-level field read of it while tracing; the value itself when not. */
export function traceFields<T>(path: string, value: T): T {
  if (!target() || value === null || typeof value !== 'object' || Array.isArray(value)) return value;
  return new Proxy(value, {
    get(o, k, r) { if (typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k)) line('F', `${path}#${k}`); return Reflect.get(o, k, r); },
  });
}
