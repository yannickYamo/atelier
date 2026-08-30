---
name: ratify
description: Review and approve the rules Atelier proposed. Use when candidate rules are waiting for the user's decision.
---

# Ratification — this is where authority enters

Nothing becomes part of the user's standard because a model proposed it or because you rendered it
nicely. It becomes part of the standard when **the user says so**.

## Flow

Run `atelier pending` to get the candidates. Present them **in small batches (3–5)**, each with its
evidence quote, and take one of four decisions per rule:

| decision | meaning |
|---|---|
| **APPROVE** | true as written |
| **REWRITE** | true, but say it in my words → capture their exact wording |
| **CONTEXTUAL** | true only sometimes → capture *when*, in their words |
| **REJECT** | not true of me |

Gather every answer, then submit once:

```bash
atelier ratify --decisions '[
  {"id":"p1","decision":"APPROVE","materiality":"REQUIRED"},
  {"id":"p2","decision":"REWRITE","statement":"<their exact words>","materiality":"PREFERRED"},
  {"id":"p3","decision":"CONTEXTUAL","appliesWhen":"<their exact words>","materiality":"REQUIRED"},
  {"id":"p4","decision":"REJECT"},
  {"id":"new","decision":"ADD","statement":"<a boundary they named>","kind":"BOUNDARY"}
]'
```

**Ask how much each kept rule matters, in their words, and record it as `materiality`.** A discovered
rule approved WITHOUT one is kept but only SHOWN to the model — it does not instruct until its owner
says it matters (`REQUIRED` binds; `PREFERRED` is wanted but other valid realizations are fine). The
close prints `instructs`/`shown` per rule, computed by the compiler; relay it.

**The batch is refused unless every outstanding proposal has its own answer.** Gaps would let the
unanswered rules through on the strength of the answered ones.

## Rules for you

**Batch for review, never for approval.** Offering "approve all" is offering to let model confidence
become authority. Grouping several rules in one message so they can answer quickly is fine; a single
undifferentiated yes is not.

**Their words, not yours.** On REWRITE and CONTEXTUAL, capture what they actually said. Do not tidy it.
The statement is the authority record; a smoothed version is your judgment wearing their name.

**Ask the one question their examples cannot answer.** For each approved rule:
*"When do you deliberately NOT do this?"*
Work they have produced can only show what they did. A prohibition exists nowhere in the corpus, so it
enters here or it never enters at all. Record it as a BOUNDARY rule.

**Ask once, at the end:** *"What could someone do badly in your kind of work that none of these would
catch?"* Anything they name is added with provenance `EXPERT_ADDED` — legitimate and valuable, and
**not** counted as something the machine discovered.

Finish with `atelier ratify-close`, which mints the StandardVersion.
