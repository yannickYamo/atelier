Default to merge on any branch other people have seen; use rebase only to tidy commits that exist on your machine alone.

**Merge**
`git switch main && git merge feature`

Merge joins two lines of history with a new "merge commit" that has two parents. Nothing existing is rewritten. The history shows what happened: you branched, work went on in parallel, and the branches came back together.

- Safe on shared branches, because no commit changes.
- The log gets branchy, and merge commits can add noise.
- If something goes wrong, `git merge --abort` returns you to where you started.

**Rebase**
`git switch feature && git rebase main`

Rebase takes your branch's commits and replays them, one at a time, on top of the latest `main`. Each replayed commit is a new commit with a new hash, and the old ones are abandoned. The result is a straight line, as if you had started your work today.

Analogy: merge is stapling your pages into the book with a note saying when you did it. Rebase is retyping your pages after the last chapter so they look like they were always there.

- The history is linear and easy to read.
- It rewrites commits. If anyone else has pulled your branch, their copy now disagrees with yours, and untangling that is painful.
- You may resolve conflicts once per replayed commit, not once overall.
- `git rebase --abort` undoes an in-progress rebase.

**How to choose**

1. Is the branch pushed and used by anyone else? Merge. Never rebase it.
2. Is it local, or yours alone? You may rebase it onto `main` before opening a pull request, to keep history clean.
3. Are you unsure? Merge. The worst case is a slightly messier log, not lost or duplicated work.

**Rule to memorize:** never rebase commits that exist outside your own machine. Rebasing your own unpushed work is the safe use. If you rebase a branch you already pushed, the push is rejected, and `git push --force-with-lease` is then needed. Treat that need as a warning sign on shared branches.

**Safety net:** `git reflog` lists where your branch pointed recently. If a rebase goes badly, find the commit from before it and run `git reset --hard <that-hash>`.

**Do this now (under 2 minutes):** in a scratch repo, create a branch, make one commit on it and one on `main`, run `git rebase main` on the branch, then `git log --oneline --graph`. Repeat with `git merge` in a second scratch branch and compare the two graphs.