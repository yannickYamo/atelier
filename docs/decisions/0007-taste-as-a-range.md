# 0007. Taste as a range: the fidelity loop below the standard

**Status.** Accepted 2026-10-01 for 0.8.0. Its result is decided by B6 ([studies/B6_PREREGISTRATION.md](../../studies/B6_PREREGISTRATION.md)), not by this record.

**Context.** Outside studies of 0.7 found that a skill reproduces an author's explicit taste (punctuation,
machine-writing tells, required rules) at the author's level, and misses the implicit layer: paragraph and
document pace, how sentences sound, the whole-text fingerprint a detector reads. They also found two things
that decide how to fix it:

1. Model judges invert on voice. Asked which text is closer to an author, three frontier families chose the
   model imitation over the real author. A judge cannot be the target.
2. Imitations regress to the author's mean. Burrows' Delta put imitations nearer the author's average than
   the author's own pieces sit. "Closer to the author" is the wrong target.

In control terms 0.7 was open loop with one binary error ("a required rule broke") and an actuator that
rewrites spans. The layers it lost were exactly the ones nothing measured or moved.

**Decision.**

1. **The setpoint is the author's range, never their mean.** Every counted feature gets a band (10th to 90th
   percentile of the author's pieces, widened), per length class where there are enough pieces. Drafts are
   chosen by how many steering features fall inside, then by how far outside the rest sit. A pull toward the
   median was removed, and style distance is capped at the author's own margin.
2. **Roles, decided by evidence.** A feature the owner ratified is a RULE. One that separates the author from
   the model's drafts (half of them written with the author's pieces pasted in) and holds on held-back pieces
   is a SIGNAL and steers. Everything else is a MONITOR: recorded, estimated, never steering.
3. **A second actuator for form.** After the counted checks, the band furthest outside among those a change
   of form can move is named in the author's numbers and the text is redrafted once for it. The redraft is
   kept only if it moved the target without pushing another feature out, kept every figure, negation,
   qualifier and name (the same integrity guard every rewrite passes) and 85% of the content words, and broke
   no rule of the standard and added no claim.
4. **Specifics are grounded, never rewarded raw.** Real writing is denser in specifics than imitations from
   the same facts. The way to that density is using the facts supplied: drafts are ranked by how many facts
   from the request and the bound material they use. A specifics feature is held only from above.
5. **The detector is a monitor.** A stylometric detector is trained at discovery and recorded on every
   output. It breaks only a tie the bands leave, on a clear difference. An instrument steered toward stops
   being an instrument to judge by, so the study's evaluator is trained apart (B6, section 4).
6. **The outer loop acts only through releases.** Everything below the standard that shapes an output
   (drafts, edit budget, retrieved passages, experience notes) is an implementation release, hashed, with a
   parent, recorded on every output, rolled back by pointing at the parent. An estimator watches each feature
   per length class and per runtime binding (EWMA bias, spread ratio, CUSUM alarms on sustained drift, never
   on one output). Experience notes are distilled from drafts the sensors scored apart, never judged by a model.
7. **Nothing here moves the standard.** Every release asserts the standard's hash.

**Consequences.** A writing skill writes four drafts and may make up to two structural edits: about twice
the generation cost of 0.7, which decision 0006 would block without evidence. B6 is that evidence, and
`atelier fidelity --skill <name> --set drafts=2,editBudget=0` returns any skill to 0.7's cost. A skill too
short to steer starts at 0.7's settings. Layers no count reaches (argument, stance, content) are left to the
owner's reading, with the outputs worth reading chosen by the counts.
