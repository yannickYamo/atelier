# OAuth Authorization Code Flow with PKCE

**Core idea:** the app creates a one-time secret at the start of login and proves it knows that secret at the end. A thief who steals the authorization code in between can't use it.

## The players

1. **Resource owner:** the user.
2. **Client:** your app (SPA, mobile, desktop, or server).
3. **Authorization server:** issues tokens (Auth0, Okta, Keycloak, Google).
4. **Resource server:** the API that accepts access tokens.

## Phase 1: Client prepares secrets

Before redirecting anywhere, the client generates three values:

1. **`code_verifier`:** a random string, 43 to 128 characters, from `A-Z a-z 0-9 - . _ ~`. Use a cryptographic RNG. Keep it private, in memory or session storage.
2. **`code_challenge`:** `BASE64URL(SHA256(code_verifier))`, with no `=` padding. It is safe to expose because a hash can't be reversed.
3. **`state`:** a separate random string used to prevent CSRF.

## Phase 2: Authorization request

The client sends the user's browser to the authorization server:

```
GET /authorize
  ?response_type=code
  &client_id=abc123
  &redirect_uri=https://app.example.com/callback
  &scope=openid profile email
  &state=xyz789
  &code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
  &code_challenge_method=S256
```

The server stores the `code_challenge` alongside this login attempt.

## Phase 3: User authenticates, code comes back

1. The user logs in and approves the requested scopes.
2. The server redirects the browser to:
   ```
   https://app.example.com/callback?code=SplxlOBeZQQYbYS6WxSbIA&state=xyz789
   ```
3. The client checks that the returned `state` matches the one it sent. If not, abort.
4. The authorization code is short-lived (typically under 60 seconds), single-use, and bound to the `client_id`, `redirect_uri`, and `code_challenge`.

Only the code travels through the browser. No tokens appear in the URL.

## Phase 4: Token exchange

The client calls the token endpoint directly (back channel, not through the browser):

```
POST /token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=SplxlOBeZQQYbYS6WxSbIA
&redirect_uri=https://app.example.com/callback
&client_id=abc123
&code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
```

The server then:

1. Hashes the submitted `code_verifier` with SHA-256 and base64url-encodes it.
2. Compares the result to the stored `code_challenge`.
3. Issues tokens only if they match and the code, client, and redirect URI are all valid.

Response:

```json
{
  "access_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "8xLOxBtZp8",
  "id_token": "eyJ..."
}
```

`refresh_token` is optional. `id_token` appears only with OpenID Connect.

## Phase 5: Use the token

The client calls the API with `Authorization: Bearer <access_token>`. When the access token expires, it uses the refresh token at `/token` with `grant_type=refresh_token`.

## Why PKCE is needed

**The attack:** an attacker intercepts the authorization code. This happens on mobile when a malicious app registers the same custom URI scheme, or when the code leaks through logs, history, or referrer headers.

**Without PKCE:** the attacker exchanges the code for tokens. Public clients have no client secret, so nothing stops them.

**With PKCE:** the attacker has the code but not the `code_verifier`. They only ever saw the hash, which can't be reversed. The token exchange fails.

## Where PKCE does not help

1. **CSRF on the callback:** keep using `state` (or `nonce` with OIDC). PKCE is not a replacement.
2. **A compromised client:** if an attacker can read your verifier from memory, PKCE is bypassed.
3. **Stolen tokens after issuance:** PKCE protects only the code exchange.

## Common mistakes

1. Reusing one `code_verifier` across logins. Generate a new one per attempt.
2. Using `code_challenge_method=plain`. Use `S256` unless you truly can't hash.
3. Skipping the `state` check on the callback.
4. Loose redirect URI matching or wildcards. Register exact URIs.
5. Storing the verifier in `localStorage` where it outlives the login.

## Flow at a glance

```
Client                Browser             Auth Server
  | make verifier+challenge |                   |
  |--- redirect with challenge ---------------->|
  |                         |<-- login + consent->|
  |<-- redirect with code + state --------------|
  |--- POST code + verifier ------------------->|
  |                         |      hash(verifier) == challenge?
  |<-- access_token (+ refresh, id_token) ------|
```

**Next (5 minutes):** compute the challenge for verifier `dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk` in your language. It should equal `E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM` (the RFC 7636 test vector). If it matches, your PKCE code is correct.