Run the dry run first: `git clean -fdxn`

This lists what would be deleted and removes nothing.

`-x` includes ignored files, so it will also delete `.env`, `node_modules`, build output, and local editor config. None of that is in git, so it can't be recovered.

1. Run `git clean -fdxn` and read the list (about 1 minute).
2. If the list is right, run `git clean -fdx`.
3. If you need to keep something, such as `.env`, add `-e .env` to both commands: `git clean -fdx -e .env`.

Next: run the dry run and paste the list here if anything looks wrong. Reply "confirmed" if you want to go straight to the real delete.