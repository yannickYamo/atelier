// cli/commands/intake.ts — Reading a folder of work, deciding what is evidence, and sealing it.
//
// Split out of a 1,700-line entry point. The shared ground — session, run transitions,
// the provider factory, host selection — lives in ../runtime.js and is imported, so a
// command file reads as one job rather than as a slice of everything.

import { readdirSync, statSync, existsSync } from 'node:fs';
import { writeAtomic } from '../../core/state/fs-atomic.js';
import { join, resolve, basename, dirname } from 'node:path';
import { planImport, MIN_GOLDEN_CHARS } from '../../core/discovery/chain/corpus-import.js';
import { reserve, type Reservation } from '../../core/golden/reservation.js';
import { describeGoldenEvidence, clusterAssignment, type GoldenUnit } from '../../core/golden/golden-unit.js';
import { adaptSkillFolder, classifyPackagePath, type AdaptedPackage } from '../../core/intake/package.js';
import type { ExpertEvidence } from '../../core/state/canonical-state.js';
import { extract, READABLE, META_NAME } from '../../core/intake/extract.js';

import { sha, die, argv, flag, loadSession, saveSession, step, runFile } from '../runtime.js';

// ── intake ───────────────────────────────────────────────────────────────────────────────────
/**
 * Walk the tree, not just the top level.
 *
 * A skill package is a DIRECTORY — SKILL.md beside templates/ and references/ — and a top-level
 * readdir sees the SKILL.md and none of the rest. So `planImport` selected IMPROVE from one file
 * while the material that journey exists to examine was never opened.
 *
 * Bounded, because "point it at a folder" is one `cd ..` away from reading a home directory: build
 * and VCS output are skipped by name, and depth is capped rather than trusted.
 */
export const WALK_SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.atelier', '.venv', '__pycache__', 'coverage']);
export function walk(root: string, rel = '', depth = 0): string[] {
  if (depth > 4) return [];
  const out: string[] = [];
  for (const name of readdirSync(join(root, rel)).sort()) {
    if (name.startsWith('.') || WALK_SKIP.has(name)) continue;
    const r = rel ? `${rel}/${name}` : name;
    if (statSync(join(root, r)).isDirectory()) out.push(...walk(root, r, depth + 1));
    else out.push(r);
  }
  return out;
}

