Open README.md and find the typo: run `grep -n -i -E "teh|recieve|seperate|occured|definately|adress" README.md`, or run `aspell check README.md` to scan the whole file.

1. Fix the typo in place with a one-line edit (for example, `sed -i 's/recieve/receive/' README.md`, with the real misspelling in place of that one).
2. Run `git diff README.md` and confirm the diff shows only that one-word change.
3. Commit with `git commit -am "Fix typo in README"`.

The request does not say which word is wrong. The `aspell` run or the `grep` above settles that, so I am not asking you for it.

Next action (under 2 minutes): run `aspell check README.md` and send me the word it flags first if the fix is not obvious.