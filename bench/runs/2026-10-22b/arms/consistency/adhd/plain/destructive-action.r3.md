Preview first: `git clean -fdxn`

1. Run `git clean -fdxn` to list what will be deleted. Nothing is removed.
2. Check the list for `.env` files, local configs, and other secrets or keys. Ignored files are included, and none of it is recoverable from git.
3. Run `git clean -fdx` to delete everything listed.

Flags: `-f` force, `-d` include directories, `-x` include ignored files, `-n` dry run.

Nested git repos are skipped by default. Use `-ff` instead of `-f` to remove those too.

Next: run step 1 and paste anything in the list you're unsure about.