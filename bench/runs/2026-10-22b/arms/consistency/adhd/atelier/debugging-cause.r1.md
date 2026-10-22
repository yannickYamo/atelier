Add the header to the test request:

```
Authorization: Bearer <valid-test-token>
```

Example (supertest):

```js
await request(app)
  .get('/your-endpoint')
  .set('Authorization', `Bearer ${token}`)
  .expect(200);
```

**Cause:** the server rejected a request with no credentials. The 401 is correct; the test is what's wrong.

**Check that settles the scheme (under 2 minutes):** open the auth middleware and read which header and prefix it parses. `Bearer`, `Basic`, and a bare API key all use different formats. Match that format in the test.

If the 401 persists after adding the header, the token is invalid or expired. Generate a fresh one in the test setup.

**Next action:** run `grep -rn "authorization" src/` (or your middleware folder) and copy the expected format into the test.