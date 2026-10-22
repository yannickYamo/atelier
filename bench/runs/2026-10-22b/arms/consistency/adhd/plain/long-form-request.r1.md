## Short version

PKCE (Proof Key for Code Exchange, pronounced "pixie") proves that the app that **started** a login is the same app that **finishes** it. The app invents a one-time secret, shows the server only a hash of it at the start, and reveals the real secret at the end. Use it for any client that can't safely store a client secret (SPAs, mobile, desktop, CLIs). It's also recommended for server-side apps.

## The four parties

1. **User**: owns the account.
2. **Client**: the app that wants access.
3. **Authorization server**: logs the user in and issues tokens (Auth0, Okta, Keycloak, Google).
4. **Resource server**: the API that accepts access tokens.

## Phase 1: Client prepares a secret (no network)

1. Generate a random **`code_verifier`**: 43 to 128 characters from `A-Z a-z 0-9 - . _ ~`. Use a cryptographically secure random source, not `Math.random()`.
2. Compute the **`code_challenge`**:
   ```
   code_challenge = BASE64URL( SHA256( code_verifier ) )
   ```
   No padding (`=`) in the base64url output.
3. Generate a random **`state`** value (CSRF protection).
4. Store `code_verifier` and `state` locally (session storage, memory, or native secure storage). You need them in Phase 4.

## Phase 2: Authorization request (via the browser)

5. Client sends the user's browser to the authorization server:
   ```
   GET https://auth.example.com/authorize
     ?response_type=code
     &client_id=my-app
     &redirect_uri=https://app.example.com/callback
     &scope=openid profile email
     &state=xyz123
     &code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
     &code_challenge_method=S256
   ```
6. The authorization server saves the `code_challenge` alongside this request. It never sees the verifier yet.

## Phase 3: User logs in, server returns a code

7. The user authenticates and approves the requested scopes. The client never sees the password.
8. The server redirects the browser back:
   ```
   https://app.example.com/callback?code=SplxlOBeZQQYbYS6WxSbIA&state=xyz123
   ```
9. The client checks that the returned `state` matches the one it stored. If not, **abort**.

The `code` is short-lived (typically 1 to 10 minutes), single-use, and useless on its own. That's the point: it travels through the browser, where it can leak.

## Phase 4: Token exchange (direct, back-channel)

10. Client POSTs directly to the token endpoint, not through the browser redirect:
    ```
    POST https://auth.example.com/token
    Content-Type: application/x-www-form-urlencoded

    grant_type=authorization_code
    &code=SplxlOBeZQQYbYS6WxSbIA
    &redirect_uri=https://app.example.com/callback
    &client_id=my-app
    &code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
    ```
11. The server hashes the received `code_verifier` with SHA-256, base64url-encodes it, and compares it to the `code_challenge` saved in step 6.
12. If they match, the server responds:
    ```json
    {
      "access_token": "eyJ...",
      "token_type": "Bearer",
      "expires_in": 3600,
      "refresh_token": "8xLOxBtZp8",
      "id_token": "eyJ..."
    }
    ```
    `id_token` appears only if you requested the `openid` scope (OpenID Connect).
13. If they don't match, the server returns `invalid_grant`.

## Phase 5: Use the tokens

14. Call the API with `Authorization: Bearer <access_token>`.
15. When the access token expires, POST `grant_type=refresh_token` to the token endpoint. For public clients, the server should **rotate** refresh tokens: each use returns a new one and invalidates the old one.

## Why this stops the attack

Without PKCE, an attacker who intercepts the `code` (malicious app registered for the same custom URL scheme on mobile, browser extension, leaked logs, referrer headers) can exchange it for tokens, because public clients have no secret to prove identity.

With PKCE, the stolen code is worthless. The attacker doesn't have the `code_verifier`, which never left the legitimate client until the direct HTTPS call in step 10. Reversing SHA-256 to get it from the challenge is infeasible.

## Common mistakes

1. **Using `plain` instead of `S256`.** `plain` sends the verifier as the challenge, so interception defeats it. Use `S256` unless you truly can't hash.
2. **Reusing the verifier** across logins. Generate a fresh one per authorization request.
3. **Skipping `state` validation.** PKCE does not replace CSRF protection in every setup, so check both.
4. **Loose `redirect_uri` matching** on the server. It must be an exact match against a registered value.
5. **Embedded webviews** for login on mobile or desktop. Use the system browser (ASWebAuthenticationSession, Custom Tabs) so the app can't read credentials.

Also store tokens carefully. In SPAs, avoid `localStorage` if you can; prefer in-memory storage or a backend-for-frontend that holds tokens in an HttpOnly cookie.

## Effort estimate

About 30 minutes with a maintained library (AppAuth, `oidc-client-ts`, Auth.js, MSAL). About 2 to 3 hours hand-rolled, mostly spent on edge cases such as refresh, logout, and error handling.

Next: tell me your client type (SPA, mobile, CLI, or server-rendered) and I'll give you the exact library and config for it.