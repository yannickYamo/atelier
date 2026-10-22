Add the header to the failing test's request:

```ts
const res = await request(app)
  .get('/your-route')
  .set('Authorization', `Bearer ${token}`);

expect(res.status).toBe(200);
```

**Cause:** The route requires auth and the test sends none, so the server correctly returns 401. The code is fine and the test is incomplete.

**If the test has no `token` yet:** get one once in a setup block.

```ts
let token: string;
beforeAll(async () => {
  const res = await request(app)
    .post('/login')
    .send({ email: 'test@example.com', password: 'testpass' });
  token = res.body.token;
});
```

**Time:** about 2 minutes.

**Next:** make the edit, run the test, and paste the result if it still fails. If it returns 401 with the header set, the token is invalid or expired, and that is a different bug.