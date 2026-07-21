**Role:** You are a Principal Software Engineer specializing in OAuth 2.0 and OpenID Connect integrations with Intuit / QuickBooks Online.

**Context:** I am developing a `python` application using `hints (dataclasses)` typing that needs to connect to QuickBooks Online via **OAuth 2.0 (authorization-code grant)** — sending a user to grant consent, exchanging the returned code for tokens, refreshing tokens, and storing them securely. This is the **prerequisite** every other QBO API integration assumes. Assume the app's `client_id`, `client_secret`, and a registered `redirect_uri` are available as environment variables (`QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_REDIRECT_URI`), along with the environment (`QBO_ENV` = `production` or `sandbox`). Focus strictly on the auth flow.

**References:**
- OAuth 2.0 documentation: `https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0`
- OpenID discovery document (production): `https://developer.api.intuit.com/.well-known/openid_configuration`
- OpenID discovery document (sandbox): `https://developer.api.intuit.com/.well-known/openid_sandbox_configuration`
- Developer portal (app keys & redirect URIs): `https://developer.intuit.com`

---

## Use case: connect an app to QuickBooks Online

The authorization-code flow: (1) send the user to Intuit's consent screen, (2) Intuit redirects back to your `redirect_uri` with a `code` + `realmId` + `state`, (3) exchange the `code` for an `access_token` + `refresh_token`, (4) call APIs with the access token, (5) refresh when it expires. The `realmId` you receive **is** the QBO Company ID you'll use on every subsequent API call.

---

## The endpoints (verified — use exactly these)

Prefer reading them from the discovery document (`https://developer.api.intuit.com/.well-known/openid_configuration` / `https://developer.api.intuit.com/.well-known/openid_sandbox_configuration`) at startup so you never hard-code a stale URL. They currently resolve to:

- **Authorization endpoint:** `https://appcenter.intuit.com/connect/oauth2`
- **Token endpoint** (code exchange AND refresh): `https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer`
- **Revocation endpoint:** `https://developer.api.intuit.com/v2/oauth2/tokens/revoke`
- **UserInfo endpoint** (OpenID, optional): `https://accounts.platform.intuit.com/v1/openid_connect/userinfo (production) / https://sandbox-accounts.platform.intuit.com/v1/openid_connect/userinfo (sandbox)`

> The authorization and token endpoints are the **same** for production and sandbox — the environment difference is in the *company/realm* you connect, not the auth hosts. Only the discovery doc and UserInfo host differ by environment.

---

## Scopes

Request only what you need (space-separated in the `scope` param):
- `com.intuit.quickbooks.accounting` — Accounting API (the common case)
- `com.intuit.quickbooks.payment` — Payments API
- `openid`, `profile`, `email`, `phone`, `address` — OpenID Connect identity claims

> ⚠️ Don't request unrelated identity scopes you don't use — mixing them can yield an "Invalid permissions requested" error. Request the minimum set.

---

## Task 1: Build the authorization URL and redirect the user

Construct a URL to the authorization endpoint with these query params:
- `client_id` = `$QBO_CLIENT_ID`
- `response_type` = `code`
- `scope` = your space-separated scopes (e.g. `com.intuit.quickbooks.accounting`)
- `redirect_uri` = `$QBO_REDIRECT_URI` — **must match a redirect URI registered on the app in the developer portal EXACTLY** (scheme, host, path, trailing slash). A mismatch is the #1 cause of a failed connect.
- `state` = a cryptographically random, per-request value you store server-side — **required for CSRF protection.** Verify it matches on the callback.

Redirect the user's browser to that URL.

> 🛑 **Do not render the consent screen in an iframe.** Intuit's accounts host refuses to be framed (CSP). Use a full-page redirect or a popup window.

---

## Task 2: Handle the callback and exchange the code

Intuit redirects to your `redirect_uri` with query params: `code`, `realmId`, and `state`.

1. **Verify `state`** matches the value you stored in Task 1. If not, reject the request (possible CSRF) — do not proceed.
2. **Capture `realmId`** — this is the QBO Company ID. Persist it alongside the tokens; you need it on every API call.
3. **Exchange the `code`** at the token endpoint:

