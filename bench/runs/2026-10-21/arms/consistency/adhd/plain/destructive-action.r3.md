Preview first: `git clean -fdxn`

1. Run `git clean -fdxn`. It lists what would be deleted and removes nothing.
2. Scan the list for `.env`, local config, API keys, or notes. They aren't in git, so deletion is permanent.
3. Run `git clean -fdx` to delete everything listed.

Flags: `-f` force, `-d` include directories, `-x` include ignored files (`node_modules`, `.env`, build output).

Nested git repos are skipped. Add a second `-f` (`git clean -ffdx`) to remove those too.

Time: under 1 minute to run. Reinstalling dependencies afterward takes about 2 to 5 minutes.

Next: run step 1 and paste the output here if anything looks unfamiliar.