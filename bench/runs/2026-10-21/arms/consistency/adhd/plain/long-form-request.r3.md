PKCE (Proof Key for Code Exchange, pronounced "pixie") lets a client prove that the app redeeming an authorization code is the same app that asked for it, without needing a client secret.

## The problem it solves

Public clients (SPAs, mobile apps, CLIs) cannot keep a secret. Their code ships to the user's device.

The authorization code travels through the **front channel** (browser redirect), where it can leak via a malicious app claiming the same redirect URI, browser history, logs, or referrer headers. Without PKCE, anyone holding a stolen code can exchange it for tokens.

PKCE binds the code to a one-time secret that never travels through the front channel.

## The pieces

1. **`code_verifier`**: random string, 43 to 128 characters, from `A-Z a-z 0-9 - . _ ~`. Generated fresh per login attempt. Stays on the client.
2. **`code_challenge`**: `BASE64URL(SHA256(code_verifier))`, no padding. Sent to the server up front.
3. **`code_challenge_method`**: `S256`. Use `plain` only if SHA-256 is truly unavailable.
4. **`state`**: random value that protects against CSRF. Separate from PKCE, still required.
5. **Front channel vs back channel**: front is browser redirects (observable). Back is direct client-to-server HTTPS (not observable by other apps).

## The flow

### Phase 1: Prepare (client only)

1. Generate a random `code_verifier` with a cryptographically secure RNG (`crypto.getRandomValues`, not `Math.random`).
2. Compute `code_challenge` from it. Generate `state`. Store the verifier and state for this attempt only (e.g. `sessionStorage` or in-memory).

### Phase 2: Authorize (front channel)

3. Client sends the user's browser to the authorization server:
   ```
   GET /authorize
     ?response_type=code
     &client_id=abc123
     &redirect_uri=https://app.example/callback
     &scope=openid profile
     &state=xyz
     &code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
     &code_challenge_method=S256
   ```
4. The server stores the `code_challenge` against this request, then authenticates the user and shows the consent screen.
5. The server redirects back: `https://app.example/callback?code=SplxlOBeZQQYbYS6WxSbIA&state=xyz`. The client checks that `state` matches what it stored. A mismatch means abort.

### Phase 3: Redeem (back channel)

6. Client POSTs directly to the token endpoint:
   ```
   POST /token
   grant_type=authorization_code
   &code=SplxlOBeZQQYbYS6WxSbIA
   &redirect_uri=https://app.example/callback
   &client_id=abc123
   &code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
   ```
7. The server computes `BASE64URL(SHA256(code_verifier))` and compares it to the stored `code_challenge`. Match means it issues tokens. Mismatch means `invalid_grant`.
8. Response contains `access_token`, `expires_in`, often a `refresh_token`, and an `id_token` if you requested OpenID Connect. The client calls the API with `Authorization: Bearer <access_token>`.

## Why it works

- An attacker who steals the `code` from the redirect has the challenge (a hash) at most, never the verifier.
- SHA-256 is one-way, so the verifier cannot be derived from the challenge.
- The verifier only crosses the wire in step 6, over TLS, directly to the server.
- Without the verifier, the stolen code is useless.

## Common mistakes

1. Weak randomness for the verifier (`Math.random`, timestamps).
2. Reusing one verifier across login attempts. Generate a new one every time.
3. Skipping `state` because "PKCE covers it." It does not. They defend against different attacks.
4. Loose `redirect_uri` matching on the server. It must be an exact string match against registered values.
5. Using `plain` when S256 is available. `plain` sends the secret in the front channel, which defeats the point.

Also worth knowing: authorization codes must be single-use and short-lived (a minute or so). OAuth 2.1 requires PKCE for all clients, including confidential ones.

## Next action

Generate a real verifier/challenge pair in your terminal (about 2 minutes):

```bash
V=$(openssl rand -base64 48 | tr -d '=+/\n' | cut -c1-64)
echo "verifier:  $V"
printf '%s' "$V" | openssl dgst -sha256 -binary | openssl base64 -A | tr '+/' '-_' | tr -d '=' | sed 's/^/challenge: /'
```