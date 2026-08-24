// atelier/core/intake/extract.ts — READ THE WORK, WHATEVER THE USER KEEPS IT IN.
//
// People do not keep their best writing as .md. It is in Word, in PDFs, in exports. The first intake
// accepted `.md` and `.txt` and silently skipped everything else, so a folder of PDFs produced "no
// usable files" and no explanation — the user's whole corpus, invisible, with no way to tell that
// from an empty directory.
//
// ─── ZERO NEW DEPENDENCIES, ON PURPOSE ─────────────────────────────────────────────────────────
//
// This ships as a terminal install next to Claude Code and Codex. The published package has exactly
// one dependency and that is a feature: a document-parsing stack would be the largest thing in it,
// pulled in for a step that runs once per corpus. So:
//
//   .md .txt .markdown   read directly
//   .docx                a ZIP holding word/document.xml — node's zlib is enough
//   .rtf                 control-word stripping; crude, and honest about being crude
//   .pdf                 delegated to `pdftotext` if the box has it
//
// PDF text extraction needs font tables, encodings and content-stream parsing. There is no honest
// 60-line version, so this REFUSES with the exact command to run rather than shipping a bad one or a
// large one. A refusal a user can act on beats a silent skip, and beats a dependency they did not ask
// for.

import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { extname, basename } from 'node:path';

export type Extraction =
  | { readonly ok: true; readonly text: string; readonly via: string }
  | { readonly ok: false; readonly reason: string; readonly remedy: string | null };

export const READABLE = ['.md', '.markdown', '.txt', '.docx', '.rtf', '.pdf'] as const;

/** Files that are ABOUT the work rather than the work. Reading a README yields rules about READMEs. */
/**
 * Anchored to the WHOLE basename, not just its start.
 *
 * With a trailing `\b` this matched `index-fund-analysis.md` — a hyphen is a word boundary — so a
 * user's essay was silently skipped as metadata. Skipping real work is the one error this filter
 * must not make, because the file never appears again and the user is told nothing.
 *
 * Anything the anchor misses is still caught by the printed file list and `--exclude`, which the
 * module header already names as the only reliable filter: a person looking at what is about to be
 * read.
 */
export const META_NAME = /^(readme|license|licence|changelog|contributing|notes?|todo|index|redaction)(\.[a-z0-9]+)?$/i;

export function extract(path: string): Extraction {
  const ext = extname(path).toLowerCase();
  switch (ext) {
    case '.md': case '.markdown': case '.txt':
      return { ok: true, text: readFileSync(path, 'utf8'), via: 'utf8' };
    case '.docx': return extractDocx(path);
    case '.rtf': return { ok: true, text: stripRtf(readFileSync(path, 'utf8')), via: 'rtf (control-word strip — formatting is discarded, and so is anything encoded as a field)' };
    case '.pdf': return extractPdf(path);
    default:
      return { ok: false, reason: `${basename(path)}: ${ext || 'no extension'} is not a format Atelier reads.`,
        remedy: `Convert it to .md or .txt, or use one of ${READABLE.join(' ')}.` };
  }
}

// ─── DOCX ─────────────────────────────────────────────────────────────────────────────────────
//
// A .docx is a ZIP. The prose lives in word/document.xml. Node ships the only hard part (inflate),
// so the rest is walking the central directory — about forty lines, and no supply chain.

function extractDocx(path: string): Extraction {
  try {
    const buf = readFileSync(path);
    const xml = readZipEntry(buf, 'word/document.xml');
    if (!xml) return { ok: false, reason: `${basename(path)}: no word/document.xml inside. Is it really a .docx?`, remedy: 'If it is a .doc (old format), re-save it as .docx.' };
    return { ok: true, text: docxXmlToText(xml.toString('utf8')), via: 'docx (zip + xml, no dependencies)' };
  } catch (e) {
    return { ok: false, reason: `${basename(path)}: could not be read as a .docx — ${(e as Error).message}`, remedy: 'Re-save it from Word, or export to .md.' };
  }
}

