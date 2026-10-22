Run this from the repo root:

```
ls config/app.json || cp config/app.example.json config/app.json
```

**Error:** `build.ts:88` throws `ENOENT` because it reads `config/app.json` and the file does not exist at that path.

**Cause to confirm:** the file is either never created (it is usually gitignored and copied from a template) or the build is running from the wrong working directory. Check which one:

1. Run `ls config/` from the repo root. If `app.json` is absent and a template such as `app.example.json` is there, copy it (command above) and fill in any required values.
2. If no template exists, create `config/app.json` with the keys that `build.ts` reads near line 88 (`sed -n '80,95p' build.ts` shows them).
3. If `config/app.json` exists at the root, the build is running from another directory. Run it from the repo root, or resolve the path from `__dirname` in `build.ts:88` instead of the current directory.

**Verify:** run `ls config/app.json && npm run build` (swap in your build command). The `ENOENT` is gone and the build exits with code 0.

Step 0 of 3 done: error diagnosed. Next: run `ls config/` from the repo root and see whether `app.json` or a template is listed.