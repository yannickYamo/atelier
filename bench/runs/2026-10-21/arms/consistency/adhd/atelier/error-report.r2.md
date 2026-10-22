Create the missing file: `echo '{}' > config/app.json`

Step 1 of 3 done: cause found. Next: create the file, then verify.

**Cause:** `build.ts:88` throws `ENOENT` because `config/app.json` does not exist. The build reads it and the path is not there.

**Fix:**

1. Create the file from the repo root, using real settings if you have them (check for `config/app.example.json` and copy it with `cp config/app.example.json config/app.json`): `mkdir -p config && echo '{}' > config/app.json`
2. Re-run the build: `npm run build`

**Verify:**

- `ls config/app.json` prints the path (takes under 1 second).
- The build passes `build.ts:88` with no `ENOENT`.

If it now fails on a missing key, the `{}` placeholder is too empty. Fill in the keys from the example file.

**Next action (under 2 minutes):** run `ls config/` and see whether `app.example.json` is there.