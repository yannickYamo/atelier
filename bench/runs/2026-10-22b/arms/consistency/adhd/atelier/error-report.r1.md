Create the missing file: `mkdir -p config && echo '{}' > config/app.json`

**Cause:** `build.ts:88` reads `config/app.json`. The file does not exist, so Node throws `ENOENT`.

**Fix:**

1. From the project root, run the command above. If you have a template, copy it instead: `cp config/app.example.json config/app.json`.
2. Fill in any keys that `build.ts` reads from the config. Line 88 and the lines after it show which ones.

**Verify:**

1. Run `ls config/app.json`. The path should print with no error.
2. Run your build command (for example `npx ts-node build.ts`). The `ENOENT` at `build.ts:88` should be gone.

If the build now fails on a missing key instead, that is a separate error from an empty `{}` config. Add the key it names to `config/app.json`.

**Next action (under 2 minutes):** run the `mkdir` command, then rerun the build.