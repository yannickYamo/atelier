# Roadmap

**What is next, why, and what is deliberately not being built. Each item names the problem it solves.**

## Now

Both items are tests, not features, and each result is published whichever way it comes out.

- **Voice, read blind by people.** An independent reviewer runs the sealed study
  ([B6](../studies/B6_PREREGISTRATION.md)) on their own corpora: plain prompting, pasted examples, and
  Atelier with and without the loop. Until it is in, voice is not claimed.
- **A head-to-head with GEPA and SkillOpt.** The same tasks, writer and budget for every arm, a sealed test
  split, and two scores: the benchmark's own judge and Atelier's standard. The kit is in
  [bench/compare](https://github.com/yannickYamo/atelier/tree/main/bench/compare).

## Next: easier to install and to use where work happens

In this order, each one usable on its own.

1. **npm and one-command setup.** `npx @yannickyamo/atelier setup` finds the coding agents in a project and
   gives each the Atelier MCP server; `npm install -g @yannickyamo/atelier` replaces clone, build and link.
   Built; it ships with the next tagged release.
2. **A check on pull requests.** `atelier verify` as a GitHub Action on docs, release notes and changelogs:
   a broken REQUIRED rule fails the check, and the run's panel is the comment.
3. **Ready-made standards.** A few public standards (a changelog, a code review, a support reply), each with
   its skill card and one command to install it, from authors who agreed to be listed.
4. **A standard shared by a team.** One approved standard, used by everyone on the team and checked in CI.

Also next:

- **The voice layer, measured.** Transfer between registers and the in-context voice pass are built and off
  by default ([decision 0009](decisions/0009-voice-below-the-standard.md)). They stay off until a blind read
  by people says the pass helps.
- **The implicit layer needs a new actuator.** A sealed study found every arm still told apart from the author's unseen
  pieces, and plan-first generation did not help ([INDISTINGUISHABILITY_RESULT](../studies/INDISTINGUISHABILITY_RESULT.md)).
  Its blind human read is prepared and waits for readers. Every output now carries how typical of you it is, and
  `atelier fidelity --typicality` tests a run against your pieces, so the next attempt has a measure to be held to.
  Holding drafts to your range on the request's subject (`--context local`) was tested offline and told your pieces
  from the model's no better ([CONTEXT_BANDS_RESULT](../studies/CONTEXT_BANDS_RESULT.md)); it stays opt-in.
  The machine reading now has a floor: an author's own pieces are told from each other at AUC 0.72 to 0.81 at those
  sizes ([AUTHOR_FLOOR_RESULT](../studies/AUTHOR_FLOOR_RESULT.md)), so a later arm is read against that, not 0.5.
- **Three small studies, in order, then no further voice round.** The subject reader and the register reading
  against word matching ([pre-registration](../studies/SUBJECT_READER_PREREGISTRATION.md)); the voice gate against
  planted changes ([pre-registration](../studies/VOICE_GATE_PREREGISTRATION.md)); and the in-context voice pass
  against pasted examples, read blind by people ([pre-registration](../studies/VOICE_PASS_PREREGISTRATION.md)).
  A trained voice model, steering and authorship embeddings stay unbuilt
  ([decision 0011](decisions/0011-context-is-read-recorded-and-shown.md)).
- **A skill looked after for weeks.** The loop that tends a skill is built and tested offline, and has
  never run on a live skill over time.

## Later

- **Other domains, measured.** Contracts, financial reports and support replies run today and have been
  only partly measured. The study is drafted in
  [CROSS_DOMAIN_PREREGISTRATION](../studies/CROSS_DOMAIN_PREREGISTRATION.md).
- **Search under a fixed standard**, designed in [decision 0004](decisions/0004-search-under-a-fixed-standard.md):
  GEPA-class search over how rules are carried, with a judge checked against people before it is trusted.

## Not doing

- **Letting any automated step change a rule.** It is what makes the standard yours
  ([0001](decisions/0001-standard-apart-from-implementation.md)).
- **A judge that can promote a change on its own.** Judges may block, never approve
  ([0003](decisions/0003-authority-by-measurement.md)).
- **A hosted service.** It runs locally, with no account and no telemetry.
