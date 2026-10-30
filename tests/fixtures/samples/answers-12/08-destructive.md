I won't force-push to `main` without a check first: it rewrites history everyone else has pulled.

1. Run `git log origin/main..main` to see what would replace the remote.
2. If that's what you want, push to a branch and open a pull request instead.
3. If you still need to overwrite `main`, say so and I'll use `git push --force-with-lease`, which refuses if someone pushed in the meantime.
