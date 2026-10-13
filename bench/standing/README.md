# bench/standing: the standing comparison

The same work asked for four ways, on the same model and the same tasks, scored by a checklist that imports
nothing from Atelier:

| arm | what answers |
|---|---|
| `pasted` | the model with the examples pasted into the prompt |
| `rules` | the model with a one-page rule list and the examples |
| `export` | the model with `atelier export`'s file as its prompt |
| `invoke` | `atelier invoke`: drafts, checks and repair |

It exists to hold two gates on every release, because both were broken once and nothing noticed: the runtime
deletes nothing from a text when no material is bound, and the runtime fails no more often than its own exported
skill used as a plain prompt.

```bash
node bench/standing/score.mjs --domain contract --out bench/standing/runs/2026-10-13/contract    # the recorded run, scored again: no model, no cost
```

`runs/<date>/<domain>/` holds every output of a recorded run as one small file (the arm, the task, the output, what
it cost and how long it took), so each table in the changelog and in docs/RESULTS.md can be made again from a clone.
To make a run of your own:

```bash
bench/standing/build.sh contract /tmp/standing                                    # the Atelier skill: the domain's method and examples, no model
node bench/standing/run.mjs --domain contract --arm pasted --out <dir> --runs 2
node bench/standing/run.mjs --domain contract --arm rules  --out <dir> --runs 2
node bench/standing/run.mjs --domain contract --arm export --label export-folder --skill contract-folder --proj /tmp/standing/contract/proj --data /tmp/standing/contract/store --out <dir> --runs 2
node bench/standing/run.mjs --domain contract --arm invoke --label invoke-folder --skill contract-folder --proj /tmp/standing/contract/proj --data /tmp/standing/contract/store --out <dir>
node bench/standing/score.mjs --domain contract --out <dir>
```

Every `run.mjs` call spends money (about $2 for the `invoke` arm over ten tasks, cents for the others) and needs
`ANTHROPIC_API_KEY`. `score.mjs` calls nothing. It reports, per arm: outputs failing, by rule; cost an output and
cost a passing output; and the two gates. A model's refusal is said apart and is not scored as a failure.

## A domain

`domains/<name>/` holds `examples/` (finished work, each file's request in its front matter), `domain.mjs`
(`purpose`, `tasks`, and the `rules` page only the `rules` arm sees) and `check.mjs` (`check(text)` returning
`{ fails: [...] }`, each failure starting with its rule's id). The examples and the checklist are written from the
same hidden standard before any arm runs, and every example passes the checklist.

Four domains, one for each kind of work the comparison is about:

- `explainer`: twelve model-written plain-language explanations that keep six habits.
- `code-review`: twelve golden reviews to a six-step method, and ten changes with one planted defect each
  (`gen.mjs` built it once; `truth.json` holds each file and the defect's line).
- `contract`: a mutual confidentiality agreement drafted from a term sheet to an eight-step method. The parties,
  the term in months and the governing law must be the term sheet's, and no figure may be added.
- `analysis`: a competitive analysis of three vendors on price to a six-step method. The verdict must name the
  vendor that costs least for the team in the request, and each vendor's monthly cost must be worked right.

`contract` and `analysis` make their cases in code (`cases.mjs`): the checker knows the right answer because it is
computed, never read from an output. Their twelve examples were written once by `gen-examples.mjs` and kept only
where the domain's checker passed them. The examples are synthetic and the checklists are the builder's: this is a
development gate, not evidence about anyone's real work.

One arm can be run for more than one skill with `--label` (`--arm invoke --label invoke-method`); `score.mjs`
pairs `invoke-<x>` with `export-<x>` for the second gate.
