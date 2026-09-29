# Workbench

Workbench is a personal AI workspace on Cloudflare Workers. It combines conversations, document and data tools, saved artifacts, and bring-your-own API keys for OpenAI, Anthropic, Gemini, and OpenRouter.

## First-release experience

- One conversation composer with tools enabled by default. You can disable any of the five tools from the composer. File text is read through `read_file`; it is never pasted into your message.
- Answers stream from all four providers over server-sent events. Stop aborts the provider request. Tool progress appears as compact steps.
- A centered reading column, collapsible sidebar, warm light and dark themes, and an artifact panel that opens only when a file is produced or selected.
- Copy, edit and resend, retry, retry with another enabled model, thumbs up/down, and a bottom-aware scroll position with “Jump to latest.”
- Markdown, syntax-highlighted code with copy controls, GFM tables, and KaTeX math.
- Artifacts for documents, code, CSV tables, SVG charts and HTML pages. The panel offers Preview/Code, source editing, numbered versions, copy, and original/Markdown/PDF downloads. HTML previews run in a sandboxed frame.
- Chats, messages, artifacts and files sync through the server. Each completed message writes one row. Stored content and file bytes are encrypted with a per-account data key. A one-click importer moves the previous browser-only conversations into the account.
- Account registration and sign-in, saved encrypted provider keys, selected models, password changes, and per-account theme settings remain available. One API key cannot be attached to two accounts.

## Storage

D1 holds account and chat metadata, encrypted messages, artifact versions, and file metadata. The production Worker uses the `workbench-files` R2 bucket, placing encrypted file bytes under `user/{userId}/files/{fileId}`. Without an R2 binding in local development, file bytes are encrypted in bounded D1 chunks so the workspace still functions.

The `VAULT_MASTER_KEY` Worker secret wraps each account's data key and protects saved API keys. Keep it backed up securely and separate from the database. Never change it without a re-encryption migration. Production sessions use Secure, HttpOnly, SameSite=Strict cookies. Server routes enforce account ownership and same-origin writes.

## Run locally

Node.js 22.13 or newer is required.

```sh
npm ci
npm run setup:local
npm run dev
```

Register an account, open Settings → Models & keys, save a provider key, and enable at least one model. Local development generates a separate ignored `.dev.vars` secret. To test local R2 storage, run `WORKBENCH_R2_BUCKET=workbench-files npm run dev`; the Cloudflare Vite plugin provides local R2 emulation.

Upload a DOCX or CSV and ask Workbench to read and improve it. Images are sent to vision-capable models; choose a model with image support. Files are limited to 10 MB each (2 MB for images), 30 files per chat, four images and 100,000 extracted characters per file.

## Deploy

```sh
npx wrangler login
npm run deploy
```

The existing D1 database, `workbench-files` R2 bucket, and `VAULT_MASTER_KEY` secret are already provisioned. `npm run deploy` applies migrations, builds with the R2 binding, and deploys the generated config. Existing D1-stored files remain readable after R2 is bound; new uploads use R2. For another installation, create your own D1 database and R2 bucket, update `vite.config.ts`, `wrangler.db.json`, and the deploy script, then set your own random 32-byte base64 `VAULT_MASTER_KEY` secret.

## Verify

```sh
npm run test
npm run typecheck
npm run build
npm run setup:local
npm run test:accounts
```

The tests cover provider stream parsing, upstream cancellation, document creation, file tools, auth and key isolation, encrypted chat/file round-trips, artifact versions, and cross-account access. `test:accounts` starts a local server and runs both account and workspace integration checks. Provider requests are mocked in automated tests; real availability and charges depend on your keys and accounts.

## Release scope

This release implements the PRD's P0 experience, with several history, settings and shortcut improvements from P1. The remaining P1/P2 work includes a Durable Object agent loop that survives tab closure, projects with shared knowledge, provider-fetched catalogs and usage data, web/code tools, sharing, voice, and a full accessibility and performance audit. The current tool loop runs in the browser for up to eight rounds, and closing the tab stops it. Chat search currently matches titles; message indexing is still to come. Real first-token speed depends on the selected provider and network; the streaming path adds no intentional buffering.

Word creation supports headings, bold, lists and tables. Complex source formatting and scanned PDF text are not preserved. HTML artifacts are previewed without script execution. Download important files before deleting a chat. No email recovery is available for username/password accounts.
