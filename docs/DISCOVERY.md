# How Atelier learns taste

Atelier does not start from a fixed taxonomy of style. It looks for contextual decisions in the work.
Depending on the domain those may show up as framing, methodology, evidence thresholds, abstraction
boundaries, risk allocation, word choice, omission, pacing, error semantics, or something the system
had no name for beforehand.

The object is the decision, not the category.

A candidate looks like this:

```text
Observed
  The author challenges the premise before answering,
  in 4 of 6 pieces.

Candidate
  Correct the frame before solving when the requested decision
  rests on an assumption the evidence does not support.

Applies when
  the question embeds an unsupported assumption

If absent, expect
  answers that solve the question exactly as asked,
  even when it was the wrong question
```

The counterfactual matters because flattering descriptions are easy to accept. A prediction about what
the expert would do differently is easier to check and to reject.

Atelier also looks for the edge of each behaviour. When would this expert deliberately not do this? A
standard without boundaries becomes a caricature.

And it tells you where its own evidence is thin, rather than leaving you to guess which candidates are
well supported.

| what it found | what it asks for |
|---|---|
| the rule appears in one document and nowhere else | another piece of work |
| the evidence is thin and the rule would sound plausible either way | a question built to separate the two answers |
| the rule claims to hold everywhere and nothing has tested its edge | a boundary probe |
| two candidates contradict each other | which one is yours |

It also reports recurring behaviour that no candidate accounts for, and it distinguishes "nothing was
found" from "this was not computed".

### Taste is what you choose, and how you make the choice land

Half of anyone's standard is judgment. The other half is expression, and most systems throw it away
or copy it blindly.

Atelier looks for both, and keeps the relationship between them. From one real run on a corpus of
decision memos, two of the fourteen candidates were:

```text
p7   I drop in one concrete scene of a single user at a single moment
     to carry the argument's weight, then leave it without elaboration.

p12  When I use an image I end the beat on a short declarative that
     renames the thing, so the emphasis lands on the reframing.
```

Read as two rules, p12 is a fussy habit about sentence length and you would reject it. It is not a
rule. It is **how p7 lands**, and when you say so the pair becomes something a model can actually
reproduce:

```text
DECISION          p7   make the abstract mechanism concrete through a scene
                       REQUIRED

  realized as     p12  end the beat on a short declarative that renames the thing
                       FUNCTIONALLY_EQUIVALENT

  observed        "They do not file a ticket. They close the tab.
                   That silence is the product."
```

The decision carries the obligation. The realization carries the form. You are never asked whether a
form is REQUIRED, because that question puts two commands on one choice. You are asked **how tightly
the form binds**: STRICT if the exact realization is part of what you mean, FUNCTIONALLY_EQUIVALENT
if another form doing the same work is fine, FLEXIBLE if it is characteristic and nothing turns on it.

Expressive preferences that serve no deeper decision stay standalone. Not everything is a realization
of something, and pretending otherwise is how a system over-intellectualizes style.

**Atelier never infers this link on its own.** That was measured: asked to derive the relationships
across three independent runs, a model gave one rule three different parents, captured a standalone
preference into an unrelated one, and produced chains nobody authored. A machine may propose an edge.
Only you make it structure.

Every example the compiled skill receives is an anchored quote from your own work, checked verbatim
against the piece it came from. Showing beats telling for form, and a description of a rhythm is not
a rhythm.

---

---

[← back to the README](../README.md)
