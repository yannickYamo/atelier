# 0004. How a GEPA-class search would work here (designed, not built)

**Context.** Atelier's optimizer changes three switches per rule (carrier, example, contrast). Search
in the style of GEPA gets its power from rewriting text against a score, which [0001](0001-standard-apart-from-implementation.md)
forbids for the rules themselves. This records how a stronger search could be built without breaking
that, so it is done right or not at all.

**Design.**
1. **Fixed before building.** Hard constraints on every candidate: no invented claims, every REQUIRED
   measured rule holds, the regression floor is non-inferior. Final evidence is a blind human read on
   a sealed test set, never the judge.
2. **Search the carrying, never the rules.** Slots: carrier per rule, examples, which of the author's
   pieces are served and in what order, section order, drafts and repair passes. **Rule phrasing only
   from a set the owner approved**: the search proposes alternatives, the owner accepts a few per rule
   once, and the search chooses among those.
3. **Algorithm.** Reflective mutation from real failures, a Pareto front across briefs rather than one
   average, slot-wise merging, capped minibatches. The standard's hash is asserted at every step.
4. **A judge validated before it is trusted.** It compares a draft with the author's real piece on the
   same brief, with every figure, date, name, quotation and link masked in both, so it judges voice and
   cannot reward invention. It comes from a different model family than the writer. It is used only if
   its agreement with human rankings clears a bar fixed in advance. It may block a change, never promote
   one.
5. **Data kept apart.** Search briefs, validation briefs and sealed test briefs never overlap. That needs
   about 30 of the author's pieces; a six-piece corpus cannot show anything.
6. **A fair benchmark.** GEPA on a plain prompt, same objective, briefs and budget, reported either way.

**Why not built yet.** It needs the outside-reader study to exist first: the judge in step 4 is only as
good as the human labels it is checked against.
