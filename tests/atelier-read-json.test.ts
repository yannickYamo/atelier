// tests/atelier-read-json.test.ts — THE SILENT FAILURE IS THE ONE WORTH TESTING.
//
// `JSON.parse(text) as T` fails two ways. The loud one throws a SyntaxError with no path in it, so
// every store read in the product reports the same sentence and the person is told that some file
// somewhere is broken. The quiet one is worse: `null`, `3` and `[]` all parse successfully, the cast
// then promises an object, and every field reads as `undefined` somewhere far from the file that
// caused it. A run can finish and record a result against a record that was never valid.
//
// So the assertions below are mostly about values that USED TO PARSE. A test that only covers
// malformed text would pass against the code this replaced.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readJson, MalformedStoreFile } from '../core/state/read-json.js';

const roots: string[] = [];
const fileWith = (text: string, name = 'x.json'): string => {
  const d = mkdtempSync(join(tmpdir(), 'atelier-readjson-'));
  roots.push(d);
  const p = join(d, name);
  writeFileSync(p, text);
  return p;
};
afterEach(() => { roots.splice(0).forEach((d) => { rmSync(d, { recursive: true, force: true }); }); });

describe('what a valid file does', () => {
  it('returns the parsed object', () => {
    expect(readJson(fileWith('{"a":1}'))).toEqual({ a: 1 });
  });

  it('returns an array when an array is what was asked for', () => {
    expect(readJson(fileWith('[1,2]'), { kind: 'array' })).toEqual([1, 2]);
  });

  it('accepts a record carrying every required key', () => {
    expect(readJson(fileWith('{"run":1,"decided":[]}'), { requireKeys: ['run', 'decided'] }))
      .toEqual({ run: 1, decided: [] });
  });
});

describe('the values that used to parse and then read as undefined', () => {
  it('refuses null, which is the one that cost the most', () => {
    // JSON.parse("null") succeeds. The cast then promised an object and every field was undefined.
    expect(() => readJson(fileWith('null'))).toThrow(MalformedStoreFile);
    expect(() => readJson(fileWith('null'))).toThrow(/found null/);
  });

  it('refuses a bare number and a bare string', () => {
    expect(() => readJson(fileWith('3'))).toThrow(/found a number/);
    expect(() => readJson(fileWith('"hello"'))).toThrow(/found a string/);
  });

  it('refuses an array where a record was expected', () => {
    expect(() => readJson(fileWith('[]'))).toThrow(/found an array/);
  });

  it('refuses a record where an array was expected', () => {
    expect(() => readJson(fileWith('{}'), { kind: 'array' })).toThrow(/should be a JSON array/);
  });

  it('refuses a record that is missing a key the caller depends on', () => {
    expect(() => readJson(fileWith('{"run":1}'), { requireKeys: ['run', 'decided'] }))
      .toThrow(/missing "decided"/);
  });
});

describe('what the message tells a person', () => {
  it('names the path, which the raw SyntaxError never did', () => {
    const p = fileWith('{"a":');
    expect(() => readJson(p)).toThrow(new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });

  it('names what the file was, not just that a file was wrong', () => {
    expect(() => readJson(fileWith('null'), { what: 'a StandardVersion' }))
      .toThrow(/a StandardVersion/);
  });

  it('calls an empty file empty, because it reads as a baffling syntax error otherwise', () => {
    // The common case after an interrupted write. "Unexpected end of JSON input" does not say so.
    expect(() => readJson(fileWith(''))).toThrow(/the file is empty/);
    expect(() => readJson(fileWith('   \n'))).toThrow(/the file is empty/);
  });

  it('keeps the parser detail for a genuine syntax error', () => {
    expect(() => readJson(fileWith('{"a": }'))).toThrow(/is not valid JSON/);
  });

  it('reports a missing file as unreadable rather than as bad JSON', () => {
    expect(() => readJson('/definitely/not/here.json', { what: 'a SkillVersion' }))
      .toThrow(/cannot read a SkillVersion/);
  });

  it('is always a MalformedStoreFile, so a caller can catch one class', () => {
    for (const text of ['', 'null', '3', '[]', '{"a":']) {
      expect(() => readJson(fileWith(text)), text).toThrow(MalformedStoreFile);
    }
  });
});

describe('the store reads through it', () => {
  // Asserts a property of the shipped tree, not of the helper.
  const walk = (dir: string): string[] => {
    return readdirSync(dir).flatMap((e) => {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) return e === 'node_modules' ? [] : walk(p);
      return /\.m?ts$/.test(p) ? [p] : [];
    });
  };

  it('no shipped module parses a file it just read without checking the shape', () => {
    const offenders = ['core', 'cli', 'renderers', 'adapters', 'providers']
      .flatMap(walk)
      .filter((f) => f !== join('core', 'state', 'read-json.ts'))
      .filter((f) => /JSON\.parse\(\s*readFileSync/.test(
        readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''),
      ));
    expect(offenders, `use readJson from core/state/read-json.ts:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('the census can see the tree it is policing', () => {
    expect(['core', 'cli'].flatMap(walk).length).toBeGreaterThan(80);
  });
});
