Add the header to the test request:

```ts
await request(app)
  .get('/your-route')
  .set('Authorization', `Bearer ${token}`)
  .expect(200);
```

**Cause:** The auth middleware rejects requests with no `Authorization` header, so it returns 401 before the handler runs.

**Where the token comes from:** Use whatever the other passing tests use. If none do, sign one with your test secret, e.g. `jwt.sign({ sub: 'test-user' }, process.env.JWT_SECRET)`.

**Exception:** If this route is meant to be public, the bug is in the app, not the test. Remove the auth middleware from that route instead.

About 2 minutes either way.

Next: tell me which case applies (protected or public route), or paste the test's request lines and I'll adapt the fix.