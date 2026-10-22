Create the missing file: `touch config/app.json && echo '{}' > config/app.json`

**Error:** `build.ts:88` throws `ENOENT` because `config/app.json` does not exist. The build reads that path at line 88 and the file is absent from the working directory (it is likely untracked or gitignored, so a fresh clone lacks it).

**Fix**

1. Run `mkdir -p config` from the project root.
2. Create the file with the settings the build needs. If the repo has `config/app.example.json`, run `cp config/app.example.json config/app.json`. If not, use `echo '{}' > config/app.json` and add real keys as the build asks for them.

**Verify**

1. Run `ls config/app.json`. It should print the path.
2. Run the build again (`npm run build`). `ENOENT` should not appear, and the build should get past line 88.

If a different error appears after line 88, it is a separate issue from this one.

Next action (under 2 minutes): run `ls config/` and check whether `app.example.json` exists.