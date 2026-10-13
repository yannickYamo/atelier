---
request: Review pull request #482 "Add exponential backoff to invoice webhook retries" in the Larkfield billing service.
---

PR #482: Add exponential backoff to invoice webhook retries

## Verdict

**Request changes**. The attempt counter is lost on restart and retries carry no jitter, so dead endpoints never reach the dead-letter queue and recovering ones get stampeded.

## Summary

This PR replaces the fixed 30-second retry in `WebhookDispatcher` with exponential backoff, as BILL-2291 asked, because fixed retries were hammering merchant endpoints during outages. Delays start at 2 seconds and double for up to 8 attempts. Attempt counts move from the database into an in-process dictionary. A new `backoff_delay` helper computes the wait.

## Blocking Issues

1. **Attempt counter lost on restart.** `src/billing/webhooks/dispatcher.py:88` reads `self._attempts = {}`. Every deploy resets the counts to zero. A merchant whose endpoint is permanently down is retried forever and never lands in the dead-letter queue. Suggest: keep the count in the existing `webhook_delivery.attempts` column.
2. **No jitter on the delay.** `src/billing/webhooks/backoff.py:27` reads `return base * 2 ** attempt`. When a merchant endpoint recovers from an outage, every queued webhook for that merchant retries at the same instant. Suggest: return `random.uniform(0, base * 2 ** attempt)`.
3. **Off-by-one on the attempt limit.** `src/billing/webhooks/dispatcher.py:104` reads `if attempt > MAX_ATTEMPTS:`. With `MAX_ATTEMPTS = 8` a ninth delivery goes out, against the 8 stated in the description. Suggest: compare with `>=`.

## Non-Blocking Suggestions

- Nit: `backoff_delay` at `src/billing/webhooks/backoff.py:19` has no type hint on `attempt`.
- Consider: moving `MAX_ATTEMPTS` into `settings/webhooks.toml` beside `BASE_DELAY_SECONDS`.
- Consider: logging the chosen delay per attempt in a follow-up PR, since it is out of scope here.

## Questions

1. Does the 2-second base delay come from merchant feedback, or is it a starting guess?
2. Is `DeadLetterQueue.push` safe to call twice for one delivery if two workers hit the limit together?

## Test Coverage

| Scenario | Covered | Where |
| --- | --- | --- |
| Delay doubles on each attempt | Yes | `tests/webhooks/test_backoff.py::test_delay_doubles` |
| Attempt count survives a restart | No | n/a |
| Ninth attempt is refused | Partial | `tests/webhooks/test_dispatcher.py::test_max_attempts` |
| Endpoint fails with 500, then returns 200 | Yes | `tests/webhooks/test_dispatcher.py::test_recovers_after_failure` |

## What Works

- Pulling the delay maths into `backoff_delay` keeps `WebhookDispatcher.send` readable and testable alone.
- I ran `tests/webhooks/test_backoff.py` locally and all 6 tests pass.
- The description from @tmarsh states the 2-second base and the 8-attempt limit plainly, which made checking quick.

## Next Steps

1. Persist the attempt count in `webhook_delivery.attempts`.
2. Add jitter to `backoff_delay`.
3. Fix the comparison at `src/billing/webhooks/dispatcher.py:104`.
4. Add a test that restarts the dispatcher between attempts.

Re-review needed: yes
