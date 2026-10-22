Add the header to the failing test's request:

```ts
await request(app)
  .get('/your-route')
  .set('Authorization', `Bearer ${token}`)
  .expect(200);
```

**Cause:** The route requires auth. With no `Authorization` header, the server correctly returns 401. The test is wrong, not the route.

**Steps (about 2 minutes):**
1. Open the failing test and find the request at the failing line.
2. Add `.set('Authorization', \`Bearer ${token}\`)` as shown above. Equivalent for `fetch` or axios: `headers: { Authorization: \`Bearer ${token}\` }`.
3. If `token` doesn't exist in the test yet, create one in `beforeAll` with your app's token helper, or use a hardcoded test token if the auth middleware is mocked.
4. Rerun the test.

**Next:** Run the test. If it still fails, paste the first failing line and the line where the request is built.