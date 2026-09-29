# How Atelier compares

**Against a strong model, against skill and prompt optimizers, against style checkers, and against fine-tuning. The [README](../README.md) has the one-table version.**


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
| [GEPA](https://arxiv.org/abs/2507.19457) | prompt text, by reflecting on rollouts | a metric you supply | the metric's author | yes, given the metric |
| [SkillOpt](https://arxiv.org/abs/2605.23904) | a skill file, through trajectory-driven edits | a validation gate you supply | the gate's author | yes |
| SSO (arXiv:2607.28777) | a skill, without labels | its own judge's win margin | the judge | yes, scored by its own judge |
| EvoSkill (arXiv:2603.02766) | a set of skills, from execution failures | the task's success signal | whoever owns the task | yes |
| **Atelier** | **how your standard is carried, never the standard** | **your work, approved by you rule by rule** | **only you** | **yes, below your standard** |

Each of them needs a score someone else wrote, or lets its own judge decide. Taste has no such score.
Atelier borrows two ideas from their search, a reflective choice among legal changes and a Pareto screen
over your measured rules, and applies them to how your rules are carried, never to their text.

That search runs under a standard you approved. Its judge can block a change and never install one. A
change installs only when your measured rules improve and none regresses beyond its margin; rules no
count reads are listed, not guarded. Atelier hasn't been benchmarked against these systems on a shared
task yet. The difference is in the architecture, and you can check it in the code.

**Against style checkers:** Vale, proselint, Acrolinx and Writer hold copy to rules someone wrote down.
Atelier reads the rules off your own work, checks them on pieces it never read, and has you approve them.
Its checker is the last step, not the first.

**Against fine-tuning:** weights can't be diffed against what you meant. A standard can, and it moves to
another model tomorrow without retraining.


[← README](../README.md)
