# We deleted our staging environment

It cost $14k a month and it had not caught a production bug in seven months. I checked. I went
through every incident from January to August and asked whether staging could have caught it.
Two were config differences that staging did not share. The rest were load-dependent or
data-dependent, and staging had neither real load nor real data.

So we turned it off.

What replaced it is not "nothing," which is the version of this story people expect. Every merge
now goes to production behind a flag, to internal users first, for at least four hours. That
population is 340 people who use the product for actual work and who complain loudly.

We kept one thing from staging: the database migration dry-run. Migrations are the case where
being wrong is expensive and slow to reverse, and a rehearsal against a restored snapshot is
worth the twenty minutes it costs.

I do not know yet whether this holds at a larger headcount. We are 60 people. At 600 the internal
population stops being a coherent group and the four-hour soak probably has to become something
else. I will find out.

The point is not that staging is waste. It is that we had never once asked our staging environment
to justify its existence, and when we finally did, it could not.
