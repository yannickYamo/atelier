Next: read the 8 steps below, then try Step 1 in under 2 minutes.

**Who is involved**
- Resource owner: the user.
- Client: the app that wants access (often a SPA, mobile app, or CLI that cannot keep a secret).
- Authorization server (AS): authenticates the user and issues tokens.
- Resource server (API): accepts access tokens.

**Why PKCE exists**
The authorization code travels through the browser (a redirect URL), where it can be intercepted by a malicious app or a browser extension. Without PKCE, anyone holding the code could exchange it for tokens. PKCE (Proof Key for Code Exchange, RFC 7636) binds the code to the client instance that started the flow, so a stolen code is useless.

**The steps**

1. **Client creates a code verifier.** Generate a random string, 43-128 characters, from the characters A-Z a-z 0-9 - . _ ~. Use a cryptographically secure random source. Keep it in memory or session storage. Never send it yet.
   ```
   code_verifier = base64url(random_bytes(32))
   ```

2. **Client derives the code challenge.** Hash the verifier with SHA-256 and base64url-encode it (no padding). This is the `S256` method. Plain (challenge = verifier) exists but should only be used if S256 is impossible.
   ```
   code_challenge = base64url(SHA256(code_verifier))
   ```

3. **Client redirects the user to the authorization endpoint.** The browser is sent to the AS with these query parameters:
   ```
   GET /authorize?
     response_type=code
     &client_id=abc123
     &redirect_uri=https://app.example.com/callback
     &scope=openid profile email
     &state=xyz789
     &code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
     &code_challenge_method=S256
   ```
   - `state` is a random value that protects against CSRF. The client checks it on return.
   - `redirect_uri` must exactly match one registered with the AS.

4. **AS authenticates the user and asks for consent.** The user logs in (password, passkey, MFA) and approves the requested scopes. The AS stores the `code_challenge` and `code_challenge_method` alongside the pending authorization.

5. **AS redirects back with an authorization code.** The browser is sent to your redirect URI:
   ```
   https://app.example.com/callback?code=SplxlOBeZQQYbYS6WxSbIA&state=xyz789
   ```
   The client verifies that `state` matches what it sent. If not, abort. The code is short-lived (typically under 60 seconds) and single-use.

6. **Client exchanges the code for tokens, sending the verifier.** This is a direct back-channel POST, not a browser redirect:
   ```
   POST /token
   Content-Type: application/x-www-form-urlencoded

   grant_type=authorization_code
   &code=SplxlOBeZQQYbYS6WxSbIA
   &redirect_uri=https://app.example.com/callback
   &client_id=abc123
   &code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
   ```
   Confidential clients also authenticate here (client secret or private key JWT). Public clients rely on PKCE alone.

7. **AS verifies the PKCE proof, then issues tokens.** The AS hashes the received `code_verifier` with SHA-256, base64url-encodes it, and compares it to the stored `code_challenge`. If they match, and the code, `redirect_uri`, and `client_id` are valid and unused, the AS returns:
   ```json
   {
     "access_token": "eyJhbGciOi...",
     "token_type": "Bearer",
     "expires_in": 3600,
     "refresh_token": "8xLOxBtZp8",
     "id_token": "eyJhbGciOi..."
   }
   ```
   An attacker who stole the code in step 5 does not have the verifier (it never left the client), so the hash check fails and the exchange is rejected.

8. **Client calls the API with the access token.**
   ```
   GET /api/resource
   Authorization: Bearer eyJhbGciOi...
   ```
   When the access token expires, use the refresh token at `/token` with `grant_type=refresh_token` to get a new one. Public clients should use refresh token rotation (each refresh returns a new refresh token and invalidates the old one).

**Common failure causes and fixes**
- `invalid_grant` at the token endpoint: the verifier does not hash to the stored challenge, the code was already used or expired, or `redirect_uri` differs from step 3. Fix: reuse the exact same verifier and redirect URI, and exchange the code immediately.
- `redirect_uri_mismatch`: the URI is not registered exactly (scheme, host, port, path). Fix: register the exact string.
- State mismatch on callback: the stored `state` was lost (new tab, cleared storage). Fix: persist `state` and the verifier together in session storage before redirecting.

**Security notes**
- Generate a fresh verifier per authorization request. Never reuse one.
- Always use S256, never plain, when the AS supports it.
- Use PKCE for all clients, including confidential ones. OAuth 2.1 requires it.
- Do not put tokens in URLs. Only the short-lived code appears in the redirect.

Next action (under 2 minutes): run `openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n'` in a terminal to produce a code verifier and see step 1 in practice.