---
request: Review pull request 812, which adds retry logic to the HTTP client.
---
Summary: adds exponential backoff to `HttpClient.send` for 5xx responses.

Blocking

- `client.ts:88`: the retry loop has no upper bound on attempts when `maxRetries` is 0. Can we treat 0 as "no retry" rather than "retry forever"?
- `client.ts:102`: this changes the public signature of `send` (new `options` parameter). This needs a changelog entry.

Nits

- `client.ts:95`: `delayMs` could be `const`.
- `client_test.ts:40`: would a test for the 0-retries case catch the issue above?

Verdict: request changes.
