Add the auth header to the test request. This assumes the endpoint requires a Bearer token and the test sends none:

```js
// before
await request(app).get('/api/resource')

// after
await request(app).get('/api/resource').set('Authorization', `Bearer ${token}`)
```

Cause: the server returns 401 when `Authorization` is missing. The test expects 200, so the request is rejected before the handler runs.

Assumptions:
- The test uses a supertest-style client, and `token` is a valid test token from your fixtures or a login helper. Adjust the syntax to your client.
- The endpoint is meant to be protected. If it is meant to be public, the fix is in the server instead: remove the auth middleware from that route.

Check that settles which case applies (under 2 minutes): run `curl -i http://localhost:3000/api/resource` against the app with no header. If it returns 401, the route is protected and the test fix above is correct.

Next action: open the failing test, add the `.set('Authorization', ...)` line, and rerun that one test.