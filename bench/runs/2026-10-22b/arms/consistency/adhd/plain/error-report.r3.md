Restore `config/app.json`, then rerun the build. About 2 minutes.

**Failure:** `build.ts:88` throws `ENOENT` because `config/app.json` does not exist.

**Fix:**
1. Run `git status config/`
2. If the file shows as deleted, run `git checkout -- config/app.json`
3. If it was never tracked, copy your template: `cp config/app.example.json config/app.json`. If there is no template, create `config/app.json` containing `{}` and add the required keys.

**Verify:**
1. Run `test -f config/app.json && echo ok`. Expected output: `ok`.
2. Run `npm run build`. Expected result: no `ENOENT`, and the build passes `build.ts:88`.

Next: run `git status config/` and paste the output if it doesn't match step 2 or 3.