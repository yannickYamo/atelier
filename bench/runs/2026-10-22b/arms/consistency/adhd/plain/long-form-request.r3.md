**Short version:** The client sends a hash of a secret when it starts login, then reveals the secret when it trades the code for tokens. The server checks that the two match. A stolen code is useless without the secret.

## The four parties

- **User:** the person logging in.
- **Client:** your app (SPA, mobile app, CLI, or server app).
- **Authorization server (AS):** issues codes and tokens (Auth0, Okta, Keycloak, Google).
- **Resource server:** the API that accepts access tokens.

## Why PKCE exists

Public clients, such as SPAs and mobile apps, cannot keep a client secret. Anyone can read it from the bundle or binary.

The authorization code travels through the browser (the "front channel"), where it can leak. A malicious app can register the same custom URI scheme, or the code can end up in logs or history. Without PKCE, whoever holds the code can exchange it for tokens.

PKCE ties the code to the client instance that started the flow. It is now recommended for all clients, including server-side ones (OAuth 2.1 requires it).

## The flow, in four phases

### Phase 1: Client prepares (nothing sent yet)

1. Generate a `code_verifier`: a random string of 43 to 128 characters from `A-Z a-z 0-9 - . _ ~`. Use a cryptographically secure random source.
2. Derive the `code_challenge`: `BASE64URL(SHA256(code_verifier))`, with no `=` padding.
3. Generate a random `state` value. Store the verifier and state locally (session storage, memory, or secure app storage).

### Phase 2: Authorization request (browser, front channel)

4. Redirect the user to the AS:
   ```
   GET https://auth.example.com/authorize
     ?response_type=code
     &client_id=my-app
     &redirect_uri=https://app.example.com/callback
     &scope=openid profile
     &state=xyz123
     &code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
     &code_challenge_method=S256
   ```
5. The AS authenticates the user and shows the consent screen.
6. The AS saves the `code_challenge` alongside the code it generates, then redirects back:
   ```
   https://app.example.com/callback?code=SplxlOBeZQQYbYS6WxSbIA&state=xyz123
   ```
7. The client checks that the returned `state` matches the stored one. If not, abort.

### Phase 3: Token exchange (direct HTTPS call, back channel)

8. The client POSTs to the token endpoint, now including the original secret:
   ```
   POST https://auth.example.com/token
   Content-Type: application/x-www-form-urlencoded

   grant_type=authorization_code
   &code=SplxlOBeZQQYbYS6WxSbIA
   &redirect_uri=https://app.example.com/callback
   &client_id=my-app
   &code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
   ```
9. The AS hashes the received `code_verifier` with SHA-256 and compares it to the stored `code_challenge`.
   - **Match:** it issues tokens.
   - **Mismatch:** it returns `invalid_grant`.
10. The response contains `access_token`, `token_type`, `expires_in`, and optionally `refresh_token` and `id_token` (if you used OpenID Connect).

### Phase 4: Use the tokens

11. Call the API with `Authorization: Bearer <access_token>`.
12. When the access token expires, POST `grant_type=refresh_token` to the token endpoint. Public clients should expect refresh token rotation (a new refresh token with each use).

## Why an attacker fails

An attacker who intercepts the `code` in step 6 has the code and the `code_challenge` (visible in the URL). They do not have the `code_verifier`, which never left the client until step 8 over a direct TLS connection.

SHA-256 is one-way, so they cannot derive the verifier from the challenge. Their token request fails at step 9.

## Details that matter

- **`state` and PKCE do different jobs.** `state` stops CSRF on your callback. PKCE stops code interception and injection. Use both.
- **Always use `S256`.** The `plain` method sends the verifier as the challenge, which defeats the purpose. Use it only if you cannot hash.
- **The code is single-use and short-lived.** Typically 1 to 10 minutes.
- **`redirect_uri` must match exactly** what was registered, and it must be the same in steps 4 and 8.
- **Generate a fresh verifier for every authorization request.** Never reuse one.

## Common mistakes

1. Using `Math.random()` instead of a secure random source.
2. Leaving `=` padding or using standard base64 (`+`, `/`) instead of base64url.
3. Losing the verifier across the redirect (for example, storing it in a component that gets reset).
4. Skipping the `state` check.
5. Storing tokens in `localStorage` in a SPA. Prefer in-memory storage or a backend-for-frontend.

## Generating the pair (browser JS)

```js
const b64url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
const challenge = b64url(
  await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))
);
```

## Effort to implement

- **With a maintained library** (oidc-client-ts, AppAuth, Auth.js): about 20 to 30 minutes.
- **Hand-rolled:** about half a day, mostly spent on edge cases like state handling, refresh, and error paths.

Next: tell me your client type (SPA, mobile, or server) and your AS, and I'll give you the exact setup for it.