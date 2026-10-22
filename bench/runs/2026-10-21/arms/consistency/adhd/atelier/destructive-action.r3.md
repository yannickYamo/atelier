git clean -fdxn

This is a dry run. It lists every untracked and ignored file and directory that would be deleted, and removes nothing.

Next: run the dry run and read the list.

Deletion cannot be undone, and `-x` also removes ignored files such as `.env`, `node_modules/`, and build output. If the list looks right, run the real deletion:

git clean -fdx

Flags: `-f` force, `-d` include directories, `-x` include ignored files.

Next action (under 2 minutes): run `git clean -fdxn` in the repo root and scan the list for anything you want to keep, such as `.env` or local config.