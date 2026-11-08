// atelier/renderers/agent-skill/host.ts — THE SKILL A HOST LOADS: THE AUTHOR'S PIECES, METHOD AND RULES, NOT A DESCRIPTION OF THEM.
//
// A host (Claude Code's /skill) hands SKILL.md to its own model as instructions. Served that way, the description of how
// the author sounds and the moves read off their pieces were rules the writer followed in place of the voice: measured on
// `atelier run`, which stopped serving them (cli/direct.ts). The installed skill follows the same design: the pieces, the
// method and the rules the author stated reach the host; how they sound is read on the piece afterwards
// (core/direct/style.ts), never told to the writer. The stored package is unchanged: the compiled path serves it whole.

/**
 * SKILL.md without the description of the author: the "How I sound" points and the repertoire of moves. Each block is a
 * header line ending in a colon and the list that follows it, joined by one blank line, so both go. A skill with
 * neither is returned as it is.
 */
export function withoutPersonaBlocks(skillMd: string): string {
  const blocks = skillMd.split('\n\n'); const out: string[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (/^(?:How I sound \(|Moves I make in some pieces, not most \()/.test(b)) { if (b.trimEnd().endsWith(':') && i + 1 < blocks.length && blocks[i + 1].startsWith('- ')) i += 1; continue; }
    out.push(b);
  }
  return out.join('\n\n');
}

/** SKILL.md without the moves read off the pieces ("## Moves I sometimes make"): rules the author never stated. */
export function withoutMovesSection(skillMd: string): string {
  return skillMd.split(/\n(?=## )/).filter((s) => !/^## Moves I sometimes make\s*$/m.test(s.split('\n')[0] ?? '')).join('\n');
}

/** The files a host is given: the package's, with SKILL.md as the direct writer is served. */
export function hostFiles(files: Readonly<Record<string, string>>): Record<string, string> {
  const md = files['SKILL.md'];
  return md === undefined ? { ...files } : { ...files, 'SKILL.md': withoutMovesSection(withoutPersonaBlocks(md)) };
}
