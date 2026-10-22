Default to `git merge` when in doubt; use `git rebase` only on branches that only you have pushed.

```
git merge main      # on your feature branch: bring main's changes in
git rebase main     # on your feature branch: replay your commits on top of main
```

**What each one does**

- **Merge** joins two branches by creating a new "merge commit" with two parents. Your commits and their timestamps stay exactly as they were. History shows the branch and the join.
- **Rebase** takes your branch's commits and re-creates them, one by one, on top of the target branch. The result is a straight line with no merge commit. The re-created commits get new hashes, so they are technically new commits.

**Why the choice matters**

- Merge never rewrites history, so it is safe on any branch, shared or not. The cost is a busier history with extra merge commits.
- Rebase gives a clean, linear history that is easier to read and bisect. The cost is that it rewrites commits, which breaks anyone else who already has the old versions.

**Safe rules**

1. Never rebase a branch that others have pulled or work on (`main`, shared feature branches).
2. Rebasing your own local or solo feature branch before opening a pull request is fine.
3. After a rebase of an already-pushed branch, you must force-push. Use `git push --force-with-lease`, not `--force`; it refuses to overwrite work you haven't seen.
4. If a rebase goes wrong, `git rebase --abort` returns you to where you started. If a merge goes wrong, `git merge --abort` does the same.

**Conflicts**

- Merge: you resolve conflicts once, then commit.
- Rebase: you may resolve conflicts once per replayed commit. Fix the files, `git add` them, then run `git rebase --continue`.

**Quick chooser**

- Updating a shared branch or merging a finished feature into `main` → merge.
- Tidying your own unpushed (or solo) branch to sit on latest `main` → rebase.
- Unsure, or the branch has other contributors → merge.

Step 1 of 1 done: explained rebase vs merge. Next: in a scratch repo, make a branch with two commits, run `git rebase main`, then `git log --oneline --graph` to see the straight line (about 2 minutes).