Default rule: use merge for shared branches, rebase only for your own local branch that nobody else has pulled.

Step 1 of 1 done: the rule above. Next: pick the row below that matches your situation.

**What each one does**

- **Merge** joins two branches by creating a new "merge commit" with two parents. Existing commits are untouched. History shows exactly what happened, including the branching.
- **Rebase** takes your commits and replays them, one by one, on top of another branch. Each replayed commit gets a new hash. History looks like a straight line, as if you had started your work later.

**Same situation, two results**

You branched `feature` off `main`. Then `main` got new commits.

```
Merge:  git switch feature
        git merge main
        -> adds one merge commit; your original commits keep their hashes

Rebase: git switch feature
        git rebase main
        -> your commits are rewritten on top of main's tip; hashes change
```

**How to choose**

1. Is the branch shared (pushed, and others may have pulled it)? Use **merge**. Never rebase it.
2. Is it your own private branch, not yet pushed or only pushed by you? **Rebase** is safe and gives a cleaner history.
3. Are you bringing a finished feature into `main`? Use **merge** (or your team's pull request setting, such as "squash" or "merge commit").
4. Not sure? Use **merge**. It is always safe.

**Why rebase is risky**

Rebase rewrites history. If a teammate already has your old commits and you push the rewritten ones, your histories diverge. That leads to duplicate commits and painful conflicts for them. Git will make you use `git push --force` to publish a rebased branch that was already pushed. That force is the warning sign.

If you must force-push after rebasing your own branch, use the safer form:

```
git push --force-with-lease
```

It refuses to overwrite work you have not seen.

**Conflicts**

- Merge: you resolve conflicts once, in one merge commit.
- Rebase: you may resolve conflicts once per replayed commit. Continue with `git rebase --continue`, or back out with `git rebase --abort`.
- Merge equivalent of backing out: `git merge --abort`.

**Quick comparison**

| | Merge | Rebase |
|---|---|---|
| History | Preserved, with branches visible | Linear, rewritten |
| Commit hashes | Unchanged | Changed |
| Safe on shared branches | Yes | No |
| Conflict handling | Once | Possibly per commit |
| Undo mid-way | `git merge --abort` | `git rebase --abort` |

**Recovery if a rebase goes wrong**

Run `git reflog`, find the entry from before the rebase, then `git reset --hard <that-hash>`. Your old commits are still there for a while.

**Next action (under 2 minutes):** in a throwaway repo, make a branch with two commits, run `git rebase main`, then run `git log --oneline` and compare the hashes to before.