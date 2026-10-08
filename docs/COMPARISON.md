# How Atelier compares

**Against a strong model, against voice tools, against skill and prompt optimizers, against style checkers, and against fine-tuning. The [README](../README.md) has the one-table version.**


**Against a strong model, on its own or with your examples pasted in:**

| | a model | Atelier on that model |
|---|---|---|
| where "good" is defined | re-guessed from examples every run | a standard you approved, versioned and diffable |
| which habits matter | can't tell a decision from an accident | each rule weighed, with when it applies, checked on work it never read |
| machine tells | its own habits come back | caught as moves, held to your own rate |
| your stories, sources and figures | invented when missing | read for, traced to what you supplied; the rest cut and listed |
| your sentences | lifted when pasted | shown for voice; copying flagged |
| after the draft | nothing checks it | every counted rule checked, the rest read (reporting only, until you label it); only what broke is rewritten |
| next month | no memory of what went wrong | `fix` and `tend` propose changes, installed only through a gate (not yet shown on a live skill) |
| another model | re-prompt and hope | recompile the same standard |

**Against skill and prompt optimizers:**

| | what it optimizes | where the objective comes from | who can change the objective | runs its own loop |
|---|---|---|---|---|
| [GEPA](https://arxiv.org/abs/2507.19457) | any text artifact (prompts, code, skills since its `optimize_anything` API), by reflecting on rollouts | a metric you supply | the metric's author | yes, given the metric |
| [SkillOpt](https://arxiv.org/abs/2605.23904) | a skill file, through trajectory-driven edits | a validation gate you supply | the gate's author | yes |
| [SSO](https://arxiv.org/abs/2607.28777) | a skill, without labels | its own judge's win margin | the judge | yes, scored by its own judge |
| [EvoSkill](https://arxiv.org/abs/2603.02766) | a set of skills, from execution failures | the task's success signal | whoever owns the task | yes |
| **Atelier** | **how your standard is carried, never the standard** | **your work, approved by you rule by rule** | **only you** | **yes, below your standard** |

Each of them needs a score someone else wrote, or lets its own judge decide. Scores for taste do exist
(a judge picking the real piece out of a lineup, an authorship-verification model), but they are proxies
someone else owns, and Atelier never lets one set the standard.
Atelier borrows two ideas from their search, a reflective choice among legal changes and a Pareto screen
over your measured rules, and applies them to how your rules are carried, never to their text.

That search runs under a standard you approved. Its judge can block a change and never install one. A
change installs only when your measured rules improve and none regresses beyond its margin; rules no
count reads are listed, not guarded. Atelier hasn't been benchmarked against these systems on a shared
task yet. The difference is in the architecture, and you can check it in the code.

**Against automated harness evolution** ([RRSI](https://github.com/google-research/rrsi), Google Research,
September 2026): a search that rewrites an agent's whole harness (prompts, control flow, tools, skills, memory)
around a frozen model, scored on a benchmark, with regularizers so that gains carry to tasks it was not scored on.
It and Atelier distrust the same thing, a gain measured on the cases it was tuned on, and both hold cases back and
check in code before asking a model. They differ in who owns the objective. RRSI's is a benchmark's automatic
score, and no person approves anything in the loop; given a wrong objective it optimizes that. Atelier's is a
standard a person approved, which no automated step may change, and its search (`atelier evolve`, which borrows
RRSI's noise band, one change at a time, cost rule, leakage check and held-back cases) is over how that standard is
carried: two settings, where RRSI searches the whole harness. RRSI needs a scored task set of some size; Atelier starts from a handful of a person's
own pieces, or one method and one example, and no scorer. RRSI is ahead where Atelier is thin: sample sizes,
confidence intervals, and an account of what each added step costs. The two are not benchmarked against each other, and are not solving the same problem.

**Against voice tools that learn from your samples** (Every's Spiral, Writer's voice, Jasper IQ, Typeface,
Lex, Claude Styles, Noren): learning a voice from samples is now common, and several check or score every
draft. Noren cites examples from your writing for each pattern it finds; Spiral checks each draft with a
judge that tries to pick it out of your real pieces, and feeds the judge's reasons back into its style
engine. What none of them does, as far as their public material shows (September 2026): count each rule
against a plain model's rate, confirm it on pieces it never read, freeze the approved standard as a hashed
version only you can change, and cut invented stories and figures by checking them against what you
supplied. Grammarly's fact checker checks against the web, not against your material.

**Against style checkers:** Vale, proselint and Markup AI (formerly Acrolinx) hold copy to rules someone
wrote down, and Vale keeps them versioned in git, as Atelier does its standard. Atelier reads the rules off
your own work, checks them on pieces it never read, and has you approve them. Its checker is the last step,
not the first.

**Against grounding checkers** such as [MiniCheck](https://arxiv.org/abs/2404.10774): checking claims
against a source with a small model is established. Atelier applies it to a person's own material, and
deletes what fails rather than flagging it.

**Against fine-tuning:** weights can't be diffed against what you meant. A standard can, and it moves to
another model tomorrow without retraining.


[← README](../README.md)
