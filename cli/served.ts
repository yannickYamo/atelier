// cli/served.ts — WHAT A COMPILED PACKAGE SERVES A MODEL, COMPOSED IN ONE PLACE.
//
// `invoke` serves it, `export` writes it out, and the skill card measures it (core/eval/size.ts). Each of those
// composing the text its own way is how a size, an export and a run come to describe three different skills, so
// the composition lives here, takes nothing but the package's files, and reads no store.

/** What a package serves a model: SKILL.md, the example files inlined after it, and the ones a named context left out. */
export interface Composed { readonly servedText: string; readonly servedExamples: string[]; readonly withheld: string[] }

/**
 * THE SERVED TEXT, FROM THE PACKAGE'S FILES ALONE. `resolveServedVersion` checks the store and the delivery around
 * this; the skill card measures the same text without invoking anything (core/eval/size.ts). One composition, so the
 * size a card states is the size of what a run is served. `index: false` leaves the reference index out of SKILL.md
 * (`withoutReferenceIndex`): the export's option, never the run's.
 */
export function composeServed(files: Readonly<Record<string, string>>, context: string, opts: { readonly index?: boolean } = {}): Composed {
  const skillMd = opts.index === false ? withoutReferenceIndex(files['SKILL.md'] ?? '') : files['SKILL.md'] ?? '';
  const ctxFlag = context.toLowerCase();
  const cmap = files['context-map.json']
    ? (JSON.parse(files['context-map.json']) as { serveAll?: boolean; components: { requirementId: string; appliesWhen: string }[] })
    : { components: [] };
  const conditional = new Map(cmap.components.map((c) => [c.requirementId, c.appliesWhen]));
  const exampleFiles = Object.keys(files).filter((f) => f.startsWith('examples/'));
  const withheld: string[] = [];
  const servedExamples = exampleFiles.filter((f) => {
    const id = f.slice('examples/'.length, -'.md'.length);
    const cond = conditional.get(id);
    if (!cond) return true;
    // A package built since moves are served with their examples (`serveAll`) serves every example file when no
    // context is named: each carries its own condition. A named context still narrows to the files it matches.
    if (!ctxFlag && cmap.serveAll) return true;
    if (ctxFlag && cond.toLowerCase().includes(ctxFlag)) return true;
    withheld.push(f); return false;
  });
  // ── A BOUNDARY, BECAUSE THE OLD FRAMING ANSWERED THE WRONG QUESTION ──────────────────────────
  //
  // This block opened with `# How the author works — examples` and said "these are instances, not
  // instructions". That is a statement about AUTHORITY — whether the model must comply. It says
  // nothing about OUTPUT OWNERSHIP, which is what was actually going wrong: the model treated the
  // section as part of the document it was writing and continued it, appending the skill's own
  // requirement text to the user's deliverable in roughly half of generations.
  //
  // So the block is fenced rather than headed, and says what it is FOR rather than only what it is
  // NOT. No heading to continue, and an explicit statement that the deliverable starts after it.
  const exampleBlock = servedExamples.length
    ? `\n\n=== REFERENCE MATERIAL — PRIVATE CONTEXT, NOT PART OF YOUR OUTPUT ===\n\n`
      + `Everything up to the end marker shows how the author works, or how this skill's rules apply\n`
      + `(a "write this, not that" file is model-written, never the author's). It is context for you, never\n`
      + `content for the reader: do not reproduce, continue, quote, enumerate, summarise or mention\n`
      + `any of it unless the user explicitly asks about the skill itself. These are instances rather\n`
      + `than instructions — where one is marked NOT required, an output that does otherwise is not\n`
      + `wrong.\n\n${servedExamples.map((f) => files[f]).join('\n\n- - -\n\n')}`
      + `\n\n=== END REFERENCE MATERIAL — the work you produce begins fresh from here ===`
    : '';
  return { servedText: `${skillMd}${exampleBlock}`, servedExamples, withheld };
}

/**
 * SKILL.md WITHOUT ITS REFERENCE INDEX, for an export. The index names each example file and when it applies, so a
 * host that opens files knows which to open. An export has already inlined every one of those files, each carrying
 * its own condition ("Applies when: …", or "from …" for an instance), so there the index points at files that do
 * not exist beside it and repeats what follows. Only the index section goes: from its heading to the next section
 * or the rule that closes the body. A SKILL.md with no index is returned as it is.
 */
export function withoutReferenceIndex(skillMd: string): string {
  const out: string[] = []; let dropping = false;
  for (const line of skillMd.split('\n')) {
    if (/^## Reference material\s*$/.test(line)) { dropping = true; continue; }
    if (dropping && (line.startsWith('## ') || /^---\s*$/.test(line))) dropping = false;
    if (!dropping) out.push(line);
  }
  return out.join('\n');
}
