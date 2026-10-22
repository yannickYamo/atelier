Default to merge unless you have a specific reason to rebase. Merge is safer because it never rewrites history.

**Merge**
`git checkout main && git merge feature`

- Joins two branches by creating a new "merge commit" with two parents.
- Existing commits stay exactly as they were.
- History shows the real shape: where the branch split and where it came back.
- Downside: with many branches, the log gets tangled with merge commits.

**Rebase**
`git checkout feature && git rebase main`

- Takes your branch's commits and replays them on top of the latest `main`.
- Each replayed commit is a new commit with a new hash. The old ones are abandoned.
- History becomes one straight line, with no merge commit.
- Downside: it rewrites history. If anyone else has your branch, their copy no longer matches yours.

**The one rule that keeps you safe**

Never rebase commits that other people already have, such as `main` or a shared branch. Rebase only your own local or personal branch.

**How to choose**

1. Is the branch shared, or already pulled by someone else? Use **merge**.
2. Is it your own branch and you want it current with `main` before opening a PR? Use **rebase**.
3. Not sure? Use **merge**. It is always recoverable.

**If you already pushed a rebased branch**

Git will reject a normal push. Use `git push --force-with-lease`, not `--force`. It refuses to overwrite work you have not seen. Do this only on a branch that is yours alone.

**If a rebase goes wrong**

- `git rebase --abort` returns you to where you started.
- After a finished rebase, `git reflog` lists your old commits so you can reset back to one.

**Conflicts**

- Merge: you resolve conflicts once, in one merge commit.
- Rebase: you may resolve conflicts once per replayed commit. Fix the files, run `git add <file>`, then `git rebase --continue`.

Next: in a scratch repo, make a branch with two commits, run `git rebase main`, then `git log --oneline --graph` to see the straight line (about 2 minutes).