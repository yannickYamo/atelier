# Changelog

Notable changes to Atelier. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

This project is pre-1.0. **Until 1.0, a minor version may change the on-disk state format under
`$ATELIER_DATA`.** A standard already minted is content-addressed and readable across such a change;
a run in progress may not be.

## [Unreleased] — targeting 0.2.0

### Added (Phase 8: search the implementation, never the standard)

- **The genome** (`core/optimizer/genome.ts`): everything the compiler derives from a ratified
  standard (each rule's carrier, whether the exemplar and contrast examples ship), with legal
  single-gene mutations taken from each rule's own typed properties.
- **Reflective proposals** (`core/optimizer/reflect.ts`), GEPA's step. A model reads bounded recent
  failures and attempts (SkillOpt's history budget) and chooses among legal changes by number;
  invalid choices are discarded and counted.
- **Pareto selection** (`core/optimizer/pareto.ts`) over the measured rules, with a cheap-model screen
  before the confirmation (successive halving).
- **A veto-only reader** (`core/optimizer/veto.ts`): SSO's instrument with its authority cut to
  blocking. It earns VETO only by agreeing with the owner's own rulings on the rules it reads, beyond
  chance (Cohen's kappa of at least 0.6, with a 95% lower bound of at least 0.4, over 30 rulings, 5 in
  each direction), and never CERTIFY.
- **`atelier optimize`**: propose, build, screen, confirm on the regression floor, and adopt only on
  AUTO_PROMOTE with `--promote`. Rounds are recorded, and `--report` compares the reflective and the
  fixed proposers' keep rates. **`atelier fix --reflect`** runs the same experiment one complaint at a
  time.

### Added (Phase 9: structure, and what keeps going wrong)

- **Position-aware observers** (`core/observers/structure.ts`):
  - `OPENING` and `CLOSING`: phrases the first and last prose paragraph must not use, and a length
    band.
  - `HEADINGS`: tropes, sentence or Title Case, length, and headings per 1,000 words, over a section
    model that ignores the title, code and front matter.
- **The contrast pass proposes edge rules.** Stock openings, closings and heading tropes the author
  never uses are proposed firm where the model's plain drafts use them, and weak otherwise, since
  these often appear only under a voice instruction. It also proposes heading case and opening length.
  On a real 20-post corpus, the heading rule passed every held-out post and flagged three headings in
  an output a reader had called AI-written.
- **`atelier mine`** (`core/mining/recurrence.ts`): recurring gaps, missed rules, rules the draft
  keeps breaking, and repairs refused for changing meaning, each with its remedy. `--add` turns a
  recurring gap into a rule on the owner's word, through the same path as `fix` (now shared in
  `cli/commands/addition.ts`). `--phrase` asks a model to propose a wording.

### Fixed (real end-to-end run on the Addy corpus)

- **`new` lost `--name` on continuation**, and built a skill named after the folder. The class set on
  the first call went to a skill that was never built. The name is now the run's from the first call.
- **Floor margins are never finer than one occurrence** at the author's length. An author who never
  uses a pattern has no spread, and a margin of 0.05 per 1,000 words sat far below the ~0.4 that one
  occurrence is, so no difference could resolve. Re-proposing margins no longer overwrites a role or a
  margin the owner set.
- **Complaints that say the same thing in different words now group.** Mining compares shared content
  words against the shorter complaint (at least two shared) instead of Jaccard, which scored a real
  paraphrase pair 0.22.
- `atelier floor` and `atelier optimize` report the calls and dollars they spent.

### Fixed (final audit)

- **The floor now scores an OPENING or CLOSING rule by what is wrong.** It counts banned phrases plus
  words outside the band. Before, it scored word count, so a short opening with a trope counted as
  "better".
- **A heading can be recased.** Its capitals no longer read as names the rewrite lost, but only for
  a heading case repair; elsewhere names are still compared exactly.
- **An optimizer round that stops leaves nothing pending but its finalists.** Any candidate never
  evaluated blocks nothing. An optimizer's cheap screen is never held against `fix` as if you had
  rejected the move.
- **The edge observers ignore non-prose at the edges.** They read setext headings, keep a `#` that
  belongs to a heading ("Learn C#"), and skip images, footnote definitions and link references.
- **Heading case is read from common words**, not names, acronyms or product words. ALL CAPS reads as
  Title Case.
- **Mining:**
  - Complaints cluster by average link, so unrelated complaints no longer chain together, and
    two-letter words ("em") count.
  - A proposal is matched to its own complaint's timestamp. A wording ever declined is not offered
    again, and neither is a gap a rule was already added for.
  - Drafts are counted on the current standard, with repairs checked.
  - A refused rewrite is charged to the rule it was for.
  - `mine --add` refuses a report made before the standard changed.
  - `--phrase` has one budget.
- **Additions install before they activate**, so a failed install leaves the previous version
  serving.
- **Edge rules count only the drafts they apply to.** An opening and a close with both a trope and a
  length problem send both to be fixed.
- **The reader's kappa must clear a lower confidence bound** as well as its point estimate.

### Fixed (Phase 8 audit)

- Repair memory now judges optimizer retries against the round's first test (a one-draft screen), and
  records the evidence it claims: a move rejected at confirmation or screened out is not re-proposed
  on the same grounds.
- Every candidate a round builds ends settled, untested (a round that stopped), or explicitly waiting
  for a person. `fix` no longer dies on a waiting candidate; it says where to decide it.
- `--cap` is one budget for the whole round, with a call ceiling. A round that runs out stops cleanly
  and is recorded.
- Only a change to a measured rule can install itself. Changes to unmeasured rules, and exemplar or
  examples toggles, are left for a person.
- The screen counts a change only beyond each rule's margin.
- The reader earns VETO by agreeing beyond chance (Cohen's kappa), in both directions, on the
  unmeasured rules it reads.
- Qualification now also requires sensitivity: the floor must catch at least 80% of 20 or more planted
  regressions of two margins. The frozen baseline is part of what a qualification is of.
- Legacy contrast pairs without a check are kept where the passage proves them (and stamped), rather
  than silently dropped.
- "Ship the contrast examples" can be proposed, and toggles are not retried on the same version.
- Reflection's history is the most recent attempts on the rules in play.
- `fix --reflect` falls back to the fixed ordering when repair memory refuses reflection's choice.

### Added (Phase 7: the regression floor, fed and earned)

- **The floor has a producer** (`core/distinctiveness/measured.ts`). Every measured rule is a floor
  dimension, scored by its own observer and oriented so that higher is better.
  - **Margins:** proposed from the author's own spread (half the interquartile range across their
    pieces). `atelier new` proposes them automatically. Every dimension starts OBSERVE.
  - **Verdicts:** tasks are the unit. A per-task three-state verdict (an unscorable enforced dimension
    is INCONCLUSIVE, never "held") and a paired, across-tasks comparison on the repaired rule.
  - **Qualification:** exact Clopper–Pearson false-alarm bounds from accumulating A/A runs.
- **`atelier floor`**: `--corpus`, `--tasks`, `--margin`, `--enforce`, `--observe`, `--baseline`,
  `--qualify`, and `--check <version> [--target] [--promote]`. Changing the contract, tasks or model
  voids the qualification.
- **The gate's automatic path is reachable.** When a count favours the candidate and the floor is
  EARNED, `fix` confirms the count on the floor's tasks, and the promotion gate may install it
  (AUTO_PROMOTE), reject it, or hand it to the person. A promoted version's scores become the next
  baseline.
- **`improve`** reads the floor's real state instead of assuming nothing is earned, and points at
  `atelier floor`.
- Audit remediation:
  - A qualification is a rate of one situation: version, standard, contract, task set, runtime and
    draft count. Any change, a promotion included, voids it.
  - A/A runs compare two fresh halves, so runs are independent; the task is the unit. Before this,
    every run was compared with one frozen baseline, which overstated the evidence roughly tenfold.
  - A variance floor stops sparse counts from resolving a one-margin blip as a proven regression.
  - The repaired rule is left out of the floor's verdict, and at least one other enforced rule must
    hold.
  - A promotion's check scores are not reused as the next baseline.
  - The gate treats a missing floor verdict as unmet.
  - `fix` falls back to a person if the floor run cannot finish.
  - Baselines are refused if they do not cover the tasks or were frozen under another model.
  - Pairs keep their check id, and a pair without one is stale.
  - A candidate built from a package stored before pairs travelled with it still carries them.
  - Margins come only from the author's own (GOLDEN) pieces, and `--corpus` skips reserved pieces.
  - A swapped qualifier may change but not vanish, and the host path passes its swaps.

### Added (Phase 6: more of the standard measured)

- **Proportion observers** (`core/observers/balance.ts`): `TERM_RATE` (a word list per 1,000 words,
  with floors as well as caps), `RATIO` (which of two competing word lists, as a share) and
  `DISTRIBUTION` (the sentence-length mix, as a total-variation distance from a target). Each can be
  declared with `--measure`, and each points a repair at the spans to change.
- **The contrast pass proposes proportions**: competing-word ratios, one floor over the connectives
  the author leans on, one cap over the model's stock vocabulary, and the sentence-length mix. Each
  is proposed only if the author's held-out work meets it and most of the model's drafts fail it. On
  a real 20-post corpus the connective floor passed 5 of 5 held-out posts and failed every AI draft;
  the mix did not separate there, and was not proposed.
- **Rule keys** (`core/state/rule-key.ts`): a rule's identity across versions, derived from what it
  counts (never its threshold) or its statement, and carried through rewording by `amend`. `--rule`
  accepts an id, a key or a number from `atelier plan`; `plan` shows keys; `history` lists which rules
  were added, removed or changed in each version.
- **Write this, not that** (`core/compiler/contrast-examples.ts`): accepted repairs are recorded as
  before/after pairs; `build` ships up to six that still teach the current standard as
  `examples/contrast.md` (`--contrast none` to turn off).
- **docs/MEASURED-RULES.md**: the reference for every observer, its `--measure` syntax, how rules are
  proposed and what the loop guarantees.

### Fixed (Phase 6)

- Audit remediation:
  - A ratio's competing word is now a swap, not a drop: "is not" → "is" is refused as a lost
    negation, while "is not" → "isn't" passes.
  - Runs on held-back tasks (`reference --loop`) no longer record pairs, and `build` skips any pair
    written for, or quoting, a held-back piece.
  - A pair ships only under the same check it was recorded with, and word-counting checks are
    re-counted on the passage.
  - Keys distinguish a floor from a cap, carry a `role` for corpus-picked lists, and are made unique
    within a standard, so a diff reports a removal as a removal.
  - Every contrast proportion must fail at least three in five model drafts.
  - The held-out guard falls back to the read pieces instead of passing vacuously.
  - Mixes never propose negative shares.
  - A mix repair sends no more sentences to a band than it lacks.
  - A ratio counts "it is not" once and suggests the matching counterpart.
  - Candidates carry the exemplar and pairs of the version they are rebuilt from.
  - `fix` now serves candidates, and re-runs the champion, exactly as `invoke` serves them, example
    files included. Before this, the blind A/B compared a champion that saw examples with a candidate
    that did not.
- `build --review` wrote the exemplar (and, since Phase 5, the document class) before stopping. Every
  build-time choice is now held in memory and written only when the build commits.

### Changed (Phase 5)

- **`fix` no longer installs on a count alone.** Its counted decision goes through `resolvePromotion`:
  a count showing the candidate worse rejects it automatically (AUTO_REJECT); a count favouring it is
  HUMAN_GATED (no qualified distinctiveness floor, one generation) and waits for the person's pick. The
  gate's decision is recorded as a `PROMOTION_GATE` event.
  A `--pick` of a candidate the count rejects is refused, and the count's preference is not shown
  until after the blind pick.
- **`verify` now fails invented stories and figures (UNSOURCED) by default.** A pipeline that checks
  a person's own first-person drafts should add their stories and figures to the skill's material
  (`atelier material --skill <name> <file>`) or pass `--allow-unsourced`.
- **The repair loop keeps a pass that fixes a broken rule in fewer places**, not only one that clears
  a rule, so fixing one of two invented figures is progress instead of a discarded pass.

### Added

- **A rewrite may change how something is said, never what it claims** (`core/loop/integrity.ts`).
  Every rewritten span is compared with the one it replaces: figures, negations, qualifiers ("may",
  "most", "roughly"), proper names and earlier `[placeholders]` must survive, except a word the broken
  rule itself named, and the specifics of a flagged invented claim. A failing rewrite is reverted per
  span and listed in the invocation's `repair.integrityReverted`; in Claude Code, where the host holds
  the pen, what was lost is recorded as `repair.meaningLost`.
- **Accuracy before style.** `Requirement.phase` (`add` / `amend --phase ACCURACY|STYLE`); the loop
  repairs ACCURACY rules, and UNSOURCED claims, in their own pass before any STYLE rule.
- **Document class.** `build --class <kind>` / `new --class <kind>` records the kind of document a
  standard measures; `verify`, `invoke` and the MCP `atelier_verify` refuse text declared as another
  kind and say what they assumed when nothing was declared.
- **`verify` and `atelier_verify` run the UNSOURCED check** against the skill's material (plus `--with`,
  or the tool's `material` argument); `--allow-unsourced` turns it off.

- **`atelier new <folder> "<what it is for>"` — the whole journey in one command.** Reserves part of
  the work before anything reads it, discovers, and puts every rule on ONE review screen, strongest
  evidence first, each with a suggested ruling and the reason ("followed in 4 of 5 pieces it never
  read"). Nothing compiles until the person accepts (Enter, or `p3=reject p5=preferred` on the same
  line; `--accept` / `--set` for an assistant relaying the person's answer). Accepting mints, builds
  and installs. Re-entrant: running it again continues from wherever the run stopped.
- **Suggestions from evidence, never decisions** (`core/ratification/suggest.ts`): the purpose sentence
  sets a mode (generate / guard / respond) that moves only the default weight; held-out recurrence and
  cross-vantage agreement set the rest. A conditional rule for a support-style skill is suggested as
  shown, not instructed, unless the evidence is strong — the measured restraint weak spot.
- **Prerequisites have a writer.** Discovery asks what each rule needs from the person; ruling on it
  declares a prerequisite; `invoke` refuses a REQUIRED rule without it, `--with name=file` now sends
  the file's contents, and SKILL.md tells a host to ask rather than invent.
- **`amend --materiality`**: a closed PREFERRED rule can be made REQUIRED (recorded supersession).
- **`<command> --help`, `--version`**, answered before dispatch.
- **The plugin installs**: `/plugin marketplace add yannickYamo/atelier`, `/plugin install atelier@atelier`.

- **Measured rules** (`core/observers/`): deterministic observers whose verdict is a fact about the
  text — banned words and substitution lists (LEXICON), sentence length, paragraph length, hedging —
  each returning the exact spans that broke the rule. Discovery counts the measurable part of the
  corpus and proposes it on the review screen with how many of the author's own pieces meet it,
  including a stock-phrase ban built only from phrases the author never uses. `add --measure` lets an
  author declare one on their own rule. A measured rule is tested by a count, never a reader, and its
  target is stated in SKILL.md.
- **`atelier verify --skill <name> <file>`** (or stdin, `--json`): any text against every measured
  rule, with spans; exits 1 on a broken REQUIRED rule. After `atelier new` builds, the measured rules
  are checked for free against the pieces held back.
- **A census for dark fields**: every optional Requirement field must have a writer on a reachable path.

- **Generate, check, repair** (`core/loop/`): every `invoke` counts the draft against each measured
  rule and rewrites ONLY the spans that break a REQUIRED one (sentence-grown, spliced back
  deterministically, at most two passes); a rewrite that breaks anything that held is discarded. The
  record keeps what the model first wrote and what changed. `--no-repair` opts out.
- **The same loop in Claude Code**: the plugin's Stop hook counts the answer and, once, sends it back
  with only the spans to rewrite (verified live against a real Claude Code session).
- **`atelier mcp`**: the checker as MCP tools (`atelier_verify`, `atelier_rules`,
  `atelier_list_skills`), registered by the plugin; read-only, no model called.
- **`fix` decides by count when the rule is measured**: a candidate implementation is kept only if it
  meets the moved rule where the current one did not and breaks nothing that held; recorded as a
  DETERMINISTIC observation. Only ties go to a person.
- **Exemplar carrier**: `build --exemplar <file>` ships one complete piece of the owner's, read first
  for voice and never for content; carried through every rebuild; a reserved piece is refused.

- **The proof study, drafted** (`studies/PROOF_STUDY_PREREGISTRATION.md`, DRAFT until the owner seals
  it): recall of discovery against the owner's hand-built house standard as a sealed answer key
  (`scripts/recall-sheet.mts`, which refuses to open the key before discovery has finished), the
  shipped loop against a model's own guide (`atelier reference --loop`), and a deterministic
  measured-rule table per arm, whole piece and first vs last third (`scripts/measured-conformance.mts`).

- **What the model does that the author doesn't** (`core/observers/style.ts`, `contrast.ts`): discovery
  has the serving model write plain drafts on the author's own topics and counts named constructions in
  both — em dashes, spaced hyphens, "not X, it's Y", "That's"/"Here's" openers, signposting,
  intensifiers, short verdicts, bold, one-line paragraphs, repeated openers, fragment share — proposing
  caps and floors from wide gaps (and caps on model-typical constructions the author almost never uses),
  each only if the author's held-out work passes it; plus a Burrows' Delta style distance. Found by the
  owner reading a skill's output: the author uses no em dashes in 20 posts; the skill used 7.3 per 1,000.
- **A voice may not invent the person's life or numbers** (`core/loop/claims.ts`): a first-person story
  or a figure presented as a finding, not supported by the person's material, is repaired into a
  placeholder. `atelier material` keeps what they vouch for per skill; `--allow-unsourced` opts out.
- **`invoke --drafts N`**: several drafts, the one with the fewest REQUIRED breaks (then the best style
  margin) delivered, recorded as a selection.

### Changed (product phases, 2026-09-26)

- **The discovery split scales with the corpus**: about a third held out (capped at 8), everything
  else read up to a one-pass token cap, overflow named. It was two pieces proposed, whatever the size.
- **Discovery, `reference` and `contract` run calls concurrently**, with the budget reserving in-flight
  estimates. `contract` prints each case as it lands and resumes from a progress file; `reference`
  isolates a failed arm and reports every comparison that could not run instead of discarding all six.
- **`check` verifies the models discovery actually runs**; every diagnosing command resolves its model
  through one function.
- The review, `pending` and coverage views read discovery's grouping and held-out recurrence, which
  were computed and then dropped.

### Removed (product phases, 2026-09-26)

- **The taste-discovery ladder** (priority fold, blueprint assembly, the dark discrimination channel,
  the methodology fold and the method-registry class): reachable only through `import type`, never
  executed, and capped at ADVISORY by construction. Evidence to weight now runs through the review
  screen's suggestion and the person's ruling.

### Fixed (product phases, 2026-09-26)

- **Rejected rules shipped inside the installed skill.** Installs were additive; the directory is now
  exactly the package, and `inspect` fails on any file the package does not name. Nothing Atelier did
  not write is ever deleted: it is moved to `.atelier-backups/` and named.
- `--reserve a --reserve b` kept only `b`; a single-valued option given twice is now refused.
- `abort --help` aborted the run; `discover --help` spent budget.
- A re-entered `fix`/`improve` complaint lost its record in a bare `catch`.
- `npm run build` left the linked binary non-executable, silently breaking every hook.
- A `/skill` use from a subdirectory was dropped; `fix` in a subdirectory found nothing.
- The ratification ledger is kept beside the standard it produced and shown by `history`.
- `ANTHROPIC_AUTH_TOKEN` is accepted.
- A second `ratify-close` on a standard you wrote yourself asked for `--work-type` again.

### Added (earlier in this release)

- **`atelier fix` — one correction path.** A complaint goes in; Atelier resolves the latest
  recorded use (and says which), diagnoses, and either repairs the implementation — one lateral
  carrier candidate, the same task re-run, a blinded A/B, one keystroke, the winner active AND
  installed with the StandardVersion hash asserted immovable — or, on a standard gap, asks the one
  authority question (add as required / preferred / don't) and an approval mints, compiles and
  installs the superseding StandardVersion in the same motion. The pick lands in the judgement
  ledger and as the first BEHAVIOR-domain observation; a refusal is remembered and not re-asked.
- **A `/skill` use in Claude Code becomes a canonical invocation record.** The plugin's prompt/stop
  hooks pipe the host's own payloads into a hidden `atelier record`; delivery is checked against the
  store at the moment of use, the model is read from the transcript or recorded UNREPORTED, and
  `last-invocation.json` is what lets `fix` need no id from anyone. Core stays host-agnostic: the
  surface value is HOST_PLUGIN, and which host lives in the runtime binding.
- **Grounded direct authority.** The front door persists exactly the proposal it showed; `--yes`
  ratifies those bytes with zero further model calls. A rule becomes EXPERT_AUTHORED only when its
  normative content is mechanically grounded in the person's own text (verbatim span, content words,
  numbers) — the model's `faithful` flag is display evidence, never an authority input.
- **One canonical authority function.** Every surface — batch ratify, ratify-one, add, the front
  door, amend, confirm, fix — assigns authority through `decide()`, which validates obligations and
  enforces the public-source ceiling on every path; amend and confirm now leave ledger records.
  Writing its ceiling test caught the first draft laundering provenance through AMEND.
- **A hint census.** Every `atelier …` line the CLI or plugin skills print must name a dispatched
  command and declared flags. Its first run caught a live typo in the dispatcher's own help.

### Changed

- **Undeclared materiality is source-aware.** A rule the person WROTE instructs with no
  questionnaire; a discovered rule they merely approved is SHOWN until they declare how much it
  matters. The close prints instructs/shown per rule by calling the compiler, so the text cannot
  disagree with the build again. Materiality remains semantic metadata and never selects a carrier.
- **Repair memory is (standard, model)-scoped.** A carrier move rejected under one model never
  suppresses the same move under another; a superseding StandardVersion inherits no verdicts; a
  human TRANSITION_FORBIDDEN holds across runtimes but not across standard versions. The repair
  primitive is lateral replacement under a fixed, recorded ordering — carriers are mechanisms, not
  strengths, which the carrier study demonstrated.
- **`promote` installs.** Adopting a candidate leaves the store, the pointer and the host's bytes
  agreeing, or refuses without moving anything. "Your skill is ready." prints only over a package
  that instructs something; a DRAFT preview says so and names the next step.

### Fixed

- **A build could compile a standard the user never ratified.** The run in flight was per-project;
  the files it produced were not. `pending-standard.json` and nine other working files sat at the
  store root, so two projects sharing one store overwrote each other's pending standard and `build`
  in one project installed — and stamped as ratified — the standard the other had just closed.
  Working files now live under `runs/<project>/`, keyed exactly as the session is, and `build`
  refuses a pending standard whose hash is not the one this run ratified. Files left at the root by
  an older version are adopted only when the store holds a single run, which is the one case where
  their owner is unambiguous.
- **`--skill ../../elsewhere` read from, and wrote to, a directory outside the store.** `build`
  normalised names; the read-side commands (`inspect`, `history`, `rollback`, `feedback`, and
  eleven others) joined `--skill` onto `skills/` as given. Every `--skill` is now validated against
  the same rule `build --name` applies, refused rather than normalised, and the store layout itself
  rejects a name that would leave `skills/`.
- **A rule the person typed was silently dropped.** `add` numbered rules from the length of
  `decided`; a batch `ADD` numbered from a counter that restarted at 1 on every call; the front door
  numbered from the model's list position. All three minted `x1`, and `ratify-close` keys the
  standard by id, so the later rule replaced the earlier one while the CLI reported "2 kept". One
  allocator now hands out the successor of the highest `x<n>` anywhere in the run.
- **After its first build, a project was a dead end; `abort` made it permanent.** Adding a rule after
  `build` and closing again was refused as STANDARD_MUTATED with the advice to `abort`; `abort`
  marked the run terminal and left it in place, and nothing ever started a new run. Closing again
  now mints a version that records what it supersedes (and requires `--reason`, as every
  supersession does), `RATIFIED -> RATIFIED` is a legal transition for that purpose, and `abort`
  archives the session under `sessions/aborted/` so the next command starts clean. `build` also
  advances the run before it writes anything: a refused build used to install the skill and move the
  active pointer, then exit 1.

- **The skill emitted its own internals into the user's deliverable.** Example bodies were rendered
  with markdown headings (`# p6`, `## How the author did it`) and served under another heading.
  Served to a model as context, a heading is not a label — it is a document structure, and the model
  continued it: the answer finished and the skill's requirement text was appended underneath. Measured
  on 74 generations of a blind study, 31 outputs carried a literal `# pN` line and 10 reproduced a
  served example verbatim; the arm carrying one extra example did it 59% of the time against 29%.
  The framing sentence said "these are instances, not instructions", which settles AUTHORITY and says
  nothing about OUTPUT OWNERSHIP. Labels are now bracketed, the block is fenced with explicit start
  and end markers, and it states that the deliverable begins after it. Zero leaks in 8 live
  invocations afterwards.
- **A truncated generation was reported as the model's failure.** The Anthropic adapter read
  `stop_reason` only to interpolate into an error string, so a call the model was never allowed to
  finish surfaced as "the schema was not satisfied". Termination is now a provider-neutral value
  normalised at the adapter boundary, and an incomplete generation raises a typed error carrying it.
  A study built on this misattribution had to withdraw a published figure.
- **The contract runner was provisioned at a fifth of what the work needs.** `maxTokens` was
  hardcoded to 1200 against a measured 6606-token median for a bare answer, and completeness was
  inferred from the text — which cannot distinguish "the model chose not to" from "the model was cut
  off". The budget now comes from a probe that is REFUSED if anything in it was itself truncated: an
  estimate drawn from a censored sample is not a measurement.
- **Discovery discarded a completed run.** Proposals were saved AFTER an optional methodology check
  whose own comment says a failure there "must not cost the taste run that already succeeded and was
  paid for" — and the read that threw sat one line above that try. A stale file left in the global
  store by an unrelated project killed a fresh run after 39 held-out checks and lost all 13
  proposals. What is paid for is now written before anything optional runs.
- **A missing observation became evidence against a rule.** The discovery observer read
  `j?.applicable === true`, which is indistinguishable from a confident NO when the object never
  arrived, and its 500-token budget truncated in practice. Silent false negatives, in the direction
  that under-reports the author's own patterns. The free-text field is bounded at the schema, the
  budget has real headroom, and an unusable answer now refuses.
- **A rule the author wrote was described to the model as one nobody had confirmed.** The
  self-check section asserted "NO ONE HAS CONFIRMED yet" over everything in it, but the section is
  defined by ROLE and confirmation is a different property — so a confirmed PREFERRED requirement
  could be introduced as an unconfirmed guess the model must not act on. The preamble is now derived
  from what is actually in the section.
- **`build` with no standard printed a raw ENOENT and an absolute store path.** It now names both
  routes to a standard, which is what someone who has simply not minted one yet needs.

### Added

- **Corpus provenance is declared or loudly unknown.** `aiAssisted` carries the comment "declared,
  never inferred — it changes what any result means" and was hardcoded to `null`, so the one field
  documented as changing every downstream result was never asked for. Intake now takes
  `--ai-assisted` / `--no-ai-assist` and, absent either, says at seal time what is weaker about an
  undeclared corpus. `null` is kept as a state and never collapsed into `false`.
- **Repair memory is bounded and kept off the executor.** History informs proposals; what was tried
  on the way to a skill is not part of the skill. Under a budget, PROMOTIONS are dropped before
  rejections — a promotion is already encoded in the artifact, a rejection exists nowhere else — and
  nothing is truncated silently.

### Fixed (earlier)

- **The clustered confidence interval was 26% too narrow at n=3**, the smallest sample it admits and
  the most common one. A second t-table keyed from df=3 fell back to t(3)=3.182 where t(2)=4.303 is
  correct, so an interval that honestly crosses zero was reported as a decided direction — and that
  moves `REGRESSED` and `IMPROVED` verdicts. `compare()` compounded it by dividing by one table's
  value and multiplying by another's for the same quantile.
- **The t distribution had two implementations**, byte-identical across ninety lines, one of which
  declared itself the sole owner. They had already drifted at the exact site the project documents as
  repaired. Both now import `core/stats/t.ts`.
- **`assertNotAuthority` did not refuse the claims it exists to refuse.** It ANDed its regex with a
  substring test whose tokens were `this`, `this` and `promotion`, so it fired only on claims
  containing the stopword. Its own test passed vacuously.
- **A PREFERRED requirement could fail the primary endpoint**, which its own documentation forbids,
  because the unscorable-push happened one branch before the REQUIRED guard.
- **`getArchitecture` returned null after any amend of a confirmed rule**, and the caller read that as
  "never persisted" and silently recompiled the default arrangement. Ambiguity now refuses.
- **`--required-n 0`, `--questions abc` and `--cap abc` were silently replaced by defaults**, the same
  `Number(x) || fallback` bug the runtime documents a fix for, reintroduced in a file that imports it.
- **A mistyped command exited 0.** `atelier discovr` printed help and reported success, so a script
  could run a typo in a loop and never learn the work had not happened.
- **The post-build screen asked the author to re-confirm rules they had already decided.** An optional
  standard parameter was passed by neither caller, so the filter fell back to selecting on carrier —
  which is the shape of a TOLERATED component, not an unconfirmed prohibition.
- A regex alternative that could never match (`\b` is defined over ASCII word characters, so a CJK
  term inside word boundaries was unreachable rather than supported).

- **A candidate measured worse was authorised for promotion.** `decide()` had no `REGRESSED` branch,
  so a comparison that found the candidate worse fell through to the promotion gates on the same
  terms as one that found it better. `REJECT` was declared in the terminal union and returned from
  nowhere, which is what a missing branch looks like from outside the file.
- **`core/compiler/placement.ts` was a binary file.** A sentinel written as a raw `0x00` rather than
  the escape `'\0'` made `grep -r` skip all 249 lines without saying so, and made the diff
  unrenderable. Same value, two visible characters, and the reason for the sentinel is now written
  down.
- **The plugin told every user to install a package that does not exist** (`atelier-cli`), on
  `SessionStart`, as the first thing a user with a missing binary reads.
- **`npm run typecheck` failed on a clean checkout** while `npm test` was green, because the build
  config excludes `tests/` and vitest does not typecheck. CI's first step was red.

## [0.1.0]

First public release. The pipeline runs end to end: read a corpus, propose candidate requirements
anchored to the spans they came from, rule on each one, mint an immutable `StandardVersion`, compile
it to an installable skill, serve it with the bytes recorded, and improve the implementation under a
frozen standard.

### Added

- **Acquisition** with the corpus sealed by hash, a proposer that never sees what it is scored
  against, multi-vantage discovery, and every candidate carrying a verbatim span or being dropped.
- **Per-requirement ratification** as the only path to authority, on an append-only ledger that
  records what was shown as well as what was decided.
- **Content-addressed identities** for evidence, standard, architecture, skill, runtime binding and
  invocation, with the standard's hash excluding the model.
- **Compilation** to five carriers by a deterministic function of the ratified fields, with the gate
  role derived from authority rather than chosen.
- **Delivery proof** at the byte and at the wire: the served package is re-hashed before spend, and
  the structured-output schema handed to the provider is hashed against the compiled contract.
- **A convergence loop** that improves the implementation under a fixed standard, routes complaints
  to one of four causes, and stops rather than writing a rule the expert has not ratified.
- **A held-out reference test** with two-phase blinding and a side assignment derived from a hash, so
  it is fixed before generation and auditable afterwards.
- **A baseline arm set** as an enum rather than a flag, so a comparison cannot silently omit the arm
  most likely to win, sealed with the pairs by `armSetHash`.
- **`BUILDER_VIEWED`**, the one consumption recordable against the reserve, so a held-out unit the
  builder has read is refused at audit instead of counted clean.
- **Atomic writes** for every persisted file, and a ledger reader that reports a torn tail while
  refusing to read past corruption in the middle.
- **Multi-provider support**: Anthropic and any OpenAI-compatible backend, with five conformance
  probes including one whose pass condition is a thrown error.

### Known limits

- The expert-ratified effectiveness claim is **not established**. See the evidence section of the
  README, including a preregistered null reported unrepaired.
- Autonomous promotion is reachable in code and unreachable in fact: no gate has been earned, so the
  loop routes to a person.
- Behavioural equality across runtime bindings is unshown; only object portability is demonstrated.

[Unreleased]: https://github.com/yannickYamo/atelier/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/yannickYamo/atelier/releases/tag/v0.1.0
