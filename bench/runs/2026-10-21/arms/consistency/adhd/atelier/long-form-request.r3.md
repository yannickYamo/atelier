Next: generate the PKCE verifier and challenge.

Here is the whole flow, one bounded action per step. The goal: a public client (SPA, mobile app, CLI) gets an access token without a client secret, and a stolen authorization code is useless to an attacker.

**The two PKCE values (you create these first)**

```
code_verifier  = random string, 43-128 chars (A-Z a-z 0-9 - . _ ~)
code_challenge = BASE64URL(SHA256(code_verifier))
code_challenge_method = S256
```

The verifier stays secret on the client. The challenge is a one-way hash of it, so it is safe to send through the browser.

**The flow**

1. **Client creates the verifier, challenge, and a `state` value.** Generate `code_verifier` with a cryptographically secure random generator, hash it to get `code_challenge`, and generate a random `state`. Store the verifier and state locally (memory or session storage). The `state` value defends against CSRF; the verifier defends against code interception.

2. **Client redirects the user to the authorization endpoint.**

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

The authorization server saves the `code_challenge` alongside this request.

3. **User authenticates and consents.** This happens entirely on the authorization server's own pages. The client never sees the user's password. The server checks the `client_id`, validates that `redirect_uri` exactly matches a registered one, and shows the requested scopes.

4. **Authorization server redirects back with a code.**

```
HTTP/1.1 302 Found
Location: https://app.example.com/callback?code=SplxlOBeZQQYbYS6WxSbIA&state=xyz123
```

The code is short-lived (typically 30-60 seconds) and single-use. It is bound to the stored `code_challenge`.

5. **Client checks `state`.** Compare the returned `state` to the one you stored. If it does not match, abort. This blocks forged callbacks.

6. **Client exchanges the code for tokens at the token endpoint (back channel).**

```
POST https://auth.example.com/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=SplxlOBeZQQYbYS6WxSbIA
&redirect_uri=https://app.example.com/callback
&client_id=my-app
&code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
```

This is a direct HTTPS request from the client to the server, not through the browser's address bar. The client sends the original plaintext `code_verifier` here.

7. **Authorization server verifies PKCE.** It computes `BASE64URL(SHA256(code_verifier))` and compares it to the `code_challenge` saved in step 2. It also confirms the code is unused, unexpired, and issued to this `client_id` and `redirect_uri`. If any check fails, it returns `invalid_grant`.

8. **Server returns tokens.**

```json
{
  "access_token": "eyJhbGciOi...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "id_token": "eyJhbGciOi...",
  "refresh_token": "8xLOxBtZp8"
}
```

The client now calls the API with `Authorization: Bearer <access_token>`.

**Why PKCE stops the attack**

An attacker who intercepts the redirect in step 4 (for example, a malicious app registered on the same custom URL scheme) gets the `code`. The challenge in the URL is a hash and cannot be reversed to the verifier. Without the verifier, step 7 fails.

**Common mistakes**

- Using `plain` instead of `S256`. Use `S256` unless the client physically cannot hash.
- Reusing one verifier across logins. Generate a new one per authorization request.
- Using a weak random source such as `Math.random()`. Use `crypto.getRandomValues` or the platform equivalent.
- Skipping the `state` check. PKCE does not replace it in every deployment.
- Loose `redirect_uri` matching on the server. It must be an exact string match.

Next: pick one concrete action below.

```
v=$(openssl rand -base64 48 | tr '+/' '-_' | tr -d '=\n'); echo "verifier:  $v"; echo "challenge: $(printf %s "$v" | openssl dgst -sha256 -binary | openssl base64 | tr '+/' '-_' | tr -d '=\n')"
```

If you want, I can cover refresh token handling and rotation as a separate question.