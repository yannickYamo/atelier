Preview first: `git clean -fdxn`

This is irreversible, so check the list before you delete.

1. Run the dry run: `git clean -fdxn`
2. Check the list for anything you need, such as `.env`, local config, or IDE settings.
3. Delete for real: `git clean -fdx`

What the flags do:
- `-f` forces deletion
- `-d` includes untracked directories
- `-x` includes ignored files (`node_modules`, build output, `.env`)

Deleted files do not go to the trash and git cannot restore them. Reinstalling dependencies afterward takes about 1 to 5 minutes, depending on the project. Secrets in `.env` are gone unless you have a copy.

Next: run step 1 and paste the list if you want me to check it.