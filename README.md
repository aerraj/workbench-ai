# Workbench

A personal multi-model chat and work app deployed on Cloudflare Workers. Bring your own API keys for OpenAI, Anthropic, Google Gemini, and OpenRouter. Register a personal account, save encrypted provider keys, and enable models from a curated picker.

## What works

- Chat mode for text, document questions, and image understanding with vision-capable models.
- Work mode with a bounded eight-round tool loop and an inspectable activity log.
- Upload DOCX, text-based PDFs (up to 100 pages), CSV, text, source code, and PNG/JPEG/WebP/GIF images.
- Read file contents; analyze CSV rows and numeric columns; calculate arithmetic; create Word documents; write downloadable text and code files.
- Preview files, download outputs, export assistant responses as Word, stop generation, and manage conversations.
- API keys are encrypted with AES-256-GCM in Cloudflare D1, scoped to the signed-in user, and never returned to the browser. A unique keyed fingerprint prevents reuse of the same key across accounts.
- Username/password registration, login, logout, password changes, seven-day sessions, and per-account light/dark mode.
- Conversations and file blobs persist encrypted in IndexedDB for each account on this browser. They do not sync across devices.
- Responsive interface and accessible Radix/Shadcn controls.

## Run locally

Node.js 22.13 or newer is required.

```sh
npm ci
npm run setup:local
npm run dev
```

Open the URL printed in the terminal. Create an account (username and password), open **Models & keys**, select a provider, paste its key once, and enable the models you want. Save, then choose an enabled model in the composer. API requests retrieve your saved key on the server, never from the chat request body. Use the sun/moon button for dark mode.

To try document work, upload a DOCX and ask: “Read this document and create an improved Word version.” For CSV analysis, upload a CSV and ask for a summary and a Word report. Images are sent to the chosen provider; select a vision-capable model.

## Deploy to Cloudflare

```sh
npx wrangler login
npm run deploy
```

Vite generates `dist/server/wrangler.json`; deploy this generated configuration. The Worker name is configured in `vite.config.ts`. The app requires the D1 database configured in `vite.config.ts` and `wrangler.db.json`, plus a `VAULT_MASTER_KEY` Worker secret containing a cryptographically random 32-byte base64 value. These are already provisioned for the deployed app. `npm run deploy` applies remote migrations before deploying. For a separate installation, create your own D1 database, update both configuration files, and set the secret using `wrangler secret put VAULT_MASTER_KEY --name workbench-ai --config wrangler.db.json` with a securely generated value on stdin.

Keep the master key backed up securely and separate from the database; do not rotate or delete it without a re-encryption migration. Local development uses a separately generated, ignored `.dev.vars` file. API keys use AES-256-GCM with user/provider binding; HKDF separates encryption, password pepper, and fingerprint keys. Passwords are salted PBKDF2-SHA256 (100,000 iterations, the Workers-supported limit) plus a server-side pepper. Session tokens are random, hashed in D1, and set as Secure/HttpOnly/SameSite=Strict cookies in production. Auth endpoints are rate-limited and mutation routes enforce same-origin requests.

Optional GitHub Actions deployment is available with manual dispatch. Set repository secrets `CLOUDFLARE_API_TOKEN` (Workers edit and account read) and `CLOUDFLARE_ACCOUNT_ID` first. Do not commit credentials.

## OpenAI reasoning and tool calls

OpenAI requests use `/v1/responses`, so models such as `gpt-5.6-sol` can use Work-mode function tools with their default reasoning enabled. Function results are linked by `call_id`. Replayable output items, including encrypted reasoning state, are retained in the browser conversation and sent back on subsequent requests to the same model. Requests set `store: false`; no server-managed conversation is required. Older conversations are converted automatically, and other providers retain their existing adapters.

Select and enable GPT-5.6 Sol in Models & keys. Saved keys and enabled models survive refreshes and new logins.

## Checks

```sh
npm run test
npm run typecheck
npm run build
npm run setup:local
npm run test:accounts
```

Tests cover Word creation/extraction, CSV statistics, arithmetic parsing, file validation, all four provider adapters, cross-origin rejection, and request size validation. Regression tests also cover a complete Responses function-call / Word-generation / tool-result cycle, encrypted reasoning replay through API validation, parallel tools, legacy history, and provider switching. Provider HTTP responses in automated tests are mocked. Real model availability and billing depend on your account and API key.

## Boundaries

- Accounts, encrypted API keys, enabled models, and theme preferences are stored in D1. Chat/file contents remain encrypted on the current browser, with no cross-device sync or cloud backup. Download important outputs before clearing browser data.
- Registration uses a username, not an email address. Email verification and forgotten-password recovery are not implemented; use a password manager. Signed-in users can change their password, revoking all sessions.
- Anonymous chats from the earlier version are left untouched in the old browser storage and are not automatically assigned to an account.
- Model selection uses the curated list in `lib/catalog.ts`; availability still depends on the provider account. A saved key is checked by the provider when you use a model.
- The agent can only invoke the five built-in tools. It cannot browse the web, run a terminal or arbitrary code, control your computer, or connect to third-party accounts. Generated code is downloadable, not executed.
- Word generation supports paragraphs, headings, bold text, and bullets; source formatting and complex tables are not preserved. Legacy `.doc` files should be converted to `.docx`. Scanned PDFs need page images for visual analysis.
- Limits: 30 workspace files, 50 MB total uploads, 10 MB per file (2 MB per image), four images, 100,000 extracted characters per file, and eight model rounds per send. Large contexts may exceed individual model limits. Chat attachment text is limited to 100,000 characters per message; use Work mode to read individual files.
- Requests are non-streaming with a 110-second provider timeout. Cancel stops subsequent steps; an upstream request already started may still incur provider charges.
- Built with React, Vinext, Cloudflare Workers, TypeScript, docx, Mammoth, PDF.js, Papa Parse, and IndexedDB.

Account integration tests use two local test accounts to verify login, logout, key isolation, duplicate-key rejection, model enforcement, theme persistence, and password-change session revocation. Production data is never used by the test harness.
