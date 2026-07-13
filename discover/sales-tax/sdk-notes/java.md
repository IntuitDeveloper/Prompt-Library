**If generating Java code (`{{language_framework}}` = java):**

The Intuit Java SDK (`ipp-v3-java-devkit`) **does not support GraphQL**. Use a plain HTTP client for the Sales Tax mutation.

- Use `java.net.http.HttpClient` (JDK 11+) or `CloseableHttpClient` from Apache HttpClient. POST to `{{graphql_endpoint_production}}` (or `{{graphql_endpoint_sandbox}}` when `QBO_ENV=sandbox`).
- Required headers: `Authorization: Bearer <token>`, `Content-Type: application/json`, `realmId: <QBO_REALM_ID>`.
- Recommended: set a unique `intuit_tid` header per request for log correlation.
- Use Jackson or Gson to serialize the variables JSON and parse the response.
- **SDK reference (for unrelated REST V3 work):** `{{java-sdk-documentation}}` — note that this SDK is **not** needed for this prompt.

> ℹ️ If your project already depends on `ipp-v3-java-devkit` for other QBO work, you can reuse its `OAuth2Authorizer` for token refresh, but you'll bypass `DataService` entirely for the Sales Tax mutation.
