Open README.md and find the typo: run `grep -n -i -E "teh|recieve|seperate|occured|definately|adress" README.md`, or read the file top to bottom if that returns nothing.

You didn't say which word is wrong, so I can't name the exact change yet. The grep above settles it. If it finds nothing, a spell check settles it: `npx cspell README.md`.

1. Run the grep (or `npx cspell README.md`) and note the line number.
2. Edit that line with the corrected word.
3. Run `git diff README.md` and confirm only that one word changed.

Next action (under 2 minutes): run the grep command and paste me the matching line if you want me to confirm the fix.