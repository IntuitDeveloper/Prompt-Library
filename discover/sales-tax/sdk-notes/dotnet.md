**If generating .NET / C# code (`{{language_framework}}` = dotnet):**

The Intuit .NET SDK does **not** support GraphQL. Use a plain HTTP client.

- Use `System.Net.Http.HttpClient` to POST to `{{graphql_endpoint_production}}` (or `{{graphql_endpoint_sandbox}}` when `QBO_ENV=sandbox`). No extra package needed — `HttpClient` is part of the .NET standard library.
- Required headers: `Authorization: Bearer <token>`, `Content-Type: application/json`, `realmId: <QBO_REALM_ID>`.
- Recommended: set a unique `intuit_tid` header per request for log correlation.
- Use `System.Text.Json` (built-in) or Newtonsoft.Json to serialize variables and parse the response.

> ℹ️ If your project already depends on `IppDotNetSdkForQuickBooksApiV3` for other QBO work, you can reuse its `OAuth2Authorizer` for token refresh, but you'll bypass `DataService` entirely for the Sales Tax mutation.
