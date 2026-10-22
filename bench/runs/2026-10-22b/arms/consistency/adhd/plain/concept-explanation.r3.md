Default: use **merge** to combine branches. Use **rebase** only to tidy your own commits that nobody else has pulled.

## What each one does

Starting point: you branched `feature` off `main`, and `main` has since moved on.

```
      A---B---C   feature
     /
D---E---F---G     main
```

**Merge** ties the two histories together with a new commit:

```
      A---B---C
     /         \
D---E---F---G---M   main (after merging feature)
```

- Your commits `A B C` are unchanged.
- History shows what really happened, including the parallel work.
- Nothing is rewritten, so it is safe on shared branches.

**Rebase** replays your commits on top of the latest `main`:

```
D---E---F---G---A'---B'---C'   feature (after rebase)
```

- `A' B' C'` are new commits with new hashes. The originals are abandoned.
- History is a straight line, which is easier to read.
- It rewrites history, which is where the danger comes from.

## The one rule that keeps you safe

Never rebase commits that others may have based work on. That means `main`, `develop`, or any branch a teammate has pulled.

If you rebase shared commits, your history and theirs diverge. Their next pull produces duplicate commits and confusing conflicts.

## Decision guide

| Situation | Use |
|---|---|
| Bringing a finished feature into `main` | Merge |
| Updating your private feature branch with the latest `main` | Rebase (or merge, both work) |
| Cleaning up messy local commits before opening a PR | Interactive rebase (`git rebase -i`) |
| Branch already pushed and others are using it | Merge |
| Unsure | Merge |

## Conflicts

- **Merge:** you resolve all conflicts once, in one merge commit.
- **Rebase:** you may resolve conflicts once per replayed commit. Longer branches mean more repeats.

Bail out at any point and your branch returns to how it was:

```
git merge --abort
git rebase --abort
```

## Pushing after a rebase

If you rebased a branch that you already pushed (and only you use it), the push is rejected because history changed. Use:

```
git push --force-with-lease
```

Do not use plain `--force`. `--force-with-lease` refuses to overwrite commits you have not seen, so it will not erase a teammate's push.

## Safety nets

1. Before a risky rebase, make a backup: `git branch backup-feature`
2. If a rebase goes wrong after finishing, `git reflog` lists where your branch pointed before. Reset with `git reset --hard <hash>`.
3. Check `git status` first. Rebase with uncommitted changes is where people lose work.

Next (about 10 minutes): create a throwaway repo, make a branch with two commits, then run `git rebase main` on it. Run `git log --oneline --graph` before and after to see the hashes change.