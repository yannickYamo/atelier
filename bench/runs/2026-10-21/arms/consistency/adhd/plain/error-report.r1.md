Restore or create `config/app.json`, then rerun the build.

**Failure:** `build.ts:88` throws `ENOENT`. Cause: `config/app.json` does not exist.

**Fix (about 2 minutes):**
1. Check whether it was deleted from git: `git status config/app.json`
2. If it shows as deleted, restore it: `git restore config/app.json`
3. If it was never tracked, copy a template: `cp config/app.example.json config/app.json`
4. If there is no template, create `config/app.json` with the keys `build.ts` reads near line 88.

**Verify:**
1. Confirm the file exists: `ls config/app.json`
2. Confirm it parses: `node -e "JSON.parse(require('fs').readFileSync('config/app.json','utf8'))"`
3. Rerun the build. It passes if there is no `ENOENT` and the exit code is 0.

Next: run `git status config/app.json` and paste the output.