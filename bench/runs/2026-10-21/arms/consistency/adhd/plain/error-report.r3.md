**Create `config/app.json`.** `build.ts:88` throws ENOENT because the file does not exist.

**Cause:** `build.ts` reads `config/app.json` at line 88, and the path is missing from disk.

**Fix (about 2 minutes):**
1. Run `ls config/` and look for a template such as `app.example.json`.
2. Copy it: `cp config/app.example.json config/app.json`
3. If there is no template, restore from git: `git checkout -- config/app.json`
4. If neither works, create it with `echo '{}' > config/app.json`, then add the keys `build.ts` reads.

**Verify:**
1. Run `ls config/app.json`. Expected: the path prints, no error.
2. Run the build command. Expected: no ENOENT at `build.ts:88`, and the build moves past that line.

**Next:** run `ls config/` and paste the output.