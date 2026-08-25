# FileForge

Every format, forged locally. A privacy-first conversion studio that runs in your
browser — images, documents, PDFs, audio and video never leave your device.

## What it does

| Family | Reads | Writes | Plan |
| --- | --- | --- | --- |
| Images | png jpg webp avif heic svg bmp gif | png · jpg · webp · avif · gif · bmp · tiff · ico · svg (vector trace) | free |
| PDF tools | pdf, images | merge · extract pages · rotate · pdf ⇄ images | free |
| Documents | xlsx xls csv tsv json md markdown | xlsx · csv · json · html · pdf | free |
| Writing tools | pasted text (paraphrase · ai scan · originality) | — | free ≤ 250 words/run, pro unlimited |

Writing tools use the **OpenRouter** free model `stealth/ox-alpha` (`OPENROUTER_API_KEY` in `.env`) when configured:
the AI scan returns a per-sentence AI-likelihood reading — sentences reading as
machine-generated are highlighted **red**, human-like ones **green** — and the
paraphraser produces full-quality rewrites. Without a key both fall back to
local offline heuristics. The originality checker runs exact-phrase web
searches: keyless DuckDuckGo by default, or the free official Google
Programmable Search API (`GOOGLE_CSE_KEY` + `GOOGLE_CSE_ID`, 100 queries/day)
when configured. Signup requires a 6-digit email code (Brevo SMTP, free
tier — `BREVO_SMTP_KEY` + `BREVO_SMTP_USER`); without it the code is shown
on screen instead.
| Audio / video | mp4 webm mov mkv mp3 wav flac ogg + more | any of the above · extract audio · gif | pro |
| Office suite | docx doc odt rtf txt xls xlsx csv ods ppt pptx odp → pdf, pdf → docx | pdf · docx | free: 3 uses · pro unlimited |
| Video downloader | youtube · facebook · instagram · thousands more via yt-dlp | mp4 · mp3 | free: 3 downloads · pro unlimited |

Plus local helper services: the **video downloader** (`downloader/`, :8787)
and the **office conversion service** (`office/`, :8789) which drives
LibreOffice headless and also serves the originality checker's web lookups.

## Architecture

- **Frontend** — React 19 + Vite + Tailwind v4, react-router. All conversions run client-side:
  - images: Canvas encoders in a web worker (`src/workers/image.worker.js`)
  - pdf: `pdf-lib` for surgery, `pdfjs-dist` for rendering
  - docs: SheetJS (`xlsx`), `marked` → HTML/PDF
  - audio/video: `@ffmpeg/ffmpeg` wasm, progress reported to the page
  - writing tools: offline synonym paraphraser + heuristic AI detector in `src/lib/text/`
- **Auth + plans** — Better Auth (email/password) on Neon Postgres.
  Plans are license keys, not subscriptions: redeem `FF-XXXX-…` on the account
  page and `user.plan` flips to `pro`. No Stripe, no card data anywhere.
- **Downloader** — standalone Express service in `downloader/` on
  `127.0.0.1:8787` driving yt-dlp from its own venv; streams best-quality
  video merged by ffmpeg or MP3 audio-only.
- **Office suite** — zero-dependency Node service in `office/` on
  `127.0.0.1:8789`: LibreOffice headless turns Word/PowerPoint/Excel/
  OpenDocument files into PDF; `/check` runs exact-phrase web searches for the
  originality tool.
- The web app only talks to the local services when their `VITE_*_URL` env
  vars are set, so production deploys stay clean (Pro pages then show a
  "service not running" hint instead of breaking).

## Local development

```sh
npm install
node --env-file=.env scripts/migrate.mjs   # once: creates user.plan + license_keys
node --env-file=.env server/dev-api.mjs    # auth + plan API on :8788
npm run dev                                # app on :5173 (proxies /api)

# video downloader (optional)
cd downloader && npm install
python3 -m venv .venv && .venv/bin/pip install yt-dlp   # once
node server.mjs                            # :8787

# office suite (optional; requires libreoffice on the machine)
node office/server.mjs                     # :8789
```

Copy `.env.example` to `.env` and fill in `DATABASE_URL`, `BETTER_AUTH_SECRET`,
`BETTER_AUTH_URL`. Set `VITE_DOWNLOADER_URL=http://127.0.0.1:8787` to enable
the Download tab locally.

> **Restart after dependency changes.** Vite pre-bundles dependencies on first
> start. If you run `npm install` (or upgrade `pdfjs-dist` etc.) while a dev
> server is already running, kill it and start again — stale pre-bundled code
> breaks the PDF tools at runtime (`pkill -f vite && npm run dev`).

