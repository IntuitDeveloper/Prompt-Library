**If generating PHP code (`{{language_framework}}` = php):**

The PHP SDK does **not** support GraphQL. Use a plain HTTP client.

- Use `GuzzleHttp\Client` or PHP's built-in `curl` to POST to `{{graphql_endpoint_production}}` (or `{{graphql_endpoint_sandbox}}` when `QBO_ENV=sandbox`).
- Required headers: `Authorization: Bearer <token>`, `Content-Type: application/json`, `realmId: <QBO_REALM_ID>`.
- Recommended: set a unique `intuit_tid` header per request for log correlation.
- Use `json_encode` / `json_decode` for variables and response.
- **Composer install (if using Guzzle):**
  ```bash
  composer require guzzlehttp/guzzle
  ```

> ℹ️ If your project already depends on `quickbooks/v3-php-sdk` for other QBO work, you can reuse its OAuth helpers for token refresh, but you'll bypass `DataService` entirely for the Sales Tax mutation.
