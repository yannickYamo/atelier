Generate a random `code_verifier` before you send the user anywhere. That one move is what separates PKCE from plain authorization code flow.

```
code_verifier  = base64url(32 random bytes)        # 43-128 chars from [A-Za-z0-9-._~]
code_challenge = base64url(SHA256(code_verifier))
```

## The cast

- **Client**: your app (mobile, SPA, or server). It wants access.
- **User**: the resource owner who grants it.
- **Authorization server (AS)**: authenticates the user, issues tokens.
- **Resource server (API)**: accepts access tokens.

## Why PKCE exists

Plain authorization code flow sends the user to the AS, which redirects back to your app with a short-lived `code`. The client then swaps that code for tokens. The weak point is the redirect: the code travels through the browser or OS, where another app or script can intercept it. This is common on mobile, where several apps can register the same custom URL scheme. In a public client (no secret), an attacker who steals the code can redeem it.

PKCE (Proof Key for Code Exchange, RFC 7636) binds the code to the client instance that started the flow. Think of it as a claim ticket. You tear a ticket in half at the start, hand over one half (the challenge), and must present the other half (the verifier) to collect. A thief who grabs only the code has half a ticket.

## The flow, step by step

1. **Client creates the verifier and challenge.** Generate the `code_verifier` with a cryptographically secure random source and keep it in memory or session storage. Compute `code_challenge` as the SHA-256 hash, base64url-encoded, with no padding. The hash is one-way, so seeing the challenge does not reveal the verifier.

2. **Client redirects the user to the authorization endpoint.** The request carries the challenge, not the verifier:
   ```
   GET /authorize?
     response_type=code
     &client_id=abc123
     &redirect_uri=https://app.example/callback
     &scope=openid profile
     &state=xyz789
     &code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
     &code_challenge_method=S256
   ```
   `state` is a separate random value that protects against CSRF. `code_challenge_method=S256` tells the AS how the challenge was derived. Avoid `plain`, which sends the verifier itself as the challenge and gives up the protection.

3. **AS authenticates the user and collects consent.** Login, MFA, and the consent screen all happen here, on the AS's own pages. Your app never sees the user's password. The AS stores the `code_challenge` and method alongside the code it is about to issue.

4. **AS redirects back with an authorization code.**
   ```
   https://app.example/callback?code=SplxlOBeZQQYbYS6WxSbIA&state=xyz789
   ```
   The code is single-use and short-lived, typically under a minute or two. It is not a token and grants nothing by itself.

5. **Client checks `state`.** Compare the returned value to the one you saved. If they differ, abort. This confirms the response belongs to a request your app started.

6. **Client exchanges the code for tokens, sending the verifier.** This is a direct back-channel POST, not a browser redirect:
   ```
   POST /token
   Content-Type: application/x-www-form-urlencoded

   grant_type=authorization_code
   &code=SplxlOBeZQQYbYS6WxSbIA
   &redirect_uri=https://app.example/callback
   &client_id=abc123
   &code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
   ```

7. **AS verifies the proof.** It hashes the submitted `code_verifier` with SHA-256, base64url-encodes the result, and compares it to the stored `code_challenge`. It also checks that the code is unused and unexpired, and that `redirect_uri` and `client_id` match the original request. If anything fails, it returns `invalid_grant`.

8. **AS returns tokens.**
   ```json
   {
     "access_token": "eyJ...",
     "token_type": "Bearer",
     "expires_in": 3600,
     "refresh_token": "8xLOxBtZp8",
     "id_token": "eyJ..."
   }
   ```
   The `id_token` appears only if you requested OpenID Connect scopes.

9. **Client calls the API.** Send `Authorization: Bearer <access_token>`. The resource server validates the token (signature and claims for a JWT, or introspection for an opaque token) and serves the request.

10. **Client refreshes when the access token expires.** POST `grant_type=refresh_token` to the token endpoint. Public clients should use refresh token rotation, where each refresh issues a new refresh token and invalidates the old one.

## What the attacker sees, and why it fails

Say a malicious app on the same phone registers your custom URL scheme and captures the redirect in step 4. It now holds `code`. It posts to `/token`, but it has no `code_verifier`. It saw only the `code_challenge` in step 2, and SHA-256 cannot be reversed. The AS rejects the request. The legitimate client, which still holds the verifier, completes the exchange.

The protection depends on the verifier never leaving the client until step 6, and on the AS enforcing the check. If the AS lets a client skip PKCE when it sends no challenge, an attacker can simply send none. Require PKCE per client.

## Details that cause real bugs

- **Entropy:** use a CSPRNG, not `Math.random()`. A guessable verifier defeats the scheme.
- **One verifier per request:** never reuse a verifier across authorization attempts.
- **Exact redirect URI matching:** the AS should compare registered URIs as exact strings. Loose matching reopens the interception problem PKCE is meant to close.
- **Storage:** in a SPA, keep the verifier in `sessionStorage` or memory, scoped to the tab. Keep tokens out of `localStorage` where XSS can read them if you can avoid it.
- **Use the system browser on mobile:** use ASWebAuthenticationSession on iOS or Custom Tabs on Android, not an embedded WebView. This keeps credentials away from your app and lets the user's existing session apply. Prefer claimed HTTPS links (universal links or app links) over custom schemes for the redirect.
- **PKCE and client secrets:** confidential clients (server-side apps) can use both a secret and PKCE. Current guidance (OAuth 2.1 draft) recommends PKCE for all clients using this flow, since it also blocks code injection attacks.

## Mental model in one line

The `code` proves the user said yes; the `code_verifier` proves you are the same client who asked.

Next action (under 2 minutes): paste the `code_verifier` and `code_challenge` lines from the top into a REPL and confirm you can generate a matching pair.