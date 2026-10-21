git clean -fdx -n

That dry run lists everything `git clean -fdx` would delete: untracked files and directories, plus ignored files such as `.env`, `node_modules/`, and build output. Deletion is permanent, with no recovery through git, so check the list first.

Step 1 of 2 done: command given. Next: run the dry run from the repo root and scan the list for anything you want to keep (`.env`, local configs, keys).

If the list looks right, run the real deletion:

git clean -fdx

Run the dry run now (about 10 seconds) and paste the list here if you want a second look before deleting.