export function intake(path: string, workType: string): void {
  const dir = resolve(path);
  if (!existsSync(dir)) die(`no such path: ${dir}`);
  // A folder of someone's work usually also contains files that are ABOUT the work. Reading a README as
  // if it were an example produces rules about README-writing, attributed to them. The skip list catches
  // the obvious cases; the printed file list catches everything else, because the only reliable filter
  // is a person looking at what is about to be read.
  const excl = (flag('--exclude') ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  const isDir = statSync(dir).isDirectory();
  const base = isDir ? dir : dirname(dir);
  const all = isDir ? walk(dir) : [basename(dir)];

  // Everything the user pointed at gets one of three fates, and ALL THREE ARE PRINTED. The first
  // version silently kept .md/.txt and dropped the rest, so a folder of PDFs looked identical to an
  // empty folder — the failure a person cannot debug because nothing tells them it happened.
  // basename, because the walk is recursive now: `references/README.md` is still a README, and an
  // anchored pattern stops matching the moment a file acquires a directory in front of it.
  // FILE ROLE DEPENDS ON WHAT IS BEING LEARNED, NOT ON THE FILENAME.
  //
  // A README is "about the work" when the work is essays or analyses. When someone is learning how
  // this author writes DOCUMENTATION, the README is the single most relevant piece in the folder —
  // and the global filename rule threw it away, which is what happened on the first real run against
  // a docs corpus. The remedy printed was "rename the file", which is the product asking the user to
  // work around its own classification.
  // `\b` is defined over [A-Za-z0-9_], so a CJK alternative inside word boundaries can never match:
  // the term was unreachable rather than supported. Matching non-Latin work types needs the boundary
  // dropped for those alternatives, and that is a real change to the classifier rather than a token
  // added to a list, so it is not pretended here.
  const docsWorkType = /\b(doc|docs|documentation|readme|guide|manual|reference|tutorial|writing about)\b/i
    .test(flag('--work-type') ?? '');
  const meta = all.filter((f) => (META_NAME.test(basename(f)) && !docsWorkType) || excl.includes(f));
  const candidates = all.filter((f) => !meta.includes(f)).sort();
  // NOTE: the metadata filter runs before the package is known, so a README inside a skill folder is
  // skipped as "about the work". For a corpus that is right; for a package it undercounts by one.
  // Left as-is rather than reordered — the package is identified from the files we could READ, and
  // moving that identification above the read loop is a larger change than this buys.
  const read: { file: string; text: string; via: string }[] = [];
  const refused: { file: string; reason: string; remedy: string | null }[] = [];
  for (const f of candidates) {
    const r = extract(join(base, f));
    if (r.ok) read.push({ file: f, text: r.text, via: r.via });
    else refused.push({ file: f, reason: r.reason, remedy: r.remedy });
  }

  if (read.length) {
    console.log(`Reading ${read.length} file(s):`);
    for (const r of read) console.log(`  ${r.file.padEnd(34)} ${Math.ceil(r.text.length / 4).toLocaleString().padStart(7)} tok   via ${r.via}`);
  }
  if (meta.length) console.log(`\nSkipped as metadata (they are ABOUT the work, not the work): ${meta.join(', ')}\n  If these ARE the work — you are learning how this author writes documentation — pass --work-type documentation.`);
  if (docsWorkType && all.some((f) => META_NAME.test(basename(f)))) {
    console.log(`\nReading README/CONTRIBUTING as EVIDENCE, not as metadata — you asked for a documentation work type.`);
  }
  if (refused.length) {
    console.log(`\nCould NOT read ${refused.length} file(s):`);
    for (const r of refused) {
      // the PATH, not the basename: the walk is recursive now, and `templates/CLASSIFICATION.md`
      // and `evals/assertions/CLASSIFICATION.yml` both report as "CLASSIFICATION".
      console.log(`  ${r.file}`);
      console.log(`    ${r.reason}`); if (r.remedy) console.log(`    -> ${r.remedy}`);
    }
  }
  if (!read.length) die(`nothing readable in ${dir}. Atelier reads your finished work — the pieces themselves, not notes about them.\n  It reads ${READABLE.join(' ')}.`);

  // THE CHAIN OWNS THE IMPORT. It classifies material, refuses a corpus too thin to validate
  // against, assigns PROPOSAL/HELD_OUT, and writes the summary the user reads — including which
  // JOURNEY this is. A skill present in the folder selects IMPROVE rather than CREATE, and that is
  // a decision the chain already knew how to make.
  //
  // An earlier version of this file split the corpus itself, in run-chain.ts. Two owners of one
  // rule, and the split is the rule everything downstream rests on.
  // CLASSIFY FIRST, THEN APPLY THE GOLDEN BAR TO GOLDENS ONLY.
  //
  // MIN_GOLDEN_CHARS exists so we never infer a standard from a scrap. It has nothing to say about a
  // methodology note or a skill definition, and applying it to everything dropped a 197-character
  // methodology file — material the IMPROVE journey specifically wants.
  //
  // And a fragment is DROPPED, not fatal: planImport refuses any corpus containing a short piece,
  // which is the right rule, but applied to the whole run it lets one stray scrap reject four good
  // examples. The threshold stays the chain's; only the consequence is the product's.
  // ── THE SKILL PACKAGE IS A SUBTREE, AND IT IS NOT MADE OF GOLDENS ──────────────────────────
  //
  // `planImport` has always selected IMPROVE the moment a SKILL.md appears. Nothing read the
  // result, and everything else in the folder fell through to GOLDEN — so pointing Atelier at a
  // real skill directory induced the author's standard from that skill's own templates and
  // quick-reference. Those describe the shape the skill was TOLD to produce. A standard read off
  // them measures the previous instruction and hands it back as the author's judgement.
  //
  // Two layouts are real, and they need different rules because only one of them is unambiguous:
  //
  //   SKILL.md in a SUBDIRECTORY   the whole subtree is the package; goldens live outside it.
  //   SKILL.md at the TOP LEVEL    package membership is by convention (`classifyPackagePath`),
  //                                because a golden sitting beside SKILL.md is indistinguishable
  //                                from one by position alone. An unrecognised file is treated as
  //                                the user's work, never as a component on a guess.
  const skillFile = read.map((r) => r.file).find((f) => /(^|\/)SKILL\.md$/i.test(f));
  const pkgRoot = skillFile === undefined ? null
    : skillFile.includes('/') ? skillFile.slice(0, skillFile.lastIndexOf('/')) : '';
  const relToPkg = (f: string): string => (pkgRoot ? f.slice(pkgRoot.length + 1) : f);
  const inPackage = (f: string): boolean =>
    pkgRoot === null ? false
      : pkgRoot === '' ? classifyPackagePath(f) !== 'UNKNOWN'
        : f === pkgRoot || f.startsWith(`${pkgRoot}/`);

  const pkgFiles = read.filter((r) => inPackage(r.file));
  let pkg: AdaptedPackage | null = null;
  if (pkgRoot !== null) {
    // Unreadable package files still COUNT as components — a .ts we cannot parse is still part of
    // the skill, and reporting the package as if it were only its prose would overstate our reach.
    const allPkgRel = [...pkgFiles.map((r) => r.file), ...refused.map((r) => r.file).filter(inPackage)].map(relToPkg);
    pkg = adaptSkillFolder(pkgRoot === '' ? basename(base) : basename(pkgRoot), allPkgRel);
    console.log(`\n${pkg.summary}`);
  }

  const classify = (f: string) =>
    /(^|\/)SKILL\.md$/i.test(f) ? 'EXISTING_SKILL' as const
    : /methodolog|framework|process|playbook/i.test(basename(f)) ? 'METHODOLOGY' as const
    : /reject|bad|before/i.test(basename(f)) ? 'REJECTED' as const : 'GOLDEN' as const;

  // Package components other than the SKILL.md itself are carried by `pkg`, not by the corpus.
  // `planImport` has no material kind for a template or a reference, and handing it one as a GOLDEN
  // is the defect above; handing it one as METHODOLOGY would inflate a count the user reads.
  const classified = read
    .filter((r) => !inPackage(r.file) || /(^|\/)SKILL\.md$/i.test(r.file))
    .map((r) => ({ ...r, kind: classify(r.file) }));
  const thinGoldens = classified.filter((r) => r.kind === 'GOLDEN' && r.text.trim().length < MIN_GOLDEN_CHARS);
  if (thinGoldens.length) {
    console.log(`\nToo short to read as finished work (${MIN_GOLDEN_CHARS}+ characters), left out:`);
    for (const t of thinGoldens) console.log(`  ${t.file}  (${t.text.trim().length} chars)`);
  }
  const usableRead = classified.filter((r) => !thinGoldens.includes(r));
  if (!usableRead.some((r) => r.kind === 'GOLDEN')) die('no examples of finished work here — every candidate was too short to read as one.');

  const material = usableRead.map((r) => ({ id: r.file, text: r.text, kind: r.kind }));
  const plan = planImport(material);
  console.log(`\n${plan.summary}`);
  if (plan.refusals.length) process.exit(1);
  if (argv.includes('--dry-run')) { console.log('\n--dry-run: nothing sealed.'); return; }

  // id AND path. `planImport` assigns roles by the relative path, and the walk is recursive now, so
  // a golden at `essays/a.md` has id "essays/a.md" while its basename is "a.md". Storing only the
  // path meant discovery looked its goldens up by basename, missed, and fed the proposer empty
  // documents — with nothing to distinguish that from a corpus of blank files.
  const kindOf = new Map(classified.map((c) => [c.file, c.kind]));
  const files = usableRead
    .filter((r) => kindOf.has(r.file))
    .map((r) => ({ id: r.file, path: join(base, r.file), kind: kindOf.get(r.file) }));
  const items = usableRead.map((r) => ({ id: r.file, contentHash: sha(r.text), tokens: Math.ceil(r.text.length / 4) }));
  const corpusHash = sha(items.map((i) => i.contentHash).join('|'));
  // ── THE ONE FIELD DOCUMENTED AS CHANGING EVERY RESULT WAS NEVER ASKED FOR ────────────────────
  //
  // `aiAssisted` carries the comment "declared, never inferred — it changes what any result means",
  // and this line hardcoded it to null for the life of the command. A corpus was sealed, a standard
  // discovered from it, and the author only mentioned afterwards that roughly half the prose was
  // AI-assisted — which is exactly the fact that decides whether "discovered from expert work" means
  // what a reader takes it to mean.
  //
  // NULL REMAINS A VALID STATE and is not treated as false. "Nobody asked" and "the author says no"
  // are different, and a run that quietly recorded the first as the second would let an undeclared
  // corpus be reported as clean. So it is declared here or it stays unknown, loudly.
  const aiAssisted = argv.includes('--ai-assisted') ? true
    : argv.includes('--no-ai-assist') ? false
      : null;
  const ev: ExpertEvidence = { evidenceId: sha(`ev|${corpusHash}`), workType, items, corpusHash, sealedAt: new Date().toISOString(), aiAssisted, published: null };

  if (aiAssisted === null) {
    console.log('\n  provenance UNDECLARED. Nobody has said whether this work was AI-assisted, and it');
    console.log('  changes what a discovered rule means: a pattern found in machine-assisted prose may');
    console.log('  be the assistant\'s habit rather than yours. Ratification still makes the standard');
    console.log('  yours — you approve each rule — but "discovered from your work" is a weaker claim.');
    console.log('  Declare it:  --ai-assisted   or   --no-ai-assist\n');
  } else if (aiAssisted) {
    console.log('\n  provenance: AI-ASSISTED, declared. Recorded on the evidence, and it travels with');
    console.log('  every result derived from this corpus.\n');
  }

  // ── RESERVE BEFORE ANYTHING READS ────────────────────────────────────────────────────────
  //
  // This runs at INTAKE and nowhere else, because a split chosen later is not a holdout. The cost of
  // not doing it is already recorded: a four-artefact corpus produced a ratified standard and left
  // ONE uncontaminated artefact, not because anyone erred but because the validation set was never
  // set aside. By the time anybody looked for one there was no unspent evidence to make it out of.
  //
  // `--reserve` names the goldens held back. With none named nothing is reserved and the run says so
  // — which is a legitimate Level-1 state and must not block onboarding, but must not be silent.
  // THE CLUSTER IS NOT THE FILE. File-as-cluster says every file is its own project, which turns a
  // repository into 200 independent projects and inflates every across-project claim silently. The
  // rule claims a boundary only where one is observable, and says which rule it used.
  const goldenFiles = usableRead.filter((r) => r.kind === 'GOLDEN');
  const clusters = clusterAssignment(goldenFiles.map((r) => r.file), argv.includes('--cluster-per-file'));
  const goldenUnits: GoldenUnit[] = goldenFiles.map((r) => ({
    unitId: r.file, kind: 'PROSE_SECTION', context: workType, task: `produce ${r.file}`,
    expertAction: 'the expert produced this artefact as it stands', artifact: r.text,
    provenance: { sourceRef: join(base, r.file), clusterId: clusters.clusterOf(r.file),
      contextId: r.file, clusterBasis: clusters.basis, consumedBy: [] } }));
  const clusterCount = new Set(goldenUnits.map((u) => u.provenance.clusterId)).size;
  console.log(`\n${goldenUnits.length} piece(s) in ${clusterCount} project cluster(s) [${clusters.basis}]`);
  console.log(`  ${clusters.why}`);
  const reserveIds = (flag('--reserve') ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  let reservation: Reservation | null = null;
  if (reserveIds.length) {
    const unknown = reserveIds.filter((id) => !goldenUnits.some((u) => u.unitId === id));
    if (unknown.length) die(`--reserve names material that is not a golden here: ${unknown.join(', ')}`);
    const r = reserve(goldenUnits, reserveIds, 'ACROSS_CLUSTERS', 0.15);
    if ('refused' in r) { die(`${r.reason}: ${r.why}`); return; }
    reservation = r;
    console.log(`\nRESERVED, before anything read them: ${r.reserved.map((u) => u.unitId).join(', ')}`);
    console.log(`  ${r.why}`);
    console.log(`  ${describeGoldenEvidence(r.reserved, 'ACROSS_CLUSTERS')}`);
  } else {
    console.log(`\nNOTHING RESERVED. Every piece here is available to discovery, so none of it can later`);
    console.log(`  test whether the standard generalises. That is a fine place to start and it is a`);
    console.log(`  decision: pass --reserve <file,file> at intake to hold work back. It cannot be done`);
    console.log(`  afterwards — a split chosen once discovery has read the corpus is not a holdout.`);
  }

  let s = loadSession();
  // The stale-session case, named where a person can act on it. An earlier run left this session
  // mid-flight; the fix is to abandon it, and the command that does so is printed rather than implied.
  if (s.run.state !== 'EMPTY' && s.evidence) {
    // NAME THE COMMAND THAT ACTUALLY CONTINUES IT. This used to offer `atelier status`, which only
    // prints the state and leaves the person exactly where they were. The command that resumes a
    // sealed run is `discover`, and it does resume it.
    const resume: Readonly<Record<string, string>> = {
      CORPUS_SEALED: 'atelier discover',
      LIST_SEALED: 'atelier discover',
      PROPOSED: 'atelier pending',
      RATIFIED: 'atelier build --name <name>'
    };
    const next = resume[s.run.state];
    die(`There is already a run in progress here (state "${s.run.state}", corpus ${s.evidence.corpusHash}).`
      + (next ? `\n  Continue it:  ${next}` : `\n  See where it is:  atelier status`)
      + `\n  Abandon it:   atelier abort    then run this again`);
  }
  s = step(s, 'CORPUS_SEALED', { corpusHash });
  saveSession({ ...s, evidence: ev, reservation });
  writeAtomic(runFile('corpus-paths.json'), JSON.stringify(files, null, 1));
  writeAtomic(runFile('import-plan.json'), JSON.stringify(plan, null, 1));

  // THE SKILL IS BOUND TO THE RUN TOO. An IMPROVE run is a claim about a specific skill, and if that
  // skill changes underneath us the claim silently becomes a claim about something else — the same
  // reason the corpus is hashed. Held separately from the corpus because it is not evidence of the
  // standard; it is the thing being measured against it.
  if (pkg) {
    const pkgText = pkgFiles.map((r) => `${relToPkg(r.file)}\n${r.text}`).join('\n\u0000\n');
    writeAtomic(runFile('skill-package.json'), JSON.stringify({
      ...pkg, root: pkgRoot === '' ? '.' : pkgRoot, absRoot: join(base, pkgRoot ?? ""), packageHash: sha(pkgText),
      readable: pkgFiles.map((r) => relToPkg(r.file)) }, null, 1));
  }

  const tok = items.reduce((n, i) => n + i.tokens, 0);
  console.log(`\nSealed ${items.length} item(s), ~${tok.toLocaleString()} tokens, work type "${workType}".`);
  console.log(`Corpus hash ${corpusHash} — the run is bound to it. Editing these files after this point starts a new run.`);
  if (items.length < 3) console.log(`\nNote: ${items.length} item(s) is thin. A standard induced from very few examples over-generalises, and it cannot tell you that it has.`);
}
