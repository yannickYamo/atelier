**Summary:** The client proves at the token step that it is the same client that started the flow, using a one-time secret (the verifier) whose hash (the challenge) it sent up front.

## Why PKCE exists

Public clients (SPAs, mobile, desktop, CLIs) cannot keep a client secret. Without one, anyone who intercepts the authorization code could trade it for tokens. PKCE (Proof Key for Code Exchange, RFC 7636) replaces the static secret with a per-request secret. It is now recommended for all clients, including confidential ones.

## The four parties

1. **Resource owner:** the user.
2. **Client:** your app.
3. **Authorization server:** issues codes and tokens (Auth0, Okta, Keycloak).
4. **Resource server:** the API that accepts access tokens.

## The flow

### Phase 0: Client prep (before leaving your app)

1. Generate `code_verifier`: a random string, 43 to 128 characters, from `A-Z a-z 0-9 - . _ ~`.
2. Compute `code_challenge = BASE64URL(SHA256(code_verifier))`.
3. Generate `state`: a random value for CSRF protection.
4. Store `code_verifier` and `state` locally (session storage, memory, or secure storage). Do not send the verifier anywhere yet.

```js
const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
const challenge = base64url(await crypto.subtle.digest(
  "SHA-256", new TextEncoder().encode(verifier)));
```

### Phase 1: Authorization request (browser redirect)

The client sends the user's browser to the authorization server:

```
GET /authorize?
  response_type=code
  &client_id=abc123
  &redirect_uri=https://app.example.com/callback
  &scope=openid profile api.read
  &state=xyz789
  &code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
  &code_challenge_method=S256
```

- `code_challenge_method=S256` means SHA-256. Do not use `plain` unless you truly cannot hash.
- `redirect_uri` must exactly match one registered in advance.

### Phase 2: User authenticates and consents

1. The authorization server shows a login page.
2. The user signs in and approves the requested scopes.
3. The server saves the `code_challenge` and links it to a newly minted authorization code.

Your app is not involved here. It never sees the user's password.

### Phase 3: Redirect back with the code

The server redirects the browser to your `redirect_uri`:

```
https://app.example.com/callback?code=SplxlOBeZQQYbYS6WxSbIA&state=xyz789
```

Your app then:

1. Checks that `state` matches the stored value. If not, abort.
2. Extracts `code`.

The code is short-lived (typically under 60 seconds), single-use, and useless on its own.

### Phase 4: Token exchange (back channel)

The client calls the token endpoint directly, not through the browser redirect:

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

1. Looks up the stored `code_challenge` for this code.
2. Computes `BASE64URL(SHA256(code_verifier))`.
3. Compares the two. A mismatch returns `invalid_grant`.
4. Verifies the code is unused, unexpired, and tied to this `client_id` and `redirect_uri`.
5. Issues tokens and invalidates the code.

### Phase 5: Tokens returned and used

```json
{
  "access_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "8xLOxBtZp8",
  "id_token": "eyJ..."
}
```

- `access_token`: sent as `Authorization: Bearer <token>` to the resource server.
- `refresh_token`: gets a new access token without another login. Many servers rotate it on each use.
- `id_token`: present only with OpenID Connect. It carries the user's identity.

## Why this is secure

The attacker's problem: they steal the `code` (a malicious app on the same custom URI scheme, a leaked URL in logs, or a browser extension).

1. They send the code to `/token`.
2. They do not have `code_verifier`. Only the legitimate client does.
3. The challenge is a one-way hash, so the attacker cannot reverse it, even if they saw the authorization request.
4. The server rejects the exchange.

## Common mistakes

1. **Weak verifier.** Use a cryptographic RNG, never `Math.random()`.
2. **Skipping `state`.** PKCE does not replace CSRF protection (OAuth 2.1 allows relying on PKCE alone, but keeping `state` is safer).
3. **Reusing a verifier.** Generate a new one for every authorization request.
4. **Loose redirect URI matching.** Register exact URIs, with no wildcards.
5. **Storing tokens in `localStorage`.** It is exposed to XSS. Prefer in-memory storage or a backend-for-frontend (BFF).

## Time estimate

About 30 minutes with a maintained library (`oauth4webapi`, `AppAuth`, `openid-client`). About half a day to hand-roll, including testing.

**Next:** open your provider's docs, confirm it supports `code_challenge_method=S256`, and register your `redirect_uri` (2 minutes).