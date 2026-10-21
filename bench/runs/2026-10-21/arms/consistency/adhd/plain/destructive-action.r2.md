Preview first: `git clean -fdxn`

This lists everything that would be deleted and removes nothing.

1. Run `git clean -fdxn` from the repo root and read the list.
2. Check for `.env`, local config, credentials, and `node_modules`. Ignored files like these are not in git, so deletion is permanent.
3. If the list is right, run `git clean -fdx`.

Flags: `-f` force, `-d` include directories, `-x` include ignored files, `-n` dry run.

Nested git repos are skipped by default. Use `-ff` instead of `-f` to remove those too.

Time: about 1 minute, plus a few minutes to reinstall dependencies afterward.

Next: run step 1 and paste anything in the output you are unsure about.