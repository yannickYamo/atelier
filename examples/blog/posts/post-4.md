# The code review rule that cut our cycle time in half

Our median PR sat for 31 hours before first review. Everyone agreed this was bad. Three separate
attempts to fix it with process — a review rota, a Slack reminder bot, a dashboard — moved the
number by nothing.

The thing that worked was a size limit. No PR over 400 lines gets reviewed. It gets sent back
with a note asking for it to be split.

Median time to first review is now 4 hours.

I want to be careful about what I am claiming. I cannot prove the limit caused the drop, because
we changed one other thing in the same quarter: we stopped assigning reviewers and let people
claim PRs instead. Two variables, one measurement, and I did not design it as an experiment
because I wanted the problem fixed more than I wanted to know which half fixed it.

What I will say is that the rejections stopped after five weeks. People started splitting work
before submitting it, which means the limit was doing its job upstream of review entirely.

The obvious lesson is "small PRs are better," and everyone already believes that, which is why
believing it changed nothing for three attempts. The limit worked because it was a wall, not a
preference.
