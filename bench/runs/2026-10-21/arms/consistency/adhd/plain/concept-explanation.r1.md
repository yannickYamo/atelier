**Default: use merge. Rebase only your own local branch that nobody else has pulled.**

## What each one does

Starting point: `feature` branched off `main`, and `main` has since moved on.

```
A---B---C       main
     \
      D---E     feature
```

**Merge** joins the two lines with a new merge commit (`M`). Existing commits are untouched.

```
A---B---C---M   main
     \     /
      D---E     feature
```

**Rebase** replays your commits on top of the latest `main`. D and E are recreated as new commits (`D'`, `E'`) with new hashes. The old D and E are abandoned.

```
A---B---C---D'---E'   feature
```

| | Merge | Rebase |
|---|---|---|
| History | Preserved exactly, with branches visible | Linear, as if you started from latest `main` |
| Rewrites commits | No | Yes (new hashes) |
| Risk | Low | Real, if the branch is shared |
| Conflicts | Resolve once | Possibly once per replayed commit |

## The golden rule

Never rebase commits that other people may have pulled.

Rebase changes commit hashes. Teammates still have the old commits, so their history and yours diverge. The result is duplicate commits and confusing conflicts.

## Which to choose

1. **Updating your local, unpushed feature branch with latest `main`:** rebase.
2. **Your own pushed branch that only you use:** rebase is fine, then `git push --force-with-lease`.
3. **A branch others also commit to:** merge.
4. **Bringing a finished feature into `main`:** merge (or squash merge, if your team's PR settings use it).
5. **`main`, release branches, anything shared:** never rebase.

## Commands

Merge:
```
git switch main
git merge feature
```

Rebase:
```
git switch feature
git rebase main
```

After rebasing a branch you already pushed:
```
git push --force-with-lease
```
Use `--force-with-lease`, not `--force`. It refuses to overwrite commits you have not seen.

## Conflicts

1. Fix the conflicted files.
2. Run `git add <file>`.
3. Merge: run `git commit`. Rebase: run `git rebase --continue`.
4. To bail out: `git merge --abort` or `git rebase --abort`. Both return you to where you started.

## Safety net

Before any rebase, run `git branch backup`. It takes about 2 seconds and gives you a copy to return to.

If a rebase goes wrong after it finishes:
```
git reflog
git reset --hard <hash-from-before-the-rebase>
```
`reflog` lists every place `HEAD` has been, so "lost" commits are usually recoverable for weeks.

Next: in a throwaway repo (about 10 minutes), make a branch with two commits, add a commit to `main`, and run `git rebase main`. Then run `git log --oneline --graph` and compare the hashes to what you had before.