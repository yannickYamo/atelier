Default: use `git merge` for shared branches. Use `git rebase` only on your own branch, before others build on it.

## What each does

Starting point: `feature` branched from `B`, and `main` has since moved to `C`.

```
main:     A---B---C
               \
feature:        D---E
```

**Merge** adds one new commit (`M`) that joins both histories. Existing commits do not change.

```
main:     A---B---C-------M
               \         /
feature:        D-------E
```

```
git switch main
git merge feature
```

**Rebase** replays your commits on top of the latest `main`. `D` and `E` are rewritten as new commits `D'` and `E'` with new hashes. The old ones are abandoned.

```
main:     A---B---C
                   \
feature:            D'---E'
```

```
git switch feature
git rebase main
```

## Trade-offs

| | Merge | Rebase |
|---|---|---|
| History | Shows what really happened, including branches | Straight line, easier to read |
| Rewrites commits | No | Yes (new hashes) |
| Conflicts | Resolve once | May resolve once per replayed commit |
| Risk on shared branches | Low | High |

## When to use which

1. **Merge** when bringing a finished feature into `main`, or on any branch other people use.
2. **Rebase** when updating your private feature branch with the latest `main`.
3. **Rebase** (interactive, `git rebase -i main`) to clean up messy commits before opening a pull request.
4. **Merge** when unsure. It is the safer default.

## Safety rules

1. Never rebase commits that others have pulled. Rewriting shared history breaks their copies.
2. Never rebase `main` or any shared branch.
3. After rebasing a branch you already pushed, use `git push --force-with-lease`, not `--force`. It refuses to overwrite commits you have not seen. Do this only if you are the sole user of that branch.
4. Commit or stash your work before starting either command.
5. Check `git status` and `git log --oneline --graph` before and after.

## If it goes wrong

- Mid-operation, conflicts too messy: `git merge --abort` or `git rebase --abort`. You return to where you started.
- Already finished, result is wrong: `git reflog` lists where your branch pointed before. Then `git reset --hard <hash>` moves it back. This discards uncommitted changes, so commit or stash first.

Git rarely loses committed work. Rebase feels dangerous mostly because the old commits become hard to find, and `reflog` finds them.

## Next action

Spend about 10 minutes in a throwaway repo: make `main` and `feature` diverge by two commits each, run `git merge`, then `git reset --hard ORIG_HEAD` to undo it, then run `git rebase main` and compare the two `git log --oneline --graph` outputs.