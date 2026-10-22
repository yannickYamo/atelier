Add the header to the failing request in the test:

```js
.set('Authorization', `Bearer ${token}`)
```

**Cause:** The endpoint requires auth. The test sends no `Authorization` header, so the server correctly returns 401.

**Steps:**
1. Open the failing test and find the request call.
2. Add the `.set(...)` line above to it. (In `fetch` or `axios`, use `headers: { Authorization: \`Bearer ${token}\` }`.)
3. Run that test file.

**Time:** About 2 minutes if the test suite already has a token helper. About 10 if you need to create one.

**If it's still 401:** the token is invalid or expired, not missing.

Next: open the failing test and find the request call.