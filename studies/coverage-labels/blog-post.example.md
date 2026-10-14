# Our p99 Latency Dropped 64% When We Shrank the Connection Pool

*A smaller pool fixed what a bigger one made worse, and the reason was in the docs the whole time.*

In early March the checkout API at Pellwick started timing out at lunch. Its p99 latency, the response time that 99 in 100 requests beat, had climbed to 1,840 ms against a target of 800 ms. I spent 9 days on it. The fix was a one-line config change, in the opposite direction from the one I first made.

## The Problem

The database was saturated while the application looked idle. Postgres 15.4 reported 480 active connections during the 12:00 to 13:30 peak, on a server with 16 cores. Each API worker held its own pool, so the total grew every time we scaled out. You can read the same figure on your own database with `SELECT count(*) FROM pg_stat_activity WHERE state = 'active';`.

## What We Tried

Two dead ends ate most of those 9 days. Both were my idea.

1. Raising `pool_size` from 20 to 40, which doubled the connections and pushed p99 to 2,310 ms within an hour.
2. Adding a read replica, which took me 3 days to set up and failed because the slow queries were writes.

## What Worked

Shrinking the pool worked. I had assumed `pool_size` was a limit for the whole service. The Tessel 4.2 documentation says otherwise: "pool_size applies per worker process, not per application." With 24 workers at 20 connections each, we were opening 480 connections to a 16-core server.

I cut each worker to 4 connections, 96 in total. The change lives in `config/database.py`:

```python
DATABASE = {
    "engine": "tessel.postgres",
    "pool_size": 4,        # per worker process
    "max_overflow": 0,
    "pool_timeout": 2.0,   # seconds
}
```

Requests now wait briefly in the application for a connection instead of fighting inside the database. Picture a supermarket with 16 tills: letting 480 shoppers crowd them serves nobody faster.

More connections is not more capacity.

## The Numbers

Every measure we track for checkout improved. The figures cover the lunch peak only.

| Metric | Before | After | Change |
| --- | --- | --- | --- |
| p99 latency | 1,840 ms | 660 ms | -64% |
| p50 latency | 210 ms | 140 ms | -33% |
| Active connections at peak | 480 connections | 96 connections | -80% |
| Timeout errors | 312 per day | 9 per day | -97% |

I measured with Gantry 2.8 tracing on all checkout requests between 12:00 and 13:30, comparing the 5 weekdays before the change with the 5 after. This is one service over two weeks, so treat it as a case and not a law.

The fix was not free. It cost 9 days of my time. With `max_overflow` at 0, a stuck query also holds its worker for the full 2.0 second `pool_timeout`.

## What I'd Do Differently

I would read the pool documentation before touching the pool. My mistake was changing `pool_size` on the first day without counting what it multiplied by, which cost us an hour of worse latency in production. I would also graph total connections per database, not per worker, from the start. My guess is that view alone would have saved a week.

## Takeaways

- Count total connections across every process before changing a pool setting.
- Compare peak connections with database cores; a large ratio means requests queue in the wrong place.
- Read what a setting is scoped to before assuming it is global.
