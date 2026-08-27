// atelier/core/state/read-json.ts — A FILE ON DISK IS UNTRUSTED INPUT, INCLUDING OUR OWN.
//
// `JSON.parse(readFileSync(p, 'utf8')) as T` appeared at two dozen sites. The cast is a claim about
// the file that nothing checks, and the two ways it fails are both bad in a way the type checker
// cannot see.
//
// The first is loud but useless: a truncated or hand-edited file throws `SyntaxError: Unexpected end
// of JSON input` with no path in it. Every store read looks alike from a stack trace, so the person
// is told that some file somewhere is broken.
//
// The second is silent, and worse. `JSON.parse("null")`, `"3"` and `"[]"` all succeed. The cast then
// promises an object, every field reads as `undefined`, and the failure surfaces somewhere else
// entirely as a missing hash or an empty requirement list. A run can complete and record a result on
// a store file that was never a valid record.
//
// So the shape is checked at the boundary and the path is in the message. This is deliberately not a
// schema validator: adding one would mean a dependency in a package that has one, and the property
// worth buying cheaply is that the thing we read is the KIND of thing we asked for, named where it
// was read. Field-level truth is still the caller's problem.

import { readFileSync } from 'node:fs';

/** A file exists and is not the kind of thing the reader asked for. */
export class MalformedStoreFile extends Error {}

interface Expect {
  /** `object` rejects null and arrays; `array` rejects everything else. Default `object`. */
  readonly kind?: 'object' | 'array';
  /** Keys the value must carry. Presence only — a caller wanting more should check it itself. */
  readonly requireKeys?: readonly string[];
  /** What this file is, in a person's words, for the error message. */
  readonly what?: string;
}

/**
 * Read and parse a JSON file, refusing anything that is not the shape asked for.
 *
 * Throws `MalformedStoreFile` with the path in the message. Callers that already know what to say to
 * a person should catch it; the CLI's `die` prints the message as-is and it is written to be read.
 */
// The linter is right that `T` appears once and is therefore an unchecked cast wearing a generic.
// That is exactly what it is, and the disable is here rather than a redesign because the alternative
// is returning `unknown` and putting `as T` back at all twenty-four call sites — which is the thing
// this module exists to replace. What the caller buys is the KIND check and the path in the message;
// field-level truth remains theirs, as the header says.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export function readJson<T>(path: string, expect: Expect = {}): T {
  const what = expect.what ?? 'file';
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (e) {
    throw new MalformedStoreFile(`cannot read ${what} at ${path}: ${(e as Error).message}`, { cause: e });
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    // The parser's own message says where in the text, which is the useful half; the path is the
    // half it cannot know. An empty file is called out separately because it is the common case
    // after an interrupted write and reads as a baffling syntax error otherwise.
    const detail = text.trim() === '' ? 'the file is empty' : (e as Error).message;
    throw new MalformedStoreFile(
      `${what} at ${path} is not valid JSON: ${detail}`, { cause: e },
    );
  }

  const kind = expect.kind ?? 'object';
  if (kind === 'array') {
    if (!Array.isArray(value)) {
      throw new MalformedStoreFile(`${what} at ${path} should be a JSON array, found ${describe(value)}.`);
    }
  } else if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    // `null` is the one that used to pass silently and then read as undefined everywhere.
    throw new MalformedStoreFile(`${what} at ${path} should be a JSON object, found ${describe(value)}.`);
  }

  for (const k of expect.requireKeys ?? []) {
    if (!(k in (value as Record<string, unknown>))) {
      throw new MalformedStoreFile(`${what} at ${path} is missing "${k}", so it is not a complete record.`);
    }
  }
  return value as T;
}

/** What was found instead, said in a way that identifies the mistake rather than the type system. */
const describe = (v: unknown): string => {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'an array';
  return `a ${typeof v}`;
};