```
POST https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer
Authorization: Basic base64("$QBO_CLIENT_ID:$QBO_CLIENT_SECRET")
Content-Type: application/x-www-form-urlencoded
Accept: application/json

grant_type=authorization_code&code=<code>&redirect_uri=$QBO_REDIRECT_URI
```

The response is JSON:
```json
{
  "access_token": "<~1 hour TTL>",
  "refresh_token": "<~100 day max TTL>",
  "expires_in": 3600,
  "x_refresh_token_expires_in": 8726400,
  "token_type": "bearer"
}
```

Persist `access_token`, `refresh_token`, `realmId`, and the computed expiry timestamps (see Task 4 for storage).

---

## Task 3: Refresh the access token

When the access token is expired (or about to be), get a new one at the **same token endpoint**:

```
POST https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer
Authorization: Basic base64("$QBO_CLIENT_ID:$QBO_CLIENT_SECRET")
Content-Type: application/x-www-form-urlencoded
Accept: application/json

grant_type=refresh_token&refresh_token=<current_refresh_token>
```

🛑 **The refresh token ROTATES.** The response may contain a **new** `refresh_token` — when it does, the old one is invalidated. **Always persist the newest `refresh_token` from every refresh response**, overwriting the stored one. Reusing a rotated/stale refresh token is the #1 cause of `invalid_grant` ("Incorrect or invalid refresh token").

