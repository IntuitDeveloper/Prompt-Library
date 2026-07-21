**If generating Ruby code (language: `{{language_framework}}`):**

Use the community-maintained **`quickbooks-ruby`** gem for Tasks 2 and 3, and Ruby's built-in **`Net::HTTP`** (or the **`faraday`** gem) for Task 1 (no SDK supports GraphQL). `quickbooks-ruby` has typed `CustomField` with all four value types, full wiring on `Invoice` and `SalesReceipt`, and a public `params:` argument on `fetch_by_id` / `query:` on `create` that propagates to the REST URL — so `params: { include: 'enhancedAllCustomFields' }` does the right thing.

---

## Task 1 — GraphQL discovery (`Net::HTTP` / `faraday`)

- POST the `appFoundationsCustomFieldDefinitions` query to `{{graphql_endpoint_production}}` (production only — GraphQL has no sandbox endpoint) with `Content-Type: application/json`, `Authorization: Bearer <token>`, and a unique `intuit_tid` per request.
- Send the argument as **`filters`** (plural — `AppFoundations_CustomExtensionsDefinitionFilterBy` input type) with primitive fields: `{ active: true }`. Do not use `{ equals: ... }` predicate wrappers. Filter by target entity client-side after the response.
- Parse the JSON response and build a `Hash` keyed by `legacyIDV2` (NOT the GraphQL `id`). Store `label` and `dataType` per entry. The GraphQL node field is lowercase `id`.
- Handle pagination via `pageInfo.endCursor` / `pageInfo.hasNextPage`.

---

## Task 2 — REST V3 entity creation (`quickbooks-ruby`)

### Setup

```ruby
require 'quickbooks-ruby'

Quickbooks.minorversion = {{minorversion}}

oauth_client = OAuth2::Client.new(client_id, client_secret, site: 'https://oauth.platform.intuit.com')
access_token = OAuth2::AccessToken.new(oauth_client, env['QBO_ACCESS_TOKEN'])

service = Quickbooks::Service::SalesReceipt.new
service.company_id = realm_id
service.access_token = access_token
```

### Build the entity

```ruby
sr = Quickbooks::Model::SalesReceipt.new
sr.customer_id = "1"

line = Quickbooks::Model::SalesReceiptLineItem.new
line.amount = 111
line.sales_item! do |sales_item|
  sales_item.item_id = "1"
end
sr.line_items << line

cf = Quickbooks::Model::CustomField.new
cf.id = definition['legacyIDV2'].to_i   # legacyIDV2 from Task 1 (NOT the GraphQL id).
                                        # quickbooks-ruby maps `DefinitionId` → `id` on the model.
cf.name = definition['label']           # optional but recommended
cf.type = "StringType"                  # pick StringType / NumberType / DateType / BooleanType based on dataType
cf.string_value = "Demo value"          # see "Typed value fields" below
sr.custom_fields << cf

# Attach the include parameter via `query:` in the `create` options.
created = service.create(sr, query: { include: 'enhancedAllCustomFields' })

puts "Created SalesReceipt id = #{created.id}"
```

### Typed value fields

`Quickbooks::Model::CustomField` (in `lib/quickbooks/model/custom_field.rb`) exposes all four typed accessors. Set **exactly one** based on `dataType`:

- `STRING` / `STRING_LIST` / `OBJECT_LIST` → `cf.string_value = "..."`
- `NUMBER` → `cf.number_value = 42`
- `DATE` → `cf.date_value = Date.parse("2026-05-23")` (a Ruby `Date`)
- `BooleanType` → `cf.boolean_value = true` (rarely surfaced)

There is also a polymorphic `cf.value = ...` setter that picks the right typed field based on `cf.type`, but for clarity prefer the explicit typed accessor.

For `STRING_LIST` / `OBJECT_LIST`, validate `string_value` against the definition's active `dropDownOptions[].value` set (from Task 1) before sending.

### Customer entity — Ruby-only gap

`quickbooks-ruby`'s `Customer` model does **NOT** wire `CustomField`, even though the QBO REST API supports it on Customer. If you need Customer custom fields:
1. Monkey-patch: `Quickbooks::Model::Customer.xml_accessor :custom_fields, from: 'CustomField', as: [Quickbooks::Model::CustomField]`
2. Or use the SDK-free path below for Customer specifically.

### Silent-drop detection

REST V3 silently drops `CustomField` entries whose `DefinitionId` doesn't match the target entity's sub-association. After `service.create(...)` returns, compare `created.custom_fields` against the list you sent. Warn on any missing entries.

---

## Task 3 — Type-aware hydration (`quickbooks-ruby`)

```ruby
fetched = service.fetch_by_id(created.id, include: 'enhancedAllCustomFields')

fetched.custom_fields.each do |rcf|
  def_id = rcf.id.to_s                        # equals legacyIDV2
  meta = definition_map[def_id]
  value = case meta[:dataType]
          when 'STRING', 'STRING_LIST', 'OBJECT_LIST' then rcf.string_value
          when 'NUMBER' then rcf.number_value
          when 'DATE' then rcf.date_value
          end
  # ...render label + value for the UI...
end
```

Filter `fetched.line_items` to entries where the underlying detail type is `SalesItemLineDetail`. The gem exposes detail-type checks via `line.sales_item?`, `line.subtotal?`, etc. — use those.

---

## Dependencies

```ruby
# Gemfile
gem 'quickbooks-ruby'
```

```bash
bundle install
```

---

## Alternative: no-SDK approach (`Net::HTTP` / `faraday` + Hash)

Use this when you don't want the `quickbooks-ruby` dependency, or when you need Customer custom fields (which the SDK doesn't wire). Build the request body as a `Hash` with PascalCase keys, POST via `Net::HTTP` or `Faraday` with `include=enhancedAllCustomFields` on the URL.

```ruby
require 'net/http'
require 'json'
require 'securerandom'

body = {
  Line: [{
    Amount: 111,
    DetailType: "SalesItemLineDetail",
    SalesItemLineDetail: { ItemRef: { value: "1" } }
  }],
  CustomerRef: { value: "1" },
  CustomField: [{
    DefinitionId: definition[:legacyIDV2],
    Name: definition[:label],
    Type: "StringType",
    StringValue: "Demo value"
  }]
}

uri = URI("https://quickbooks.api.intuit.com/v3/company/#{realm_id}/{{type_of_transaction}}?minorversion={{minorversion}}&include=enhancedAllCustomFields")
req = Net::HTTP::Post.new(uri)
req['Authorization'] = "Bearer #{access_token}"
req['Content-Type'] = 'application/json'
req['Accept'] = 'application/json'
req['intuit_tid'] = SecureRandom.uuid
req.body = body.to_json

resp = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) { |http| http.request(req) }
raise "QBO #{resp.code}: #{resp.body}" unless resp.code.to_i.between?(200, 299)

created = JSON.parse(resp.body)['SalesReceipt']   # QBO wraps the response in the entity name
```

PascalCase keys for the request, response wrapped under PascalCase entity name. Same shape on the wire as the SDK path.
