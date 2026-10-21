Add the header to the test request:

```
headers: { Authorization: `Bearer ${token}` }
```

Cause: the endpoint requires auth, and the request has no Authorization header, so the server returns 401 before it reaches the handler. The test's expected 200 is fine; the request is missing credentials.

What I can't confirm from here: that a Bearer token is the scheme this API uses (it could be Basic or an API-key header), and where your test gets a valid token. The check that settles it is the auth middleware or the API docs for the scheme.

1. Add the header above using a valid test token (from a fixture, env var, or login helper), then rerun the test.

Step 1 of 1 done: diagnosis and fix given. Next: open the auth middleware and confirm the scheme name (Bearer vs. Basic vs. custom header).