Create `config/app.json`.

**Failure:** `build.ts:88` throws `ENOENT`. `config/app.json` does not exist.

**Cause:** The file was deleted, gitignored, or never created on this machine.

**Fix:**
1. Run `git restore config/app.json`. If it was deleted from the working tree, this brings it back.
2. If that errors, run `cp config/app.example.json config/app.json`.
3. If no example file exists, create `config/app.json` with `{}`, then add the keys `build.ts` reads.

**Verify:**
1. Run `ls config/app.json`. It should print the path.
2. Run your build command. The `ENOENT` at `build.ts:88` should be gone.

**Time:** About 2 minutes if the file is in git or an example exists. About 10 minutes if you must rebuild the keys by hand.

**Next:** Run `ls config/` and paste the output. That shows which fix applies.