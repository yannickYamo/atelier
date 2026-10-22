Create the missing file: `mkdir -p config && echo '{}' > config/app.json`

**Failure:** `build.ts:88` throws `ENOENT` (no such file or directory).

**Cause:** `build.ts` reads `config/app.json` at line 88, and that file does not exist at the path the build resolves. Either it was never created, was deleted, or is gitignored and absent in this checkout.

**Fix:**
1. Create the file with the command above, then replace `{}` with your real settings. If a template exists (for example `config/app.example.json`), copy it instead: `cp config/app.example.json config/app.json`.
2. Run the build from the project root. A relative path like `config/app.json` resolves against the current working directory, so running from another directory reproduces the same error.

**Verify:**
1. Confirm the file exists: `ls config/app.json` should print the path.
2. Re-run the build. The `ENOENT` at `build.ts:88` should be gone and the build should proceed past that line.

If the build now fails with a JSON parse error, the file contents are invalid. Paste the new error here and I'll fix it.