/** Minimal ZIP reader: find the entry in the central directory, inflate it. */
function readZipEntry(buf: Buffer, want: string): Buffer | null {
  // End of Central Directory, scanned backwards — it is last and variable-length because of comments.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 65536; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return null;
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);

  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) return null;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const cmtLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');

    if (name === want) {
      // The local header repeats the name/extra lengths and they may differ from the central copy.
      const lNameLen = buf.readUInt16LE(localOff + 26);
      const lExtraLen = buf.readUInt16LE(localOff + 28);
      const start = localOff + 30 + lNameLen + lExtraLen;
      const data = buf.subarray(start, start + compSize);
      return method === 0 ? Buffer.from(data) : inflateRawSync(data);
    }
    p += 46 + nameLen + extraLen + cmtLen;
  }
  return null;
}

/** Paragraphs and breaks become newlines; everything else is markup and goes. */
export function docxXmlToText(xml: string): string {
  return xml
    .replace(/<w:p\b[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n\n')
    .replace(/<w:br\b[^>]*\/?>/g, '\n')
    .replace(/<w:tab\b[^>]*\/?>/g, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ─── RTF ──────────────────────────────────────────────────────────────────────────────────────

/**
 * Destinations whose CONTENT is machinery, not prose. `\*` marks "ignore this group if you do not
 * understand it", which is exactly our situation.
 */
const DROP_DESTINATION = /^\{\\(?:\*|fonttbl|colortbl|stylesheet|info|pict|header|footer|footnote|listtable|rsidtbl|generator|themedata|datastore|xmlnstbl|latentstyles)\b/;

/**
 * Drop machinery groups, keeping their siblings — brace-matched, because RTF nests.
 *
 * The first version did this with `/\{\\\*?[^{}]*\}/g`, intended for `{\*\generator ...}`. That
 * pattern matches ANY brace group with no inner braces — which for an ordinary RTF file is the
 * WHOLE DOCUMENT. `{\rtf1\ansi Hello there.}` returned the empty string.
 *
 * And it failed silently in the worst possible way: `extract` reported ok with empty text, intake
 * measured it against the golden floor, and told the user their file was "too short to read as
 * finished work". It was not too short. We had destroyed it, then blamed it. The bug only hid
 * because a document with nested groups — which every real Word-exported RTF has — kept its outer
 * group and looked fine.
 */
function dropDestinations(rtf: string): string {
  let out = '';
  for (let i = 0; i < rtf.length; i++) {
    if (rtf[i] !== '{') { out += rtf[i]; continue; }
    let depth = 0, j = i;
    for (; j < rtf.length; j++) {
      if (rtf[j] === '\\') { j++; continue; }          // an escaped brace is not a brace
      if (rtf[j] === '{') depth++;
      else if (rtf[j] === '}' && --depth === 0) break;
    }
    if (DROP_DESTINATION.test(rtf.slice(i, j + 1))) { i = j; continue; }
    out += '{';                                        // keep it and descend, so nested groups are seen
  }
  return out;
}

/** Crude and declared as such: drops machinery groups, control words, and hex escapes. */
export function stripRtf(rtf: string): string {
  return dropDestinations(rtf)
    .replace(/\\par[d]?\b/g, '\n')
    .replace(/\\line\b/g, '\n')
    .replace(/\\'[0-9a-fA-F]{2}/g, '')
    .replace(/\\[a-zA-Z]+-?\d*\s?/g, '')
    .replace(/[{}]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ─── PDF ──────────────────────────────────────────────────────────────────────────────────────

/**
 * Delegated, and REFUSED rather than approximated when the tool is absent.
 *
 * `-layout` keeps column and paragraph structure, which matters here: the corpus is being read for
 * how someone writes, and a reflowed wall of text destroys exactly the paragraph rhythm a rule about
 * paragraph rhythm would be inferred from.
 */
function extractPdf(path: string): Extraction {
  try {
    const text = execFileSync('pdftotext', ['-layout', '-enc', 'UTF-8', path, '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (!text.trim()) {
      return { ok: false, reason: `${basename(path)}: pdftotext read it but found no text — it is probably a scan.`,
        remedy: 'Run it through OCR first, or supply the original document.' };
    }
    return { ok: true, text, via: 'pdftotext -layout' };
  } catch {
    return { ok: false,
      reason: `${basename(path)}: reading PDFs needs \`pdftotext\`, which is not on this machine.`,
      remedy: 'Install poppler (macOS: `brew install poppler` · Debian/Ubuntu: `apt install poppler-utils`), or convert the file to .md or .txt. Atelier will not bundle a PDF parser for a step that runs once per corpus.' };
  }
}
