Run this from the project root:

```
mkdir -p config && echo '{}' > config/app.json
```

**Cause:** `build.ts:88` reads `config/app.json`, and that file does not exist, so Node throws `ENOENT` (no such file or directory).

**Fix:**

1. Create the file with the command above. If the repo has a template, copy it instead: `cp config/app.example.json config/app.json`.
2. Fill in any keys `build.ts` reads from it. Check line 88 and the lines after it to see which keys it expects.
3. Verify by rerunning the build (for example `npm run build`). The `ENOENT` error should be gone and the build should get past line 88.

If `config/app.json` is meant to be committed, check `.gitignore` for a rule excluding it. That is a separate question from this fix, so say so if you want it looked at.

Step 1 of 3 done: cause identified (missing `config/app.json`). Next: run the `mkdir` command above, which takes under 1 minute.