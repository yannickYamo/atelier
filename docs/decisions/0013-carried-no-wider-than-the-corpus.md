# 0013. A move is carried no more widely than the corpus supports

**Status.** Accepted 2026-10-05. It changes how rules are carried, never the rules: no standard's hash moves.

**Context.** Round 1 of development ran an Atelier skill built from 24 example answers against a careful hand-written
skill on 38 coding tasks. Fourteen of the fifteen cases Atelier lost had one cause: it withheld what was asked. It
described the work instead of doing it, refused without the safe command, or explained before acting. Three of the
24 examples ask before delivering. That habit had been compiled four ways at once: a persona trait, two "moves I
sometimes make", and a built-in paragraph. Other moves were read off one or two pieces and stated as habits.

**Decision**, for a skill that answers requests:

1. **A move is stated only on evidence.** At least three pieces where it could apply, and a one-sided 95% lower bound
   of present over applicable of at least 0.3 (three of three clears it at 0.37; two of two does not, at 0.22).
   Below that the author's own words are shown as one instance, with the situation, and no instruction is written.
2. **A stated move carries its condition** and what to do when the condition does not hold, unless its condition
   holds across the corpus (the lower end of the 95% interval of applicable over pieces is at least 0.6).
3. **A move that holds back what was asked** (a refusal, a question before any answer) **is an instance until the
   owner rules on it.** The build names such moves and how to make one a rule with the owner's own condition
   (`atelier amend --rule <id> --applies-when "<when>"`). Which moves hold back is read by the corpus reader, with a
   word pattern as its floor. When to refuse is the owner's to say, never the compiler's.
4. **A move is served with its example, or not at all.** A new package serves every example file when no context is
   named; the reference index names a file only when the file shows something.
5. **A trait is what holds across pieces.** A persona point marked "sometimes" or "rarely" is not served under "How I
   sound".
6. **The built-in guidance gives what was asked first:** against stated assumptions when something was not shown,
   with the safe path when the action is destructive, and a question in place of an answer only when acting on the
   wrong target would do damage.
7. **The examples shown are spread across the kinds of request the corpus holds,** within a word budget.

**What the numbers are.** They are counts in the corpus: how often the examples show a move. That is the only
evidence a build has. How often a move's condition holds in use is a different quantity, and it is measured in use,
from the applicability each run records. The thresholds are a build-time rule, not an estimate of it.

**Where it does not apply.** Writing. A move stated with its rate and a cap per piece is what earlier blind rounds
found to work there, and nothing has measured otherwise. A build that counted no pieces (a corpus too small to hold
any back, a skill from stated rules) states its moves with their conditions, as before. A rule the owner wrote, added
or re-scoped is carried as they scoped it.

**Consequences.** A skill built before this is unchanged until rebuilt. A rebuilt answering skill states fewer
moves, shows more instances, and says at build how each move is carried and why. Round 2 of development measures
whether the withholding failure is gone; that result, not this record, says whether the rule is right.
