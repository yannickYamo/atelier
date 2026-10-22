Add the header to the test request:

```
Authorization: Bearer <token>
```

Example (supertest/JS style):

```js
await request(app).get('/your-route').set('Authorization', `Bearer ${token}`).expect(200);
```

**Cause:** the endpoint requires auth, the request sends none, so the server correctly returns 401. The test is wrong, not the server.

**Check that settles the scheme (about 10 seconds):** open the auth middleware, or run `curl -i <url>` and read the `WWW-Authenticate` response header. If it says `Basic` or names an API-key header, swap the header format to match. Bearer is the assumption here.

Step 1 of 1 done: diagnosis and fix given. Next: run `curl -i <url>` against your endpoint and read the `WWW-Authenticate` header.