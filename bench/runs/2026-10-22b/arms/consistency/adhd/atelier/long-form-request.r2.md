Generate a random `code_verifier` in your client before you do anything else; everything in the flow hangs off it.

**The core idea.** The authorization code flow lets a client get tokens without ever handling the user's password. PKCE (Proof Key for Code Exchange, pronounced "pixy") adds a one-time secret that proves the app redeeming the code is the same app that asked for it. Imagine a public client, such as a mobile app or single-page app, that cannot keep a client secret. Say a malicious app on the same phone intercepts the redirect carrying the authorization code. Without PKCE, it could trade that code for tokens. With PKCE, the stolen code is useless because the attacker does not hold the verifier.

**The actors.**
- **Resource owner:** the user.
- **Client:** your app.
- **Authorization server:** issues codes and tokens (the login and consent page plus the token endpoint).
- **Resource server:** the API that accepts access tokens.

**The flow, step by step.**

1. **Create the verifier.** The client generates `code_verifier`, a high-entropy random string of 43 to 128 characters using letters, digits, `-`, `.`, `_`, and `~`. It stays in client memory or session storage. It is never sent in the first leg.

2. **Derive the challenge.** The client computes `code_challenge = BASE64URL(SHA256(code_verifier))` and sets `code_challenge_method=S256`. A hash is one-way, so seeing the challenge does not reveal the verifier. Use `plain` (challenge equals verifier) only if SHA-256 is truly unavailable; it gives much weaker protection.

3. **Send the user to the authorization endpoint.** The client redirects the browser (or opens the system browser) to something like:

```
GET /authorize?
  response_type=code
  &client_id=abc123
  &redirect_uri=https://app.example.com/callback
  &scope=openid profile
  &state=xyz789
  &code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
  &code_challenge_method=S256
```

   - `state` is a random value you check on return. It defends against CSRF.
   - `redirect_uri` must exactly match one registered with the authorization server.

4. **User authenticates and consents.** The authorization server shows its login page, then a consent screen listing the scopes. Your app never sees the credentials. The server stores the `code_challenge` alongside the code it is about to issue.

5. **Receive the authorization code.** The server redirects the browser back:

```
https://app.example.com/callback?code=SplxlOBeZQQYbYS6WxSbIA&state=xyz789
```

   The client confirms `state` matches what it sent, and aborts if it does not. The code is short-lived (typically about a minute or less) and single-use.

6. **Redeem the code with the verifier.** The client makes a direct back-channel POST to the token endpoint:

```
POST /token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=SplxlOBeZQQYbYS6WxSbIA
&redirect_uri=https://app.example.com/callback
&client_id=abc123
&code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
```

7. **Server verifies PKCE.** The server hashes the submitted `code_verifier` with SHA-256, base64url-encodes it, and compares the result to the `code_challenge` it stored in step 4. It also checks that the code is unexpired and unused, and that `redirect_uri` and `client_id` match. If anything fails, it returns an error such as `invalid_grant`.

8. **Receive tokens.** On success the server returns JSON:

```
{
  "access_token": "...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "...",
  "id_token": "..."   // only if openid scope was requested
}
```

9. **Call the API.** The client sends `Authorization: Bearer <access_token>` to the resource server, which validates the token and serves the request.

10. **Refresh when needed.** When the access token expires, the client POSTs `grant_type=refresh_token` to the token endpoint. For public clients, prefer refresh token rotation, where each refresh issues a new refresh token and invalidates the old one.

**Why the attack fails.** An attacker who intercepts the code in step 5 sees only the `code_challenge` (from the front channel) and the code. To redeem it, they must send a `code_verifier` that hashes to the stored challenge. They cannot reverse SHA-256, and the real verifier never traveled over the redirect. The back-channel call in step 6 is the only place the verifier appears, and it goes straight from client to server over TLS.

**Why this replaces the implicit flow.** The implicit flow returned tokens directly in the redirect URL, exposing them to browser history, referrer headers, and injected scripts. The code flow with PKCE keeps tokens off the front channel entirely. Current OAuth security guidance (the OAuth 2.0 Security Best Current Practice and the OAuth 2.1 draft) recommends PKCE for all clients, including confidential ones.

**Implementation pitfalls.**
- Generate the verifier with a cryptographically secure random source, not `Math.random()`.
- Use a fresh verifier and `state` per authorization request.
- Register exact redirect URIs; avoid wildcards.
- On mobile, use the system browser (ASWebAuthenticationSession, Custom Tabs) rather than an embedded web view.
- Store tokens in the platform's secure storage. In browsers, prefer keeping them in memory over `localStorage`.

**Facts to verify before relying on them:** the 43 to 128 character verifier range and the S256 method come from RFC 7636; the "about a minute" code lifetime is a common recommendation, not a fixed rule, so check your provider's setting.

**Next action (under 2 minutes):** open your OAuth client library's docs and confirm it sends `code_challenge_method=S256` by default.