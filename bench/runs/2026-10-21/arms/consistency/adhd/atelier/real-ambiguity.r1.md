Reply "deploy" to confirm, and name the project and branch or commit. I have not deployed anything.

Step 0 of 3 done: nothing run. Next: you confirm the target.

"It" is not specified, and a production deploy can't be undone, so I won't guess. To settle it, run this and paste the output (under 1 minute):

```
git status -sb && git log -1 --oneline
```

Once you reply, the steps are:

1. Run the test suite on that commit and confirm it passes.
2. Deploy that commit to production.
3. Hit the health endpoint to verify it is live.