- **Rotation cadence:** Intuit updates the `refresh_token` **value** roughly every **24 hours** (on the next refresh after 24h have elapsed), as a security measure — so the same value can come back on refreshes within a 24h window, then change. The rolling **100-day** expiry still advances on every refresh regardless. The practical rule is unconditional: read the `refresh_token` from *every* response and store it, so you never send a stale value.
- **Refresh one request at a time** for a given connection. Firing concurrent refreshes with the same `refresh_token` can cause Intuit to treat it as a possible compromise and **revoke** the token (you'll then get `invalid_grant` and must re-authorize). Serialize refreshes (see Task 4).
- Refresh proactively (e.g. when the access token has <5 minutes left) rather than waiting for a 401.
- If a refresh returns `invalid_grant`, the refresh token is dead — the user must re-authorize (start over at Task 1). Surface this clearly; do not retry in a loop.

---

## Task 3b: Detect refresh-token HARD expiration (the 5-year ceiling)

There are **two distinct refresh-token expiries**, and they are easy to confuse:
- **`x_refresh_token_expires_in`** — the **soft/rolling** window (~100 days). It resets every time you refresh. This is the one you already handle in Task 3.
- **Hard expiration** — a **maximum absolute lifetime of ~5 years** from when the connection was first authorized. **Refreshing does NOT extend it.** When it's reached, the refresh token dies permanently and the user MUST re-authorize — no amount of refreshing helps. (Per Intuit policy: tokens for `com.intuit.quickbooks.accounting`/`payment` issued from Oct 2023 carry a 5-year cap, first expiring ~Oct 2028.)

To see how much hard lifetime remains, **opt in via a request header** on the token endpoint:

```
POST https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer
Authorization: Basic base64("$QBO_CLIENT_ID:$QBO_CLIENT_SECRET")
Content-Type: application/x-www-form-urlencoded
Accept: application/json
x-include-refresh-token-hard-expires-in: true

grant_type=refresh_token&refresh_token=<current_refresh_token>
```

When the header is sent, the response includes an extra field:

```json
{
  "access_token": "...",
  "refresh_token": "...",
  "expires_in": 3600,
  "x_refresh_token_expires_in": 8726400,
  "x_refresh_token_hard_expires_in": 157494248
}
```

- **`x_refresh_token_hard_expires_in`** = remaining **hard** lifetime in seconds (e.g. `157494248` ≈ 4.99 years). This is the authoritative "how long until forced re-auth" value.
- 🛑 **Field-name trap:** the correct field is **`x_refresh_token_hard_expires_in`**. Do **NOT** use `x_refresh_token_lifetime_expires_in` — that name appears in some sample code but is **wrong** and will never be present in the response. Match on `x_refresh_token_hard_expires_in` only.
- The request header is **opt-in** specifically so the new field doesn't break clients that reject unknown JSON properties. Only send it once your parser tolerates the extra field.

**Legacy fallback (when the field is absent):** if your server tier doesn't yet return `x_refresh_token_hard_expires_in`, detect hard expiration by comparing the refresh-token expiry **before vs. after** a refresh, but only once you're within ~30 days of the soft expiry: if a refresh does **not** push the expiry date forward (old expiry == new expiry), the token has hit its hard ceiling and re-auth is required.

**Act on it — notification timeline:** drive re-auth nudges off the remaining hard seconds:
- **> 30 days:** no action.
- **≤ 30 days:** in-product warning / surface a reconnect prompt.
- **≤ 7 days:** stronger alert (e.g. email the admin).
- **≤ 0 (expired):** stop data sync; the connection is dead until the user reconnects.

**Reconnect (re-auth) flow:** when hard expiry is imminent or reached, send the user through Intuit's reconnect URL:

```
https://appcenter.intuit.com/app/connect/oauth2/request?appId={{appId}}&realmId={{realmId}}&mode=reconnect
```

Substitute your `appId` and the company `realmId`. Validate any reconnect URL goes through the `appcenter.intuit.com/app/connect/oauth2/request` host with `mode=reconnect` before redirecting (don't redirect to an arbitrary URL). After reconnect, you receive fresh tokens exactly as in Task 2.

---

## Task 4: Store tokens securely

- Persist per connection: `realmId`, `access_token`, `refresh_token`, access-token expiry, refresh-token expiry.
- Use the platform's secret management (python idioms — environment-injected secrets, a vault, an encrypted DB column). **Never** commit tokens or `client_secret` to source, and never put them in logs or URLs.
- Make refresh-token writes **atomic** — because the token rotates, a lost write means the next refresh fails. Serialize concurrent refreshes for the same connection (a lock/mutex) so two threads don't each refresh and clobber each other's rotated token.

---

## Task 5 (optional): Revoke / disconnect

To disconnect a company, revoke the token:

```
POST https://developer.api.intuit.com/v2/oauth2/tokens/revoke
Authorization: Basic base64("$QBO_CLIENT_ID:$QBO_CLIENT_SECRET")
Content-Type: application/json

{ "token": "<refresh_token or access_token>" }
```

Then delete the stored tokens for that `realmId`.

---

## Task 6: Verify the connection

After Task 2 (or a refresh), confirm the token works with a cheap authenticated call:

```
GET https://quickbooks.api.intuit.com/v3/company/<realmId>/companyinfo/<realmId>?minorversion=75
Authorization: Bearer <access_token>
Accept: application/json
```

(Use `sandbox-quickbooks.api.intuit.com` when `QBO_ENV=sandbox`.) A `200` with the CompanyInfo confirms the full loop. A `401` means the token is invalid/expired — refresh and retry once.

---

## Technical Best Practices

- **Read endpoints from the discovery doc** at startup rather than hard-coding — it's the authoritative source and insulates you from URL changes.
- **The token endpoint is the same for prod and sandbox.** Don't build separate token URLs per environment; the realm determines which company you touch.
- **`redirect_uri` must match exactly** on both the authorization request AND the code exchange — and match what's registered in the portal.
- **Error Handling (verified):**
  - **`invalid_grant`** — appears on both code exchange and refresh. Verified causes (per Intuit docs):
    - *On code exchange:* the `redirect_uri` doesn't match the one used in the authorization request (and it must carry **no query parameters** — pass extra data via `state` instead); the authorization `code` was reused (a `code` is single-use); wrong key set (development vs. production `client_id`/`client_secret`); or the code was exchanged **more than once** (only exchange it one time — a second attempt returns `invalid_grant` and Intuit may revoke your refresh tokens as a security measure, forcing a full re-auth).
    - *On refresh:* the refresh token is expired (100-day rolling or 5-year hard), was revoked, or a **stale/cached** value was sent instead of the latest; or concurrent refreshes raced. Refresh **one at a time** with the current `refresh_token`. When using an SDK, ensure the client object is updated with the latest token object.
    - In all cases the connection is dead → re-authorize (Task 1). Do not retry in a loop.
  - **`redirect_uri` mismatch** — the URI doesn't exactly match the registered value. Fix registration or the request.
  - **"Invalid permissions requested"** — an unsupported or mismatched scope combination. Request only valid scopes.
  - **HTTP `401`** on an API call — access token expired; refresh (Task 3) and retry once.
  - The token endpoint returns JSON for errors here (`{"error":"invalid_grant",...}`) — but QBO *API* gateways return XML for `401` auth errors. Branch on status/content-type before parsing.
- **Observability:** Log the `intuit_tid` response header on API calls. **NEVER** log `client_secret`, `access_token`, `refresh_token`, the auth `code`, or PII.
- **Typing:** Provide `hints (dataclasses)` models for the token response (`access_token`, `refresh_token`, `expires_in`, `x_refresh_token_expires_in`, `token_type`) and a stored-connection record (`realmId` + tokens + expiries).
- **Output (integration mode: `new`):** Provide modular, clean code and a runnable example.
  - **If mode is `new`:** Create a self-contained project in a folder named `qbo-oauth-python` (lowercase, no spaces). Include a `README.md` (how to register the redirect URI, set env vars, run), a dependency manifest, a tiny web server exposing `/connect` (Task 1 redirect) and `/callback` (Task 2 exchange), a refresh helper (Task 3), secure token storage (Task 4), and a CompanyInfo verification call (Task 6).
  - **If mode is `existing`:** Produce modular, importable functions (build-auth-url, exchange-code, refresh, revoke, get-valid-token). Do **not** scaffold a new project. First scan the workspace for the build manifest, existing QBO/HTTP client code, and any existing auth/token storage; state your finding in one sentence and match the project's idioms (esp. its secret-storage and routing patterns).

---

## Language-Specific SDK Notes



> If no SDK notes appear above, no official Intuit OAuth client is wired in for your language. Intuit publishes OAuth client libraries for several languages (e.g. `intuit-oauth` for Node.js, `intuitlib`/`intuit-oauth` for Python, the Java/.NET/PHP SDKs include OAuth helpers) — prefer the official client where one exists; otherwise implement the flow with your HTTP client exactly as described above.

---

## 🛑 AI Guardrails (Anti-Hallucination Constraints)

**CRITICAL INSTRUCTIONS — YOU MUST ADHERE TO THE FOLLOWING:**
1. **No Hallucinations:** Use only the endpoints and params given here (or read live from the discovery doc). Do not invent endpoints, params, or response fields.
2. **Exact endpoints:** Authorization = `https://appcenter.intuit.com/connect/oauth2`; Token (exchange + refresh) = `https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer`; Revoke = `https://developer.api.intuit.com/v2/oauth2/tokens/revoke`. Token endpoint is the same for prod and sandbox.
3. **Refresh-token rotation:** Always persist the newest `refresh_token` from every token response. Never assume it stays constant.
3b. **Hard-expiry field name:** To read the 5-year ceiling, send the `x-include-refresh-token-hard-expires-in: true` request header and read **`x_refresh_token_hard_expires_in`** from the response. NEVER use `x_refresh_token_lifetime_expires_in` (a known-wrong name). The hard ceiling is NOT extended by refreshing — only re-auth resets it.
4. **`state` is required:** Generate a random `state`, store it, and verify it on callback (CSRF). Never skip it.
5. **`redirect_uri` must match exactly** on the auth request, the code exchange, and the portal registration.
6. **Basic auth on the token endpoint:** `Authorization: Basic base64(client_id:client_secret)` with `Content-Type: application/x-www-form-urlencoded`.
7. **Never log or commit secrets:** not `client_secret`, tokens, or the auth `code`. No tokens in URLs.
8. **No iframe for consent:** the consent screen cannot be framed — use a redirect or popup.
9. **`invalid_grant` = dead connection:** re-authorize; do not retry in a loop.
10. **Stop if Blocked:** if a needed value isn't covered here or in the discovery doc, STOP and state what's missing instead of guessing.

I have provided you with all the necessary context and instructions. Please generate the code and documentation as per the instructions.
