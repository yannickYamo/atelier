Default to `git merge`. Use `git rebase` only on commits that exist nowhere but your own machine.

Run this before either one, so you can undo it:

```
git branch backup-before-integrate
```

**What each one does**

Say you branched `feature` off `main` on Monday. By Friday, `main` has moved on and your branch is behind.

- **Merge** ties the two histories together with a new "merge commit." Nothing existing is changed. Your commits keep their original hashes and timestamps, and the history shows the branch and the join.
- **Rebase** picks up your commits and replays them on top of the current tip of `main`. The result is a straight line, as if you had started your work this morning. The catch: replayed commits are new commits with new hashes. The old ones are abandoned.

**The one rule that keeps you safe**

Never rebase commits other people already have. If you have pushed a branch and a teammate has pulled it, rebasing rewrites history under their feet. Their copy and yours now disagree about what happened, and untangling that is miserable. Merge is always safe here because it only adds.

Imagine a shared whiteboard. Merge is writing a new note beside the old ones. Rebase is erasing your section and rewriting it in a cleaner spot. Fine if the whiteboard is yours alone. Rude if three colleagues copied your section into their notes an hour ago.

**How to choose**

| Situation | Use |
|---|---|
| Branch is shared, pushed, or others pulled it | merge |
| Merging a finished feature into `main` | merge (or your team's pull request setting) |
| Local branch, never pushed, behind `main` | rebase is fine |
| You are unsure | merge |

**Commands**

Merge `main` into your branch:

```
git switch feature
git merge main
```

Rebase your branch onto `main`:

```
git switch feature
git rebase main
```

**Conflicts**

Both can stop on a conflict. Fix the marked files, then continue:

- Merge: `git add <file>` then `git commit`
- Rebase: `git add <file>` then `git rebase --continue`

A rebase can pause once per replayed commit, so a long branch may ask you to resolve conflicts several times. A merge asks once. This is a real reason beginners find merge less stressful.

If you panic mid-way, back out:

```
git merge --abort
git rebase --abort
```

**Tradeoffs**

- Merge keeps the true history and is hard to break. The log gets noisy with merge commits.
- Rebase gives a clean, linear log that is easy to read and bisect. It rewrites history, so it is easy to misuse.

**If you rebase and have already pushed your own branch**

Only do this when you are certain nobody else uses the branch. Your push will be rejected, because history changed. Use:

```
git push --force-with-lease
```

This refuses to overwrite work you have not seen. Plain `--force` does not check, so avoid it.

**Next action (under 2 minutes):** in a scratch repo, make a branch, add one commit on it and one on `main`, then run `git merge main` on the branch. Run `git log --graph --oneline` and look at the shape. Then reset with `git reset --hard ORIG_HEAD` and try `git rebase main` instead, and compare the two graphs.