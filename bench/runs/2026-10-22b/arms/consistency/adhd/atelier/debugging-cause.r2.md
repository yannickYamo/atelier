Add the header to the test request:

```
Authorization: Bearer <valid-test-token>
```

Example (supertest style):

```js
request(app).get('/endpoint').set('Authorization', `Bearer ${token}`).expect(200)
```

Cause: the endpoint requires authentication, and the request has no Authorization header, so the server returns 401 before the handler runs.

Unknown: the auth scheme. I assumed Bearer; if your API uses Basic or an API key, the header format differs. Check the auth middleware (or the API docs) for the scheme it parses, and use that format.

Next action (under 2 minutes): open the auth middleware file, find the line that reads `req.headers.authorization`, and note the expected prefix.