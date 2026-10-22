Run `git merge main` on your feature branch when you want to bring in someone else's work without rewriting anything; run `git rebase main` only on commits that exist just on your machine.

**Merge**

`git merge main` (while on your feature branch) creates one new "merge commit" that joins the two lines of history. Your commits and main's commits keep their original hashes and their original order of creation.

- History shows what actually happened, including the fact that two lines of work ran in parallel.
- It is non-destructive. Nothing existing is changed, only a commit is added.
- The cost is a busier log with merge commits that carry no work of their own.

**Rebase**

`git rebase main` (while on your feature branch) takes your commits, sets them aside, moves your branch to the tip of main, and replays your commits on top, one at a time. Imagine picking up your sticky notes from a wall, laying down the updated wall, and re-sticking them in the same order.

- History becomes a straight line, which is easier to read and bisect.
- The replayed commits are new commits. They have the same changes but different hashes.
- You may have to resolve conflicts once per replayed commit, not once total.

**The rule that keeps you safe**

Never rebase commits that other people may have pulled. Rebasing rewrites them, and anyone who already has the old versions will see duplicated or diverging history when they next pull. Merge never causes this.

**How to choose**

| Situation | Use |
|---|---|
| Updating your private feature branch with the latest main | Rebase (or merge, both are fine) |
| Branch already pushed and others are working on it | Merge |
| Landing a finished feature into main on a shared repo | Whatever your team's convention is; ask |
| You are unsure | Merge, because it cannot rewrite history |

**Undo options**

- After a merge you dislike, and before pushing: `git reset --hard ORIG_HEAD`.
- After a rebase gone wrong: `git rebase --abort` while it is in progress, or find the old tip with `git reflog` and run `git reset --hard <old-hash>`.

Rebasing a pushed branch also means a plain `git push` is rejected, and you would need `git push --force-with-lease`. If you find yourself reaching for that on a shared branch, stop and merge instead.

**Next action (under 2 minutes):** in a throwaway repo, create a branch, add one commit on it and one on main, run `git merge main`, note the `git log --oneline --graph` output, then `git reset --hard ORIG_HEAD` and run `git rebase main` to compare the two graphs.

Analogy ("sticky notes") and the "imagine" hypothetical are the freely composed parts; no facts beyond standard Git behavior are asserted, and the `ORIG_HEAD` and `--force-with-lease` details are worth a quick check against your Git version's docs.*