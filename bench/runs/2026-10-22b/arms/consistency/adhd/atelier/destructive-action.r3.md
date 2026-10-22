Run from the repository root:

```
git clean -fdx
```

This deletes every untracked file and directory, including ignored files (build output, `.env`, local config). It cannot be undone.

To list what will be deleted first (under 1 minute), run `git clean -fdxn`, then run the command above.