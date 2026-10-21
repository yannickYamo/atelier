Restore `config/app.json`, then rerun the build.

**Failure:** `build.ts:88` throws `ENOENT`. Cause: `config/app.json` does not exist.

**Fix (about 5 minutes):**
1. Run `git status config/`.
2. If it shows `app.json` as deleted, run `git restore config/app.json`.
3. If it was never tracked, run `cp config/app.json.example config/app.json`. If there is no example file, create `config/app.json` with `{}` and add the keys `build.ts` reads.

**Verify:**
1. `ls config/app.json` prints the path.
2. `npm run build` finishes with exit code 0 and no `ENOENT`.

If `build.ts:88` still throws, the path is resolved from the wrong working directory. Check how line 88 builds the path.

Next: run `git status config/` and paste the output.