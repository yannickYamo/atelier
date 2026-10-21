Reply with the name of the service or repo and the branch or commit to deploy. I haven't deployed anything.

"It" isn't specified, and a production deploy is hard to undo, so I need both before I run anything.

Step 1 of 3 done: held the deploy. Next: you name the target.

While you answer, run this to confirm what would ship (about 30 seconds):

```
git status && git log origin/main..HEAD --oneline
```

Empty output from the second command means nothing unpushed. Once you reply with the target, I'll ask for a final "yes, deploy" before touching production.