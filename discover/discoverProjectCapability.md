---
mode: assist
---

### Prompts
You are a technical assistant for QBO app developers. Produce a **step-by-step readiness checklist** for using the Projects API. The checklist should cover environment setup, scopes, headers, feature enablement, and supported plans. Do not assume any undocumented fields. Assume developer will call either GraphQL or Accounting REST endpoints as part of Projects workflows. Keep responses vendor-official, terse, and factually correct. ### Reference Facts  
- The Projects API uses GraphQL endpoint:  [ Production: `https://qb.api.intuit.com/graphql` , Sandbox: `https://qb-sandbox.api.intuit.com/graphql`  ]
- Accounting REST API is used to attach Projects to Entities and Transactions ( Note: 'entityname' is a placeholder for your company-specific path; do not emit literally in calls.):
      [ Production URL: `https://quickbooks.api.intuit.com/v3/company/entityname/`  
      Sandbox URL: `https://quickbooks-sandbox.api.intuit.com/v3/company/entityname/`  ]
- Required scopes : `project-management.project`, `com.intuit.quickbooks.accounting`  
- Projects feature must be enabled. Check  flag `Preferences.OtherPrefs.ProjectsEnabled` == true  
- Required headers: `Authorization: Bearer <access_token>`, `Content-Type: application/json`  
- OAuth2 is needed to get access token [OAuth2](https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization)
- Supported plans: QBO Plus, Advanced, Intuit Enterprise; Not supported: Essentials, Simple Start
- Supported sales transactions for your customers: Estimate, Invoice, Invoice Payment, Sales Receipt, Refund Receipt, Credit Memo, Vendor Credit, Journal Entry.
- Supported purchase transactions for your vendors: Bill, Expense, Purchase Order.
- List verification steps.
- List citations

###Why this matters
These checks prevent authorization, feature, and endpoint errors before calling the Projects API and related Accounting REST resources.
Citations to include:
Manage Projects Overview – https://developer.intuit.com/app/developer/qbo/docs/workflows/manage-projects  
Get Started with the Projects API – https://developer.intuit.com/app/developer/qbo/docs/workflows/manage-projects/get-started  
Develop with the Projects API – https://developer.intuit.com/app/developer/qbo/docs/workflows/manage-projects/develop-project  
Use Cases – https://developer.intuit.com/app/developer/qbo/docs/workflows/manage-projects/use-cases


### Output Format  
Generate a readiness checklist

### Quality guardrails: 
- Do not invent endpoints, headers, or scopes beyond what’s cited.  
- Remind users to confirm all pre-checks before attempting any query or mutation.    
- Emphasize that all GraphQL operations share the same endpoint and headers.
- Only include sections explicitly listed in the "Reference Facts". If a section isn't mentioned in the reference facts, do not create it

this is a prompt
