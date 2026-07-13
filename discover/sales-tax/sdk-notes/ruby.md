**If generating Ruby code (`{{language_framework}}` = ruby):**

There is no official Intuit entity SDK for Ruby, and no Ruby bindings for the Sales Tax mutation regardless. Use plain HTTP.

- Use Ruby's built-in `Net::HTTP` or the `faraday` gem to POST to `{{graphql_endpoint_production}}` (or `{{graphql_endpoint_sandbox}}` when `QBO_ENV=sandbox`).
- Required headers: `Authorization: Bearer <token>`, `Content-Type: application/json`, `realmId: <QBO_REALM_ID>`.
- Recommended: set a unique `intuit_tid` header per request for log correlation.
- **Optional install (if using Faraday):**
  ```bash
  gem install faraday
  ```
