Generate a random `code_verifier` in your client, hash it into a `code_challenge`, and send the challenge with the authorization request. That one move is the core of PKCE; everything below is the flow around it.

The snippet to start from:

```
code_verifier  = base64url(random 32-96 bytes)
code_challenge = base64url(SHA256(code_verifier))
```

## The cast

- **Resource owner**: the user.
- **Client**: your app (a single-page app, mobile app, or server app).
- **Authorization server (AS)**: issues codes and tokens.
- **Resource server (API)**: accepts access tokens.

## The problem PKCE solves

The plain authorization code flow sends the user to the AS in a browser, and the AS sends them back to your app's redirect URI with a short-lived `code`. Your app then swaps the code for tokens at the token endpoint.

Imagine the redirect lands somewhere an attacker can read it. On mobile, say a malicious app registers the same custom URL scheme as yours. The attacker now holds a valid `code`. If the token endpoint accepts the code alone, the attacker trades it for tokens.

A client secret would normally stop this, since only your backend knows it. Public clients (mobile apps, SPAs) cannot keep a secret, because anyone can unpack the app and read it. PKCE replaces the static secret with a one-time secret created fresh for each login attempt.

## The flow, step by step

1. **Client creates the verifier.** It generates a high-entropy random string, the `code_verifier` (43 to 128 characters from the unreserved URL character set, per RFC 7636). It keeps this in memory or session storage and never sends it in the first request.

2. **Client derives the challenge.** It computes `code_challenge = BASE64URL(SHA256(code_verifier))`. The method is named `S256`. A `plain` method exists (challenge equals verifier), but it only protects against weaker attacks and should be avoided when S256 is available.

3. **Client sends the user to the authorization endpoint.** This is a browser redirect with query parameters:
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
   `state` is a separate random value that protects against CSRF: you check that it comes back unchanged.

4. **User authenticates and consents.** The AS shows a login page and a consent screen. Your app never sees the password.

5. **AS stores the challenge and issues a code.** It binds the `code_challenge` (and method) to the authorization code it generates, then redirects the browser back:
   ```
   https://app.example.com/callback?code=SplxlOBeZQQYbYS6WxSbIA&state=xyz789
   ```

6. **Client checks `state`.** If it does not match what you sent, abort.

7. **Client exchanges the code, now including the verifier.** This is a direct back-channel POST, not a browser redirect:
   ```
   POST /token
   Content-Type: application/x-www-form-urlencoded

   grant_type=authorization_code
   &code=SplxlOBeZQQYbYS6WxSbIA
   &redirect_uri=https://app.example.com/callback
   &client_id=abc123
   &code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
   ```

8. **AS verifies.** It hashes the received `code_verifier` with SHA-256, base64url-encodes it, and compares the result to the `code_challenge` it stored in step 5. It also checks that the code is unexpired, unused, and issued to this `client_id` and `redirect_uri`.

9. **AS returns tokens.** On a match you get an `access_token`, usually a `refresh_token`, and an `id_token` if you used OpenID Connect. On a mismatch you get an `invalid_grant` error.

10. **Client calls the API** with `Authorization: Bearer <access_token>`.

## Why the attack now fails

The attacker who intercepts the `code` in step 5 saw only the `code_challenge` (if they saw the first request at all). SHA-256 is one-way, so they cannot recover the verifier from the challenge. At the token endpoint they cannot produce a verifier that hashes to the stored challenge, so the exchange fails. The verifier never travels through the front channel, which is the whole trick.

## Details that trip people up

- **Use a fresh verifier per authorization request.** Reusing one turns it back into a static secret.
- **Use a cryptographically secure random generator**, not `Math.random()` or a timestamp.
- **Register exact redirect URIs** at the AS. PKCE does not replace redirect URI validation.
- **Still use `state`** (or the OIDC `nonce` for ID tokens). PKCE binds the code to your client instance, while `state` binds the response to your session. They address different attacks.
- **Confidential clients should use it too.** The OAuth 2.0 Security Best Current Practice and OAuth 2.1 drafts recommend PKCE for all clients using the code flow, not only public ones. Treat the exact current status of those documents as something to verify against the IETF site.
- **Refresh tokens in public clients** should be rotated or sender-constrained, since PKCE only protects the initial code exchange.

## A mental model

Think of the code as a coat-check ticket and the verifier as a fingerprint you left at the desk. In the plain flow, anyone holding the ticket gets the coat. With PKCE, the desk recorded a scrambled version of your fingerprint when you checked the coat, and at pickup it requires the real fingerprint and compares. A thief with the ticket but not your finger leaves empty-handed.

Facts above that I stated from general knowledge and you may want to verify: the RFC 7636 length range (43 to 128 characters), the `S256` and `plain` method names, and the current standing of the OAuth 2.0 Security BCP and OAuth 2.1 drafts.

Next action (under 2 minutes): open your OAuth client library's docs and confirm it sends `code_challenge_method=S256` rather than `plain`.