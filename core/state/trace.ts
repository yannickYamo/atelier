// atelier/core/state/trace.ts — WHAT A RUN READ AND WROTE OF THE STORE, FOR THE GUARD THAT EVERY ARTIFACT HAS A READER.
//
// A fix that stopped serving the persona to the writer left it built on every skill and read by nothing on the default
// run, and no test noticed: the tests that guarded its use followed the compiled path. With ATELIER_TRACE_STORE set to a
// file, every store file read and written is appended to it, and so is every top-level field read of the objects read,
// so a test can hold what a build writes against what a default run reads (tests/atelier-consumers.test.ts). Each
// reading asked for is appended too, by its id, whether a model, the code or the floor answered it. Unset,
// nothing here does anything.

import { appendFileSync } from 'node:fs';

const target = (): string | undefined => (process.env.ATELIER_TRACE_STORE?.trim() ? process.env.ATELIER_TRACE_STORE : undefined);
const line = (kind: 'R' | 'W' | 'F' | 'X' | 'C', what: string): void => { const t = target(); if (t) appendFileSync(t, `${kind} ${what}\n`); };

export const traceRead = (path: string): void => { line('R', path); };
export const traceWrite = (path: string): void => { line('W', path); };
/** A reading asked for (core/inference/reading.ts), by its id: so a test can hold every reading to a command that calls it. */
export const traceReading = (id: string): void => { line('X', id); };
/** A model call, by the tool it was asked to answer with ("prose" for none): every call, read through a reading or not. */
export const traceCall = (tool: string | undefined): void => { line('C', tool?.trim() ? tool : 'prose'); };

/** The value, recording each top-level field read of it while tracing; the value itself when not. */
export function traceFields<T>(path: string, value: T): T {
  if (!target() || value === null || typeof value !== 'object' || Array.isArray(value)) return value;
  return new Proxy(value, {
    get(o, k, r) { if (typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k)) line('F', `${path}#${k}`); return Reflect.get(o, k, r); },
  });
}
