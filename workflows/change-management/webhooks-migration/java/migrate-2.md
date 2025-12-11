You are Cascade, an AI coding assistant working on a Java app that uses QuickBooks Online webhooks.

## Goal

Migrate this project from the legacy `WebhooksEvent`-based webhook payload format to the new **CloudEvents-based** format using `WebhooksCloudEvents`, in line with:

- Webhooks payload change:  
  https://blogs.intuit.com/2025/11/12/upcoming-change-to-webhooks-payload-structure/
- Java SDK 6.5.2 release notes:  
  https://github.com/intuit/QuickBooks-V3-Java-SDK/releases/tag/v6.5.2

## Requirements

1. **Understand the change**
   - Read and briefly summarize:
     - The Intuit blog above (timeline, impact if not updated, sandbox→prod migration).
     - The Java SDK 6.5.2 release notes (CloudEvents support, backward compatibility).
     - The `WebhooksCloudEvents` class from the SDK (especially `intuitAccountId`).

2. **Analyze this project**
   - Find:
     - Where webhook HTTP requests are received (controller/endpoint).
     - Where the `intuit-signature` header is validated.
     - Where the webhook JSON payload is deserialized and processed (e.g., use of `WebhooksEvent`, `EventNotification`, or similar).
     - Any existing CDC/sync or downstream processing driven by a “realm id” or company id.

3. **Implement the migration**
   - Ensure QuickBooks SDK dependencies are at **6.5.2 or later**.
   - Keep the HTTP contract and signature validation semantics the same:
     - Still validate `intuit-signature` against the **raw payload** using `WebhooksService` (or equivalent).
   - Replace legacy deserialization logic (e.g. `WebhooksEvent`, `EventNotification`, `getWebhooksEvent(payload)`) with CloudEvents-based logic:
     - Use `WebhooksCloudEvents` from `com.intuit.ipp.data`.
     - Correctly handle **both**:
       - A single CloudEvent JSON object.
       - A JSON array of CloudEvents.
     - Use `WebhooksCloudEvents.getIntuitAccountId()` as the **realm/company id** where the app previously used `getRealmId()` or similar.
   - Preserve the existing downstream behavior (e.g., CDC, syncing, DB updates), just driven by the new CloudEvents model.

4. **Explain how to test**
   - Provide clear steps for:
     - Configuring the app in the Intuit Developer portal (sandbox) to use the new CloudEvents payload format.
     - Triggering test events (e.g. via sandbox QBO changes or “Send test events”).
     - Verifying that:
       - Webhook calls succeed (HTTP 200).
       - The app processes events for the correct company/realm.
       - Existing business logic still runs as expected.
     - Safely rolling out the change to **production** and monitoring, including the option to temporarily revert the payload format if needed.

## Output expectations

- A concise explanation of:
  - What changed with CloudEvents and why it matters.
  - What was changed in this specific project (files and main code paths).
- The actual code changes needed to compile and run, assuming the project already built successfully.
- Practical, step‑by‑step testing instructions (sandbox → production).