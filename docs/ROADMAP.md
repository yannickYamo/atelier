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

## Next

- **npm install.** `npx @yannickyamo/atelier new ./posts "…"` in place of clone and build.
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
