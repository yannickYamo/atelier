# 0017. A skill from one method and one finished example

**Status.** Proposed. Built on the branch `method`, for 2.0; the owner has set the goal and has not yet ruled on
this record. It adds a second way in and changes nothing about the first.

**Context.** Atelier reads a body of work and finds the taste in it: rules about how an author writes, each held
against work the rule was not read from. That needs several pieces. The owner's goal for 2.0 is the other case, and
the common one in a company: **one methodology and one golden sample, and from them the best skill.** A team has a
method written down, or a template, and one piece of work everyone agrees is right. It does not have twenty.

Two things were measured that bear on it.

- On a real house standard (nine finished artifacts, one per kind, two held back), a skill built the first way
  carried the common shell to an artifact kind it had never seen, and none of that artifact's own sections. The
  sections were in the template for that artifact, which the build never read.
- A check on reproduction that reads rules about style and the safety of facts can count a bland output as
  conformant. What would fail it is what the method says the work must contain.

**Decision.**

1. **A second way in: `atelier method <note> --golden <example>`.** It reads what the owner says is done and one
   piece of work where it was done. It calls no model.
2. **No taste is read from one piece.** A rule about how an author sounds needs work it was not read from to be held
   against. From one example none is proposed, and the skill says so. Taste arrives the first way, when there are
   pieces to read it from, and the two ways build one standard.
3. **Each step is the owner's, in their words, and is one of three kinds.**

   | Kind | What it asks | How it is read |
   |---|---|---|
   | Deliverable | the work must contain something: these sections, this table | by code, on the output |
   | Execution | the work must be made from what was given: every figure is in the material | by code, against the bound material |
   | Judgement | everything else: what is weighed, what is concluded | not read. Shown to the writer, reported as not measured |

   An execution step is counted only where an artifact shows it. A step carried out in the writer's head leaves
   none, and is never reported as checked.
4. **A step gets a check only when the owner's example passes it.** The finished example is the method carried out.
   A check it fails is reading something the owner did not mean, or the template and the work disagree. Either way
   the step stays theirs as a judgement, and the screen asks.
5. **What the example shows and no step said is proposed, and shown, never required.** One example cannot tell a
   habit from an accident. The owner makes it required.
6. **What is missing is written again with it named.** A missing section is not a sentence that went wrong. Patched
   into the last paragraph it becomes prose that mentions the section, which reads as done and is not. A figure the
   material does not hold is cut, never reworded.
7. **Every run says what was held, by kind, in three counts that are never added:** what it contains, what it was
   made from, and how many judgement steps were not measured.

**What it does not do.**
- It does not check a judgement step, and does not say it did.
- It does not read which entities a brief names, so "each competitor has its row" is a judgement until a reader
  qualifies for it.
- It links a step to a check by the step's own words (a section it names, a table and its columns, sources for
  figures). A step worded another way is a judgement. Narrow on purpose.

**How it will be tested.** Not by the builder. On one method and one example per kind of work, with new subjects and
new material, against the method pasted as a prompt with the example, and against a skill made by a skill-creator
from the same two inputs: the share of cases that hold every required deliverable and execution step with no
unsupported specific, and a blind expert read that it is no worse.

**Consequences.**
- A skill built this way has few required rules, each one the owner's. Its counts are small and mean what they say.
- The first way is unchanged, and a standard approved before reads and checks exactly as it did.
