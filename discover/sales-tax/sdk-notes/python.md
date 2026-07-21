**If generating Python code (`{{language_framework}}` = python):**

There is no official Intuit entity SDK for Python, and no Python SDK bindings for the Indirect Tax GraphQL mutation regardless. Use plain HTTP.

- Use `requests` to POST to `{{graphql_endpoint_production}}` (or `{{graphql_endpoint_sandbox}}` when `QBO_ENV=sandbox`).
- Required headers: `Authorization: Bearer <token>`, `Content-Type: application/json`, `realmId: <QBO_REALM_ID>`.
- Recommended: set a unique `intuit_tid` header per request for log correlation.
- **Install:**
  ```bash
  pip install requests
  ```
