# OAuth 2.0 Authorization Code Flow with PKCE

PKCE (Proof Key for Code Exchange, pronounced "pixy") lets an app that can't keep a secret get tokens safely. It proves that the app finishing the flow is the same app that started it.

## Why it exists

Public clients (SPAs, mobile apps, CLIs) can't store a `client_secret`, because anyone can extract it from the code or bundle. Without a secret, a stolen authorization code is enough to get tokens.

The attack PKCE stops:
1. A malicious app on the same device registers the same redirect scheme.
2. The authorization server redirects the code to the attacker.
3. The attacker redeems the code for tokens.

PKCE binds the code to a one-time secret that only the real client knows.

## The actors

- **Resource owner:** the user.
- **Client:** your app.
- **Authorization server (AS):** issues tokens (Auth0, Okta, Keycloak, Google).
- **Resource server:** the API that accepts access tokens.

## The core idea

The client invents a random secret and sends only its hash up front. It reveals the secret later, when redeeming the code.

- `code_verifier`: random string, 43 to 128 characters, from `A-Z a-z 0-9 - . _ ~`
- `code_challenge` = `BASE64URL(SHA256(code_verifier))`
- `code_challenge_method` = `S256`

A hash can't be reversed, so seeing the challenge in the browser URL doesn't reveal the verifier.

## The flow

### Phase A: Prepare (client, no network)

1. Generate a `code_verifier`. Example: 32 random bytes, base64url-encoded, giving 43 characters.
2. Compute `code_challenge` from it with SHA-256 and base64url.
3. Generate a random `state` value for CSRF protection. Store the verifier and state locally (session storage, memory, or secure storage on mobile).

```js
const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
const challenge = base64url(await crypto.subtle.digest(
  "SHA-256", new TextEncoder().encode(verifier)
));
```

### Phase B: Authorize (browser)

4. The client redirects the user's browser to the AS:

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

5. The AS authenticates the user and shows the consent screen. It stores the `code_challenge` alongside the authorization code it generates.
6. The AS redirects back to your app:

```
https://app.example.com/callback?code=SplxlOBeZQQYbYS6WxSbIA&state=xyz789
```

The client must check that `state` matches the stored value. If it doesn't, abort.

### Phase C: Exchange (client to AS, back channel)

7. The client POSTs to the token endpoint, now including the original verifier:

```
POST /token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=SplxlOBeZQQYbYS6WxSbIA
&redirect_uri=https://app.example.com/callback
&client_id=abc123
&code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
```

8. The AS hashes the received `code_verifier` and compares it to the stored `code_challenge`.
   - Match: it issues tokens.
   - Mismatch: it returns `invalid_grant`.
9. The response:

```json
{
  "access_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "def...",
  "id_token": "eyJ..."
}
```

`refresh_token` depends on your scopes and AS config. `id_token` appears only with OpenID Connect (`openid` scope).

### Phase D: Use

10. The client calls the API:

```
GET /api/me
Authorization: Bearer eyJ...
```

## Why the attack now fails

An attacker who intercepts the `code` in step 6 can't redeem it. They'd need the `code_verifier`, which:
- never left the legitimate client before step 7,
- is not derivable from the `code_challenge` they might have seen in step 4.

## What each parameter protects

- **`code_challenge` / `code_verifier`:** binds the code to the client that started the flow.
- **`state`:** stops forged callbacks (CSRF).
- **`redirect_uri`:** the AS only sends the code to a pre-registered URL, and it must match exactly at both steps.
- **Short-lived, single-use `code`:** limits the replay window (typically under 60 seconds).

## Common mistakes

1. Using `plain` instead of `S256`. `plain` sends the verifier itself and defeats the purpose. Use `plain` only if the AS can't do S256, which is rare.
2. Reusing a verifier across sessions. Generate a fresh one per authorization request.
3. Using a weak random source such as `Math.random()`. Use a cryptographic RNG.
4. Skipping the `state` check. PKCE doesn't replace it.
5. Using wildcard or prefix matching on `redirect_uri`. Require an exact match.

## PKCE vs. client secret

PKCE doesn't authenticate the client. It proves continuity between the two requests. Confidential clients (server-side apps) can still use a secret. OAuth 2.1 and current best-practice guidance recommend PKCE for all clients, including confidential ones.

## Effort to implement

- With a maintained library (`oidc-client-ts`, `AppAuth`, `openid-client`): about 30 minutes.
- Hand-rolled: about 2 hours, mostly on edge cases like error handling and token refresh.

Next: tell me your client type (SPA, mobile, CLI, or server) and your AS, and I'll give you the exact working code.