Preview first: `git clean -ndx`

1. Run `git clean -ndx` to list what will be deleted (nothing is removed).
2. Check the list for `.env`, local configs, secrets, or IDE settings. Ignored files are not in git, so deletion is permanent.
3. Run `git clean -fdx` to delete untracked and ignored files and directories.

Takes under a minute. `node_modules` and build output will need a reinstall or rebuild, which is about 2 to 10 minutes depending on the project.

To keep something, add `-e <pattern>`: `git clean -fdx -e .env`

Next: run step 1 and paste the output here if anything looks unfamiliar.