# FileForge expansion — design spec (2026-08-23)

## Goal
Add document converters, a PDF editing studio, AI text tools, and gating — with a
testing mode that unlocks everything until the owner finishes verifying.

## Decisions (owner-approved)
- Docs target **Microsoft formats** only: docx → PDF, PDF → docx, pptx → PDF.
  LibreOffice formats dropped. All conversion client-side (free JS libs).
- **Owner provides the Gemini API key**, kept server-side (`GEMINI_API_KEY` in `.env`).
  Browser never sees it; text tools call our own `/api/text/*` proxy.
- **Documents = Free tier with 3 uses per user**, then upgrade prompt.
- **Testing flag**: `TESTING_UNLOCK_ALL=1` (server) + `VITE_TESTING_UNLOCK_ALL=1`
  (client) disables every gate while the owner tests. Production = flag off.
- Bank transfer section removed from Pricing.
- PayPal card funding disabled (wallet-only checkout; no billing-address forms).

## Components

### 1 · Pricing page
- Delete bank-transfer section.
- `PayPalButtons` gets `'disable-funding': 'card'`.
- Add "Continue with the Free plan →" link under the Pro CTA.

### 2 · Usage infra
- Migration adds table `tool_usage(user_id, tool TEXT, uses INT, PRIMARY KEY(user_id, tool))`.
- `api/_lib/usage.js`: `getUsage`, `bumpUsage` (atomic upsert), limit logic.
  Limits per tool defined in one map: `{ docs: 3 }`. Text tools limited by word
  count instead of uses.
- Endpoints: `GET /api/usage` (remaining), `POST /api/usage/bump {tool}`.
- Server testing flag short-circuits all limits when `TESTING_UNLOCK_ALL=1`.

### 3 · Downloader gate
- `/download`: free users see lock screen + upgrade CTA when gates active.
- Testing flag or pro plan unlocks.

### 4 · Docs suite (`/convert` docs family)
- **Word→PDF**: `docx-preview` renders into an offscreen container; pipeline
  rasterizes pages to PDF via canvas + pdf-lib. Auto-download.
- **PPT→PDF**: parse pptx (JSZip + XML) → slide text/images composed onto
  16:9 PDF pages via pdf-lib.
- **PDF→Word**: pdfjs text items grouped by line/paragraph → `docx` package builds .docx.
- Each successful conversion bumps server usage (skipped while testing).

### 5 · PDF editor studio (`/convert` pdf family)
- Organize grid: page thumbnails, drag-reorder, rotate, delete, extract selection.
- Watermark (text, opacity, angle) and page-numbers generators via pdf-lib.

### 6 · Text Tools hub (`/text`)
- Three tools: Paraphrase, AI detector (score + verdict), Plagiarism checker
  (Gemini with Google Search grounding).
- Server proxies to Gemini (`gemini-2.0-flash`), key from env, JSON responses.
- Word rules: min 25 words; free cap 400 words → warning banner + upgrade CTA;
  pro/testing unlimited.

## Error handling
- Gemini failures → friendly error, no usage consumed.
- Corrupt office files → clear message before any work starts.
- Usage endpoints fail-open? No — fail-closed for bumps (conversion still allowed,
  bump retried silently) to avoid punishing users for transient DB errors.

## Verification
- oxlint clean, vite build clean, E2E browser pass over every new flow with
  TESTING_UNLOCK_ALL=1, plus gated-state spot checks.
