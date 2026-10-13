# How much of a rule does its check read? (development evidence)

A rule shown with a tick is a claim that a check read all of it. This set asks how often the method reader's own
account of that is wrong, on steps it had not seen.

## Material

- Four method notes of 40 steps each (`*.note.md`: code review, blog post, contract summary, competitive teardown),
  each with one finished example (`*.example.md`). All invented. Written from a brief that described what experts'
  notes look like and nothing of how Atelier reads them.
- `items.json`: every step the reader compiled to a check, with what the check reads in plain words.
  `predictions.json`: the reader's answer for each (FULL, PARTIAL). `items.first.json`: the 21 it compiled before the fixes below. `no-check.json`: the steps it left as the
  owner's to judge.
- `labels.json`: for each compiled step, FULL / PARTIAL / NONE, given without sight of `predictions.json` or of any
  code. `checkable.json`: for each step with no check, whether a script with no model could verify the whole of it,
  part of it, or none.

Both the notes and the labels were written by a model, each in its own context, and not by a person. One labeller,
no second reading. Read every figure here as development evidence.

Run it: `node studies/harness/coverage-labels.mjs compile studies/coverage-labels`, then `… score …`. No model is
called.

## What it found

**1. Of 160 steps, the reader compiled 21 to a check.** It called 1 FULL and 20 PARTIAL. The labels: 2 FULL,
11 PARTIAL, 8 NONE.

| | label FULL | label PARTIAL | label NONE |
|---|---|---|---|
| reader said FULL | 1 | 0 | 0 |
| reader said PARTIAL | 1 | 11 | 8 |

**2. No false FULL, on a sample that cannot bound it.** 0 of 1. The reader almost never calls a step in the owner's
own words fully read, so this set says nothing about how often it would be wrong when it does.

**3. Eight checks read something the step does not ask.** A different mistake from a false FULL, and the one this
set did find. Two classes:

- *A step that mentions a table was given the table's column check* (5 steps): "Three to five rows in that table",
  "state how the measurements were taken right below the table". The run would have shown "checked, and held: a
  table with the columns…" under a rule about rows or units.
- *A step about how to cite was given the lookup of figures or lines in the material* (3 steps).

And one step, "Keep Who They Sell To under 70 words", was compiled as a 70-word limit on the whole document: the
reader knew a section's length only where the step said the word "section".

**4. Fixed, narrowly, and scored again.** A count in a step that opens on one of the example's sections is that
section's or nobody's, never the whole work's. A step is held to the example's table only where it asks for a
table, not where it refers to one. After the fix the reader compiles 15 of the 160 steps:

| | label FULL | label PARTIAL | label NONE |
|---|---|---|---|
| reader said FULL | 2 | 0 | 0 |
| reader said PARTIAL | 0 | 10 | 3 |

The three left are the citation class. They are shown as read in part, with what is not read named, and are left
as they are: no further wording patches without evidence from real use. (The label for the section-length step
was given for the check as it was first compiled.)

**5. The larger finding is what the reader does not compile.** Of the 139 steps first left with no check, the
labeller judged that a script could verify the whole of 53 and a specific part of 49; 37 need a person. The method
reader, which calls no model, turns about one step in ten of an expert's notes into a check. What it does compile
it describes honestly. Most of what an expert writes down is, today, the owner's to read on every run.

## What this does not show

Whether the labels are right (one model labeller). How the reader does on real notes by real experts. Anything
about rules read off examples, which are worded from their own check.
