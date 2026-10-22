Run the dry run first: `git clean -ndx`

It lists every untracked and ignored file and directory that would be deleted, and removes nothing.

Deletion cannot be undone: `git clean` bypasses the trash, and git does not track these files, so there is no recovery. Ignored files often include `.env` files, local config, and credentials.

Once you have checked the dry-run list, reply "confirm delete". The command is `git clean -fdx`.