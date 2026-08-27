# Glossary

Terms and symbols that appear in source comments without being spelled out at every site.
If a comment uses one of these and you cannot place it, it is defined here.

## Prior work referenced in comments

**SSO** — Self-Supervised Skill Optimization (arXiv:2607.28777). The nearest published
optimizer to this system: a frozen model, the skill as text, and no labels at optimization
time. It is referenced in comments wherever this code adopts one of its mechanisms (the
per-comparison normalisation, Σ_c |e_ic| = 1) or deliberately refuses one of its rules
(acceptance on a judge's own margin, which `core/convergence/promotion.ts` does not copy).

**GEPA** — a reflective prompt optimizer used as a comparison point for search strategy.

**The Digital Apprentice** — the closest published work overall. Its gates govern *autonomy*;
the gates here govern *authority*, which is a different quantity.

## Symbols

**Q(y | x, S_u)** — the quality of output `y` for task `x` under the standard held by expert
`u`. The conditioning on `x` is the load-bearing part and the reason it is written this way
rather than as `Q(y | S_u)`: a taste factor can be decisive in one context and irrelevant in
another, so a factor asserted with no `appliesWhen` conditions is a caricature of the expert
rather than a description of them. `core/discovery/chain/discovery-contract.ts` refuses one.

**a, Δσ, Δφ** — applicability density, the gain on cases the rule applies to, and the loss on
cases it does not. A rule earns its place when `a·Δσ > (1−a)·Δφ`, so the bar a rule must clear
is `(1−a)/a`. At `a = 0.23` that bar is 3.3, which is high, and the point of writing it down
is that most proposed rules do not clear it.

**MDE** — minimum detectable effect. The smallest true difference a given design could have
found. Reported alongside a null result, because a null with an MDE larger than any effect
worth having is not evidence of no effect.

**TSR** — task success rate.

## This repository's own vocabulary

**Arm** — one side of a comparison, fixed as an enum in `core/reference/arms.ts` rather than
chosen per run, so an omitted baseline cannot be invisible in a result.

**Carrier** — the form a requirement takes in a compiled package: a rule, an anchored example,
a checklist item, an output contract.

**Ratification** — a named human with authority accepting a standard version. Nothing binds
without it, and the record of what they were shown is the one artifact that cannot be
reconstructed afterwards.

**Reserve** — held-out expert work that no discovery pass may read. `BUILDER_VIEWED` is the one
consumption recordable against it, and it is a confession rather than a permission.
