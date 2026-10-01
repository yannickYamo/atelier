# Qualifying the stylometric detector

The detector reads function-word and character-trigram rates and says how likely a text is to be a model
imitation of an author. It may not steer anything until it holds on texts it never saw. This script runs
that test on your own data. It makes no model calls and needs no key. Generate the imitations wherever
you like, then point the script at the folder.

## Layout

```
my-data/
  author/      the author's own pieces, one .md file each
  model-a/     imitations written by one model
  model-b/     imitations written by another (optional)
```

Every folder beside `author/` is a generator, named by the folder. A file may start with these lines,
bare or inside a `---` block:

```
topic: harbours
source: essay-07
```

The source defaults to the file name. Give an imitation the same source as the piece it imitates, so the
two are always held out together. Texts under 100 prose words are not scored.

## Run it

```bash
npm run build
node bench/fidelity/qualify.mjs my-data --out result.json
```

## What it checks

The detector is retrained inside every fold, on that fold's training texts only. It is tested three ways:

- **source**: leave one source out.
- **topic**: leave one topic out. Does it read style, or subject?
- **generator**: leave one model out. Does it catch a model it never trained on? Author sources are
  dealt across these folds by name, so each fold has author texts too.

A hold-out with fewer than 2 distinct values is skipped, and the output says so.

## The bars

The held-out scores are pooled into one AUC, with a 95% interval from a seeded bootstrap.
A hold-out passes when the AUC is at least 0.25 away from 0.5 and the lower end of the interval is at
least 0.65. The detector qualifies only when every hold-out that ran passes. The exit code is 0 when it
qualifies and 1 when it does not.
