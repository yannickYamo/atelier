**Default:** merge for anything shared, rebase only your own local, unpushed work. If unsure, merge. It is harder to damage anything with it.

## The setup

You branched `feature` off `main`. Meanwhile `main` got new commits.

```
main:     A---B---C---F---G
               \
feature:        D---E
```

Both commands bring `main`'s new work (F, G) into `feature`. They differ in what history looks like afterward.

## Merge

```
git switch feature
git merge main
```

```
A---B---C---F---G
         \       \
          D---E---M
```

- Adds one new "merge commit" (M) that joins the two lines.
- D and E are untouched. Nothing is rewritten.
- History shows what actually happened, including the parallel work.
- Downside: many merges make the log noisy and branchy.

## Rebase

```
git switch feature
git rebase main
```

```
A---B---C---F---G
                 \
                  D'---E'
```

- Replays D and E on top of G, as new commits (D', E').
- The old D and E are abandoned. The new ones have different hashes.
- History is a straight line, easy to read.
- Downside: it rewrites history. That is the source of nearly every rebase disaster.

## The one rule that keeps you safe

**Never rebase commits that other people may have pulled.**

If you rewrite D and E after a teammate built on them, their copy and yours now disagree. Fixing that is painful. Merge never causes this, because it never rewrites.

Safe to rebase:
- A branch only you use
- Commits you have not pushed
- A pushed branch that you are certain nobody else has pulled

Never rebase:
- `main`, `develop`, release branches
- Any branch a teammate is working on

## How to choose

| Situation | Use |
|---|---|
| Updating your private feature branch with latest `main` | Rebase (or merge, both fine) |
| Bringing a finished feature into `main` | Merge (often via a pull request) |
| Branch is shared with teammates | Merge |
| Cleaning up messy local commits before a PR | Interactive rebase: `git rebase -i main` |
| You are not sure | Merge |

## Conflicts

- **Merge:** you resolve conflicts once, in one merge commit.
- **Rebase:** you may resolve conflicts once per replayed commit. With 10 commits touching the same lines, that can mean 10 rounds.

## Pushing after a rebase

Rebasing a branch you already pushed changes its hashes, so a normal push is rejected. On your own branch only:

```
git push --force-with-lease
```

This refuses to overwrite if someone else pushed in the meantime. Never use plain `--force`.

## Safety net

Before any rebase:

```
git branch backup
```

If it goes wrong:

- Mid-rebase: `git rebase --abort`
- Mid-merge: `git merge --abort`
- After finishing: `git reset --hard backup`
- No backup branch: `git reflog` lists where your branch used to be, then `git reset --hard <hash>`

Git keeps abandoned commits for weeks, so a bad rebase is almost always recoverable.

## Practice

About 5 minutes in a throwaway repo:

1. `git init demo && cd demo`, make a commit on `main`
2. `git switch -c feature`, make two commits
3. `git switch main`, make one more commit
4. `git switch feature`, run `git branch backup`, then `git rebase main`
5. Run `git log --oneline --graph --all` and compare to the diagram above
6. Run `git reset --hard backup`, then `git merge main` and compare again

Next: run step 1 and make the first commit.