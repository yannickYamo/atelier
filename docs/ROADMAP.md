# Roadmap

**What is next, why, and what is deliberately not being built. Each item names the problem it solves.**

## Now

- **Voice at scale.** Blind tests on rewrites put Atelier first. The next study writes new pieces, not
  rewrites, from a public corpus: Atelier against a plain prompt and against the essays pasted into the
  prompt, same model, read blind by three people, with the pass rule sealed before any output
  ([pre-registration](../studies/VOICE_STUDY_PREREGISTRATION.md)).

## Next

- **npm install.** `npx @yannickyamo/atelier new ./posts "…"` in place of clone and build.
- **A skill looked after for weeks.** The loop that tends a skill is built and tested offline, and has
  never run on a live skill over time.

## Later

- **Search under a fixed standard**, designed in [decision 0004](decisions/0004-search-under-a-fixed-standard.md):
  GEPA-class search over how rules are carried, with a judge checked against people before it is trusted.
  It needs the outside readers first.
- **A head-to-head with GEPA** on a shared task, reported whichever way it comes out.
- **Support replies** (respond mode): the machinery exists, with no evidence yet.

## Not doing

- **Letting any automated step change a rule.** It is what makes the standard yours
  ([0001](decisions/0001-standard-apart-from-implementation.md)).
- **A judge that can promote a change on its own.** Judges may block, never approve
  ([0003](decisions/0003-authority-by-measurement.md)).
- **Contract drafting as a use case.** The machinery supports it; nothing has validated it.
- **A hosted service.** It runs locally, with no account and no telemetry.
