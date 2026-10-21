Add the header to the test request:

```js
.set('Authorization', `Bearer ${token}`)
```

Example with supertest:

```js
const res = await request(app)
  .get('/your-route')
  .set('Authorization', `Bearer ${token}`);
expect(res.status).toBe(200);
```

**Cause:** the route requires auth. With no `Authorization` header, the middleware rejects the request with 401 before the handler runs.

**Time:** about 2 minutes if the test suite already has a token helper. About 10 minutes if you need to generate a valid token.

**Exception:** if this route should be public, the bug is in the app, not the test. Check whether the auth middleware is applied to it.

Next: run the test again and paste the first line of output if it still fails.