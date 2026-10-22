Run `ls config/` to see if a template exists.

**Failure:** `build.ts:88` throws `ENOENT: no such file or directory, open 'config/app.json'`.
**Cause:** `config/app.json` is missing. The build reads it at line 88 and does not create it.

**Fix (about 2 minutes):**
1. Copy the template: `cp config/app.example.json config/app.json`
2. If there is no template but the file was tracked, restore it: `git checkout -- config/app.json`
3. If neither works, the file was never committed. Get it from a teammate or a deploy environment.

**Verify:**
1. Run `ls config/app.json`. Expect the path printed back, not "No such file."
2. Run `npm run build`. Expect exit code 0 and no `ENOENT` in the output.

If `config/app.json` is gitignored, it won't come with a fresh clone. Each environment needs its own copy.

Next: run `ls config/` and paste the output if no template shows up.