## License keys

```sh
node --env-file=.env scripts/gen-keys.mjs 5 "batch-001"
```

Prints minted keys; hand them out however you sell Pro. Keys are single-use —
redemption is atomic (row lock + transaction).

## Deployment

`vercel.json` serves the SPA; everything under `api/` deploys as serverless
functions (`api/auth/[...all]`, `api/pro/status`, `api/pro/redeem`,
`api/text/*`, `api/usage/*`, `api/paypal/*`). The downloader and office
service are localhost-only by design — the web app shows a graceful
"service not running" hint where they'd be needed.

### Public video downloads (why + how)

YouTube withholds stream URLs from cloud IPs (PO-token gating), so the
hosted downloader on Vercel is best-effort: metadata and thumbnails come
from a keyless fallback, and audio sometimes works — but full-quality
video needs **yt-dlp**. The fix is a public companion instance:

1. Push this repo to GitHub.
2. Render dashboard → **New → Blueprint** → pick the repo → Render reads
   `downloader/render.yaml` → **Create** (free plan works).
3. Set `VITE_DOWNLOADER_URL=https://<name>.onrender.com` in Vercel and
   redeploy.

The companion runs yt-dlp, which keeps up with YouTube's changes — full
quality list (4K included) with in-browser merging. Free-tier instances
sleep after ~15 min idle; the first download wakes them (~40 s).
Keep it updated: Render rebuilds on push, and yt-dlp upgrades on build.

### Vercel environment variables

Auth origins are automatic: Vercel's `VERCEL_URL` and
`VERCEL_PROJECT_PRODUCTION_URL` are picked up at runtime, so free
`*.vercel.app` domains, preview deployments and custom domains all work
without configuration. Set these in the Vercel dashboard:

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | Neon/Supabase Postgres connection string |
| `BETTER_AUTH_SECRET` | ✅ | any long random string (`openssl rand -base64 32`) |
| `OPENROUTER_API_KEY` | ✅ | [openrouter.ai/keys](https://openrouter.ai/keys) — AI scan + paraphrase (free `stealth/ox-alpha`) |
| `OPENROUTER_MODEL` | recommended | `stealth/ox-alpha` (free) |
| `BREVO_SMTP_KEY` | ✅ | signup codes + contact email via Brevo's free SMTP (300/day) — key from Brevo → SMTP & API |
| `BREVO_SMTP_USER` | ✅ | the SMTP Login from Brevo → SMTP & API (e.g. a78eb9001@smtp-brevo.com) |
| `MAIL_FROM` | optional | defaults to `BREVO_SMTP_USER` (a verified sender) |
| `CONTACT_EMAIL` | optional | your inbox — contact-form messages get emailed here when set || `CONTACT_EMAIL` | optional | your inbox — contact-form messages get emailed here when set |
| `GOOGLE_CSE_KEY` + `GOOGLE_CSE_ID` | recommended for universities | free official Google Programmable Search (100 queries/day) — makes the originality checker reliable at volume; keyless DuckDuckGo is the default |
| `PAYPAL_CLIENT_ID` | for purchases | **live** credentials for real payments |
| `PAYPAL_CLIENT_SECRET` | for purchases | switch `PAYPAL_API_BASE` to `https://api-m.paypal.com` |
| `PAYPAL_API_BASE` | for purchases | `https://api-m.paypal.com` (omit for more sandbox testing) |
| `PAYPAL_WEBHOOK_ID` | optional | only validates PayPal webhooks; purchases work without |
| `BETTER_AUTH_URL` | optional | only if you want to pin the URL (auto-detected otherwise) |
| `VITE_PAYPAL_CLIENT_ID` | for purchases | same value as `PAYPAL_CLIENT_ID` (browser buttons) |
| `VITE_DOWNLOADER_URL` | only if self-hosting | public URL of your downloader service |
| `VITE_OFFICE_URL` | only if self-hosting | public URL of your office service |

Do **not** set `VITE_DOWNLOADER_URL` / `VITE_OFFICE_URL` unless you actually
host those helpers publicly — leaving them unset keeps the UI hints honest.
The `TESTING_UNLOCK_ALL` flags must stay unset in production.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Production build |
| `npm run lint` | oxlint |
| `scripts/migrate.mjs` | DB schema |
| `scripts/gen-keys.mjs N NOTE` | Mint N license keys |
