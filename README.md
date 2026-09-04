# Prompt-Library

Collection of reusable prompts for Intuit developers to use with AI tools.

This library organizes prompts by workflow and topic so you can quickly find, copy, and adapt them in your own development work. The goal of this prompt library is to help you quickly adapt to platform changes and implement new features. 

---

## 1. What this library is

- **Prompt recipes** written in plain Markdown.
- **Organized by workflow/topic**, e.g. discovery, change management, migrations, etc.
- **Tool‑agnostic**: you can use them with any AI assistant (IDE plugin, chat UI, API, etc.).

---

## 2. What's in this repo

| Folder | What it does | When to use it |
|---|---|---|
| [`discover/`](./discover) | Generates AI-ready prompts that produce working integration code for the **Intuit Enterprise Suite (IES) Dimensions API**, **Projects & Estimates API**, **Custom Fields API**, **Sales Tax API**, **Project Budgets**, and **Project Change Orders**. Configure target language, transaction type, and instructions in `prompt-config.json`, then run `node merge-prompt.js` to produce a ready-to-paste prompt. | You're building a new (or extending an existing) IES/QBO Advanced integration and want a starting point that uses the right endpoints, payload structures, and error handling. |
| [`workflows/webhooks-migration/`](./workflows/webhooks-migration) | Generates a guided migration prompt for moving a QuickBooks Online **webhook handler from the legacy payload to the CloudEvents format**. Supports Java, .NET, PHP, Node.js, and Python. The generated prompt detects the codebase's current state and routes to the right migration tasks. | You have an existing webhook handler that needs to accept the new CloudEvents envelope (or you want to verify your current implementation is correct). |

Each folder has its own README with full setup, configuration, and usage details.

---

## 3. How to use the prompts (copy/paste)

1. **Browse to a relevant folder**  
   Pick the workflow or topic that matches what you're trying to do (for example, discovering APIs, managing webhooks, running a migration, etc.).

2. **Open a prompt file**  
   Read the description at the top to confirm it fits your use case.

3. **Copy the prompt text**  
   Copy everything under the main "Prompts" (or similar) heading.

4. **Customize placeholders**  
   Replace any placeholder text (for example: `<your app name>`, `<project id>`, `<API key>`, or bracketed variables) with your own details.

5. **Paste into your AI tool**  
   - Paste into your IDE assistant, chat UI, or API request body.
   - Add any extra context (code snippets, logs, links) as needed.

6. **Iterate**  
   - If the response isn't quite right, refine inputs (more context, narrower scope).
   - Save new or refined prompt variants back into this repo if they're reusable.

---

## 4. Using prompts locally with `@` references

Many AI tools and IDE assistants let you reference local files using `@` (for example, `@filename` or `@path/to/file`). You can use this pattern with this prompt library.

1. **Get the prompts into your workspace**
   - Clone the repo, or
   - Copy the specific `.md` files you need into your project (for example: `prompts/`, `.prompt/`, or any folder your tool can see).

2. **Open your AI tool in the same workspace**
   - For IDE assistants, ensure the project that contains the `.md` prompts is open.
   - For CLI or other tools, point them at the folder where the prompts live.

3. **Reference a prompt with `@`**
   - In your AI chat, type something like:
     - `@workflows/webhooks-migration/prompt-template.md`
     - or shorter, if your tool supports it: `@prompt-template.md`
   - The exact syntax depends on your tool, but typically:
     - `@file-name` → references a file in the repo.
     - `@path/to/file.md` → references a nested file.

4. **Add instructions on top of the `@` reference**
   - Example:
     - `@workflows/webhooks-migration/prompt-template.md`
     - `Use this prompt and apply it to my current Java service. Assume Gradle and Spring Boot.`

5. **Edit prompts locally if needed**
   - Tweak the `.md` file to better match your app or environment.
   - Re‑run the same `@file` reference; your tool will pick up the updated content.

> **Note:** Exact `@` behavior varies by tool. If `@file` doesn't work, check your AI/IDE assistant's docs for how it resolves local file references.

---

## 5. Best practices

- **Be specific**: give concrete details (stack, language, framework, API version).
- **Include context**: link or paste relevant code, logs, or docs.
- **Keep scope small**: ask for one clear outcome at a time (e.g., "design a migration plan" before "implement everything").
- **Treat prompts as templates**: tweak wording to match your own voice and needs.
