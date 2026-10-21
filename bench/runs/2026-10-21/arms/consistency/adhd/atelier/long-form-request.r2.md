Step 1 of 8 done: you asked for the OAuth authorization code flow with PKCE. Next: the 8 steps below.

**Try it first (under 2 minutes):** generate a PKCE pair in a terminal and keep it open while you read:

```
verifier=$(openssl rand -base64 48 | tr -d '=+/' | cut -c1-64); challenge=$(printf %s "$verifier" | openssl dgst -sha256 -binary | openssl base64 -A | tr '+/' '-_' | tr -d '='); echo "verifier=$verifier"; echo "challenge=$challenge"
```

**The cast**
- **Client**: your app (SPA, mobile, or native app that can't keep a secret).
- **Authorization server (AS)**: issues tokens (Auth0, Okta, Keycloak, Google).
- **Resource server (API)**: accepts the access token.
- **User + browser**: the person who approves access.

**Why PKCE exists**
The plain code flow returns a short-lived `code` through the browser redirect. On public clients, another app or a browser extension can intercept that code and trade it for tokens, because the client has no secret to prove who it is. PKCE (Proof Key for Code Exchange, RFC 7636) fixes this: the client commits to a one-time secret at the start and reveals it at the end. A stolen code is useless without it.

**The flow, step by step**

1. **Client creates the PKCE pair.**
   - `code_verifier`: random string, 43-128 characters (`A-Z a-z 0-9 - . _ ~`).
   - `code_challenge` = `BASE64URL(SHA256(code_verifier))`.
   - `code_challenge_method` = `S256`.
   - Also create a random `state` value (CSRF protection). Store the verifier and state locally (memory or session storage). The verifier never leaves the client yet.

2. **Client sends the user to the authorization endpoint** (browser redirect):
   ```
   GET https://as.example.com/authorize
     ?response_type=code
     &client_id=my-app
     &redirect_uri=https://app.example.com/callback
     &scope=openid profile api.read
     &state=xyz123
     &code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
     &code_challenge_method=S256
   ```
   The AS stores the `code_challenge` against this request.

3. **User authenticates and consents.** The AS shows a login page and a consent screen ("my-app wants to read your data"). The client never sees the user's credentials.

4. **AS redirects back with an authorization code:**
   ```
   https://app.example.com/callback?code=SplxlOBeZQQYbYS6WxSbIA&state=xyz123
   ```
   The code is single-use, short-lived (typically under 60 seconds), and bound to the `code_challenge`, `client_id`, and `redirect_uri`.

5. **Client validates `state`.** Compare the returned `state` to the stored one. If it differs, abort. This blocks forged callbacks.

6. **Client exchanges the code for tokens** (back-channel POST, not a browser redirect):
   ```
   POST https://as.example.com/oauth/token
   Content-Type: application/x-www-form-urlencoded

   grant_type=authorization_code
   &code=SplxlOBeZQQYbYS6WxSbIA
   &redirect_uri=https://app.example.com/callback
   &client_id=my-app
   &code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
   ```
   This is where the verifier is revealed for the first time.

7. **AS verifies PKCE.** It computes `BASE64URL(SHA256(code_verifier))` and compares it to the stored `code_challenge`.
   - Match: it issues tokens.
   - No match: it returns `invalid_grant`.
   An attacker who intercepted only the code in step 4 never saw the verifier, so they fail here.

8. **AS returns tokens:**
   ```json
   {
     "access_token": "eyJhbGciOi...",
     "token_type": "Bearer",
     "expires_in": 3600,
     "refresh_token": "8xLOxBtZp8",
     "id_token": "eyJhbGciOi..."
   }
   ```
   The client calls the API with `Authorization: Bearer <access_token>`. When it expires, the client uses the refresh token at the same `/oauth/token` endpoint (`grant_type=refresh_token`).

**What the AS checks at the token endpoint**
- The code is valid, unexpired, and unused (a reused code should also revoke tokens already issued from it).
- `client_id` and `redirect_uri` exactly match the original request.
- The `code_verifier` hashes to the stored challenge.

**Security rules to keep**
- Always use `S256`. Use `plain` only if SHA-256 is truly impossible.
- Generate the verifier with a cryptographically secure random source, new for every request.
- Register exact `redirect_uri` values; no wildcards.
- Always check `state`.
- Use the system browser for native apps (RFC 8252), not an embedded webview.
- PKCE is now recommended for all clients, including confidential ones (OAuth 2.1 requires it).
- Don't store tokens in `localStorage` if you can avoid it; prefer in-memory or a backend-for-frontend pattern.

**Common errors**
- `invalid_grant`: the verifier doesn't match the challenge, the code was reused or expired, or `redirect_uri` differs. Fix: confirm you send the same verifier you hashed in step 1 and the identical `redirect_uri`.
- `invalid_request` at `/authorize`: `code_challenge` is missing or the method is unsupported. Fix: send both `code_challenge` and `code_challenge_method=S256`.
- State mismatch: the stored state was lost, often due to a page reload or a different tab. Fix: persist state in `sessionStorage` before redirecting.

**Next action (under 2 minutes):** paste the `challenge` from the command above into a manual `/authorize` URL for your AS's test client and confirm the login page loads without an `invalid_request` error.