# How a skill improves without moving the target

The implementation can change. The standard cannot change itself.

**The shipped correction loop is one command.** `atelier fix "<what was wrong>"` resolves your
latest recorded use, diagnoses, and on an implementation miss builds ONE lateral candidate — a
*different mechanism*, chosen from the carriers the rule's own typed properties make legal under a
fixed, recorded ordering (`core/architecture/replace-carrier.ts`) — re-runs the same task, and puts
a blinded A/B in front of you. Your pick installs the winner and is recorded as a judgement and a
BEHAVIOR observation; the StandardVersion hash is asserted unchanged, not merely logged. Rejection
memory is scoped to (StandardVersion, model): a move that lost under one model is not thereby ruled
out under another, and a superseding standard inherits no verdicts. There is deliberately **no
strength ordering over carriers** — the carrier study falsified that assumption.

The commands below are the staged spelling of the same loop, for when you want to drive each step
yourself. `improve`'s escalation (PROSE → SELF_CHECK) predates lateral replacement and remains for
that path.

```bash
atelier invoke --skill my-skill "..."        # produces an invocation id

atelier improve --skill my-skill \
  --invocation <id> \
  --complaint "the opening is too abstract"

atelier compare --skill my-skill --rule <requirementId>
atelier promote --skill my-skill --candidate <hash> --why "it kept the concrete noun"
atelier rollback --skill my-skill --to <version>
```

A repair starts from a real output and a concrete complaint. Atelier asks first whether the failure is
already covered by the ratified standard.

If it is, the implementation is at fault, and Atelier builds a new `SkillVersion`. If it is not, the
desired target may have changed, and that decision goes back to the human.

**Feedback is evidence, not authority.**

Stability comes from the same separation. One bad output opens a candidate and cannot promote one. Ten
regenerations of the same task count as one situation. A carrier only escalates when the same miss
recurs across independent situations. And when the evidence cannot separate two candidates, Atelier
asks for more instead of declaring a plateau.

The long-term hypothesis is that this lets the implementation improve while the target stays stable.
Models get better, scaffolding can shrink, and a skill can evolve without quietly changing what the
expert meant by good.

### Why `promote` makes you type a reason

`compare` asks a model to order two outputs on one rule, blind, twice, with the sides exchanged. That
model has never been checked against you. Its preference is one opinion, and the second run only
establishes that it is a stable opinion rather than a reading of which text came first.

`promote --why` is where that gets checked. Your choice and your sentence are written against the same
pair the observer read, and `atelier judgements` shows where the two landed:

```bash
atelier judgements --skill my-skill              # the whole ledger
atelier judgements --skill my-skill --rule p3    # one rule
```

```
  agreed              34
  disagreed           6
  observer declined   5   (said EQUAL or that neither complied)
  order-dependent     3   (its verdict flipped when the sides were exchanged)

  85% agreement over 40 comparable pairs.
```

Three things about that report are deliberate.

It prints no rate below thirty comparable pairs. A fraction over four decisions reads as a rate and is
not one.

It excludes the comparisons whose verdict flipped when the sides were exchanged. There the instrument
has already told you its answer tracked position, and scoring that against your pick would move the
count on a coin flip.

It does not treat the rate as a qualification, and says so on the same screen. A pair only enters the
ledger because the repair loop generated it and you ruled on it, so the number describes the observer
on those pairs and not on your standard. Easy pairs dominate any such count, and an instrument that is
really reading length or fluency will agree on most easy ones.

The disagreements are the part worth reading. Six rows where the observer preferred one output, you
preferred the other, and your own sentence sits underneath saying why will tell you what the instrument
is actually measuring. In the run above, every disagreement had the observer preferring a candidate
between 1.35× and 2.10× longer than the champion.

The ledger fills from ordinary use. There is nothing to set up and no labelling session to schedule.

---

---

[← back to the README](../README.md)
