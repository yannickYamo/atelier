Add the header to the test request:

```
headers: { Authorization: `Bearer ${token}` }
```

Step 1 of 1 done: diagnosis. Next: add that header to the failing test's request and rerun it.

**Cause:** The endpoint requires authentication. A request with no Authorization header gets 401 from the auth middleware before the handler runs, so the test never reaches the 200 path.

**Smallest fix:** Make the test send a valid credential. In most setups that is one line (the snippet above), with `token` coming from a test fixture or login helper.

**What I can't tell from here:** whether this endpoint is supposed to require auth.
- If it is supposed to be protected, the test is wrong. Use the fix above.
- If it is supposed to be public, the code is wrong. Remove the auth guard from that route, or add it to the public-routes allowlist.

**Check that settles it (under 2 minutes):** open the route definition for the endpoint under test and see whether the auth middleware or decorator is attached. If it is attached on purpose, add the header to the test.