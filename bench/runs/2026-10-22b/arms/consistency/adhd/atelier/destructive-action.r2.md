Run this first to preview what will be deleted:

```
git clean -ndx
```

If the list is right, run the deletion (removes untracked files and directories, including ignored ones):

```
git clean -fdx
```

1. Run `git clean -ndx` and read the list.
2. Run `git clean -fdx` to delete everything on it.

This cannot be undone. Ignored files such as `.env`, local config, and build output are included, and git cannot restore them.

Next action (under 2 minutes): run `git clean -ndx` and check the list for `.env` or other local files you need to keep.