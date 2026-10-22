Run `grep -n -i -E "teh|recieve|seperate|occured|definately|adress" README.md` to locate the typo.

You didn't say which word is wrong, so that search only catches common misspellings. If it finds nothing, run `aspell list < README.md | sort -u` (or open README.md and read the first screen). Either one settles which word it is.

1. Open README.md at the line the search returns.
2. Replace the misspelled word with the correct spelling.
3. Run `git diff README.md` and confirm exactly one word changed.

Next action (under 2 minutes): run the `grep` command above and paste the matching line here if more than one line comes back.