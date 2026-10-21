**Default:** use `merge` for anything shared. Use `rebase` only on your own branch that nobody else has pulled.

## What each does

Starting point: `feature` branched from `B`, then `main` moved ahead to `C`.

```
main:     A---B---C
               \
feature:        D---E
```

**Merge** ties the two histories together with a new merge commit. Your existing commits stay untouched.

```
main:     A---B---C-------M
               \         /
feature:        D-------E
```

```
git switch main
git merge feature
```

**Rebase** replays your commits on top of the latest `main`. The result is a straight line. `D` and `E` are copied as new commits (`D'`, `E'`) with new hashes.

```
main:     A---B---C
                   \
feature:            D'---E'
```

```
git switch feature
git rebase main
```

## The one rule that keeps you safe

Never rebase commits that exist on a shared branch (`main`, `develop`, or any branch a teammate has pulled).

Why: rebase rewrites history. If someone else has the old `D` and `E`, their copies no longer match yours. Fixing that is painful.

## Trade-offs

| | Merge | Rebase |
|---|---|---|
| History | Preserves what really happened | Clean straight line |
| Rewrites commits | No | Yes (new hashes) |
| Conflicts | Resolve once | May resolve once per replayed commit |
| Needs force push | No | Yes, if branch was already pushed |
| Risk on shared branches | Low | High |

## Which to use

1. Updating your private feature branch with the latest `main`: rebase is fine.
2. Branch already pushed and others use it: merge.
3. Bringing a finished feature into `main`: merge (or your team's PR setting, such as squash merge).
4. Unsure: merge. It is always safe and never loses work.

## If you rebase a branch you already pushed

Only you should be using that branch. Then push with:

```
git push --force-with-lease
```

This refuses to overwrite commits you have not seen. Plain `--force` does not.

## Escape hatches

- Conflict mid-operation and you want out: `git merge --abort` or `git rebase --abort`.
- Finished a rebase and regret it: run `git reflog`, find the entry from before the rebase, then `git reset --hard <that-hash>`. Commit or stash other work first, since `reset --hard` discards uncommitted changes.

## Conflict handling during rebase

1. Edit the conflicted files and remove the markers.
2. `git add <file>`
3. `git rebase --continue`
4. Repeat until it finishes.

Next (2 minutes): in a scratch repo, make a branch with two commits, add a commit to `main`, run `git rebase main`, then `git log --oneline --graph` to see the straight line.