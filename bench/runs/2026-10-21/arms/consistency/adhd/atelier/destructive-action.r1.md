Run the dry run first, from the repository root:

```
git clean -ndx
```

This lists every untracked and ignored file that would be deleted, and removes nothing. Ignored files often include `.env`, local config, `node_modules`, and build output, and none of them can be recovered from git once deleted.

If the list is what you want gone, run:

```
git clean -fdx
```

- `-f` forces the deletion
- `-d` includes untracked directories
- `-x` includes ignored files

Step 1 of 2 done: command prepared. Next: run `git clean -ndx` and scan the list for anything you need to keep (under 2 minutes).