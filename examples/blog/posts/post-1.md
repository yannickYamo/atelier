# We turned off our own feature flag system for a week

Last March our deploy pipeline broke for eleven hours. Not the build. Not the tests. The flag
service that gates every release went down, and because every release path checked it first,
nothing could ship. We had built a single point of failure and called it safety.

Here is what we actually did about it.

We removed the hard dependency. The flag service is now advisory: if it does not answer within
200ms, the deploy proceeds with the last known state cached on disk. That cache is written on
every successful check, so the worst case is a deploy running on flags that are up to one poll
stale, which is a risk we can name and size.

We did not replace the vendor. Three people wanted to. The vendor was not the problem, the
coupling was, and swapping vendors would have moved the same failure to a new logo.

Two numbers from the eleven months since: zero deploys blocked by flag-service availability, and
one incident where stale flags shipped a half-finished onboarding screen to 4% of users for nine
minutes. That trade is one I would make again, and I want to be honest that it is a trade and not
a fix.

If your release path has a service in front of it, ask what happens when that service is slow
rather than down. Slow is the case that takes everyone by surprise.
