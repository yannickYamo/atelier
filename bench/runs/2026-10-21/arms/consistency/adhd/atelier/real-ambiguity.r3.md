Run your project's deploy command from the repo root, on the branch you want live:

```
git push origin main
```

That only triggers a deploy if CI/CD is wired to `main`. "It" isn't named in your request, so I can't confirm the right command or target.

Step 1 of 3 done: gave the default deploy command. Next: confirm what "it" is.

1. Run `git remote -v && git log -1 --oneline` to confirm the repo and the commit you're shipping.
2. Check for a deploy script: `ls .github/workflows Makefile package.json 2>/dev/null`. If one exists, use its deploy target instead of the push above.
3. After the deploy finishes, open your production URL and check that the change is live.

Next action (under 2 minutes): paste the output of step 2 here, and I'll give you the exact deploy command for your setup.