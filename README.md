# Workbench

A personal multi-model chat and work app deployed on Cloudflare Workers. Bring your own API keys for OpenAI, Anthropic, Google Gemini, and OpenRouter. Switch providers in a conversation and use editable model IDs.

## What works

- Chat mode for text, document questions, and image understanding with vision-capable models.
- Work mode with a bounded eight-round tool loop and an inspectable activity log.
- Upload DOCX, text-based PDFs (up to 100 pages), CSV, text, source code, and PNG/JPEG/WebP/GIF images.
- Read file contents; analyze CSV rows and numeric columns; calculate arithmetic; create Word documents; write downloadable text and code files.
- Preview files, download outputs, export assistant responses as Word, stop generation, and manage conversations.
- Conversations and file blobs persist in IndexedDB in the current browser. Keys are memory-only and must be re-entered after reload.
- Responsive interface and accessible Radix/Shadcn controls.

## Run locally

Node.js 22.13 or newer is required.

```sh
npm ci
npm run dev
```

Open the URL printed in the terminal. Choose **Connect models**, enter a provider API key and a compatible model ID, then select Chat or Work. API keys are sent to the same-origin backend, which forwards them only to a hard-coded provider endpoint. No keys are stored or logged by application code.

To try document work, upload a DOCX and ask: “Read this document and create an improved Word version.” For CSV analysis, upload a CSV and ask for a summary and a Word report. Images are sent to the chosen provider; select a vision-capable model.

## Deploy to Cloudflare

```sh
npx wrangler login
npm run deploy
```

Vite generates `dist/server/wrangler.json`; deploy this generated configuration. The Worker name is configured in `vite.config.ts`. No D1, R2, or server API secrets are required because this version uses browser storage and user-supplied keys. The deployed UI is publicly reachable; it cannot use anyone else's model credits because there are no shared server keys.

Optional GitHub Actions deployment is available with manual dispatch. Set repository secrets `CLOUDFLARE_API_TOKEN` (Workers edit and account read) and `CLOUDFLARE_ACCOUNT_ID` first. Do not commit credentials.

## OpenAI reasoning and tool calls

OpenAI requests use `/v1/responses`, so models such as `gpt-5.6-sol` can use Work-mode function tools with their default reasoning enabled. Function results are linked by `call_id`. Replayable output items, including encrypted reasoning state, are retained in the browser conversation and sent back on subsequent requests to the same model. Requests set `store: false`; no server-managed conversation is required. Older conversations are converted automatically, and other providers retain their existing adapters.

After updating an already-open tab, refresh Workbench, re-enter your API key, and keep `gpt-5.6-sol` in the OpenAI Model ID field. No change to your model selection or provider account is required for this fix.

## Checks

```sh
npm run test
npm run typecheck
npm run build
```

Tests cover Word creation/extraction, CSV statistics, arithmetic parsing, file validation, all four provider adapters, cross-origin rejection, and request size validation. Regression tests also cover a complete Responses function-call / Word-generation / tool-result cycle, encrypted reasoning replay through API validation, parallel tools, legacy history, and provider switching. Provider HTTP responses in automated tests are mocked. Real model availability and billing depend on your account and API key.

## Boundaries

- This is a personal browser-local workspace, not a multi-user cloud file service. There is no login, cross-device sync, sharing, or cloud file backup. Download important outputs before clearing browser data.
- The agent can only invoke the five built-in tools. It cannot browse the web, run a terminal or arbitrary code, control your computer, or connect to third-party accounts. Generated code is downloadable, not executed.
- Word generation supports paragraphs, headings, bold text, and bullets; source formatting and complex tables are not preserved. Legacy `.doc` files should be converted to `.docx`. Scanned PDFs need page images for visual analysis.
- Limits: 30 workspace files, 50 MB total uploads, 10 MB per file (2 MB per image), four images, 100,000 extracted characters per file, and eight model rounds per send. Large contexts may exceed individual model limits. Chat attachment text is limited to 100,000 characters per message; use Work mode to read individual files.
- Requests are non-streaming with a 110-second provider timeout. Cancel stops subsequent steps; an upstream request already started may still incur provider charges.
- Built with React, Vinext, Cloudflare Workers, TypeScript, docx, Mammoth, PDF.js, Papa Parse, and IndexedDB.
