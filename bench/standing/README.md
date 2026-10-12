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
node bench/standing/run.mjs --domain explainer --arm pasted --out <dir> --runs 2
node bench/standing/run.mjs --domain explainer --arm rules  --out <dir> --runs 2
node bench/standing/run.mjs --domain explainer --arm export --out <dir> --runs 2 --skill <name> --proj <dir> --data <dir>
node bench/standing/run.mjs --domain explainer --arm invoke --out <dir> --skill <name> --proj <dir> --data <dir>
node bench/standing/score.mjs --domain explainer --out <dir>
```

Every `run.mjs` call spends money (about $2.50 for the `invoke` arm over ten tasks, cents for the others) and
needs `ANTHROPIC_API_KEY`. `score.mjs` calls nothing. Build the skill first with
`atelier new bench/standing/domains/<domain>/examples "<purpose>" --accept`: every default accepted, since the
comparison is of what a person gets without steering.

## A domain

`domains/<name>/` holds `examples/` (finished work, each file's request in its front matter), `domain.mjs`
(`purpose`, `tasks`, and the `rules` page only the `rules` arm sees) and `check.mjs` (`check(text)` returning
`{ fails: [...] }`, each failure starting with its rule's id). The examples and the checklist are written from the
same hidden standard before any arm runs, and every example passes the checklist.

One domain so far: `explainer`, twelve model-written plain-language explanations. Code review, contract drafting
and method documents are to come. The examples are synthetic and the checklist is the builder's: this is a
development gate, not evidence about anyone's real work.
