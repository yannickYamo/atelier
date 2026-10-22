**Default: use merge. Rebase only your own branch, and only before anyone else has pulled it.**

## The starting point

You branched `feature` off `main`. Then `main` moved ahead:

```
      A---B---C   feature
     /
D---E---F---G     main
```

## Merge

```
git switch feature
git merge main
```

Result:

```
      A---B---C---M   feature
     /           /
D---E---F---G---+     main
```

- Git adds one new merge commit (`M`) that joins the two lines.
- Your existing commits are untouched. Their hashes do not change.
- History shows what actually happened, including the branching.
- Downside: lots of merges from `main` make the log noisy.

## Rebase

```
git switch feature
git rebase main
```

Result:

```
              A'--B'--C'   feature
             /
D---E---F---G              main
```

- Git replays your commits on top of `main`'s latest commit.
- The copies (`A'`, `B'`, `C'`) have new hashes. The originals are abandoned.
- History looks like a straight line, as if you started from `G`.
- Downside: it rewrites history. That is the source of nearly every rebase disaster.

## The one rule that keeps you safe

Never rebase commits that other people may have pulled.

If a teammate has the old `A`, `B`, `C` and you push `A'`, `B'`, `C'`, Git sees two different histories. Their next pull creates duplicates and confusing conflicts.

Safe test: if you have never pushed the branch, or you are the only person using it, rebase is fine. If not, merge.

## Choosing

| Situation | Use |
|---|---|
| Updating your private feature branch with latest `main` | Rebase (or merge, both fine) |
| Cleaning up your own messy commits before opening a PR | Interactive rebase (`git rebase -i main`) |
| Branch is shared with teammates | Merge |
| Bringing a finished feature into `main` | Merge (or your team's PR setting, such as squash) |
| `main`, `develop`, or any shared long-lived branch | Never rebase |

## Conflicts behave differently

- Merge: you resolve all conflicts once, in one commit.
- Rebase: you may resolve conflicts once per replayed commit. Longer branches mean more repeats.

If a rebase gets messy, bail out with `git rebase --abort`. You return to exactly where you started.

## Safety net before your first rebase

1. Make a backup pointer: `git branch backup-feature`
2. Run the rebase.
3. If it goes wrong, reset: `git reset --hard backup-feature`
4. If you forgot the backup, `git reflog` lists where your branch used to point. Reset to that entry.

## Pushing after a rebase

A rebased branch that was already pushed will be rejected on a normal push, because history changed. Use:

```
git push --force-with-lease
```

This overwrites the remote only if nobody else has pushed to it since you last fetched. Do not use plain `--force`.

## Time to learn

About 10 minutes to try both on a throwaway repo. Rebase conflicts feel scary the first time, but `--abort` is always available.

Next: in a scratch folder, run `git init practice`, make a branch with two commits, and try `git rebase main` on it.