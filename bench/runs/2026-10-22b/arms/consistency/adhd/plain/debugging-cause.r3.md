Add the header to the failing request in the test:

```ts
await request(app)
  .get('/your-route')
  .set('Authorization', `Bearer ${token}`) // add this line
  .expect(200);
```

**Cause:** The route requires auth. The request sends no `Authorization` header, so the server correctly returns 401. The test is wrong, not the server.

**Steps:**
1. Get a valid token in the test setup (`beforeAll`). Use your existing login helper, or sign one with the same secret the app uses.
2. Add the `.set('Authorization', ...)` line above to the failing request.
3. Run `npm test -- <your-spec-file>`

**Time:** About 5 minutes if a token helper exists, 15 if you have to write one.

**Exception:** If this route is meant to be public, the bug is in the app. Remove the auth middleware from that route instead.

Next: run the test and paste the first failing line if it still fails.