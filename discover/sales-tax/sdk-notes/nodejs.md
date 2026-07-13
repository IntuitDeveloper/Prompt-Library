**If generating Node.js code (`{{language_framework}}` = nodejs):**

There is no official Intuit entity SDK for Node.js, and the Sales Tax mutation has no SDK bindings regardless. Use plain HTTP.

- Use `axios` or native `fetch` (Node 18+) to POST to `{{graphql_endpoint_production}}` (or `{{graphql_endpoint_sandbox}}` when `QBO_ENV=sandbox`).
- Required headers: `Authorization: Bearer <token>`, `Content-Type: application/json`, `realmId: <QBO_REALM_ID>`.
- Recommended: set a unique `intuit_tid` header per request for log correlation.
- No additional package required beyond your HTTP client of choice (`npm install axios` if preferred).
