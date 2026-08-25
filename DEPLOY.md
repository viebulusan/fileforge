# Deploying FileForge

The app is a Vercel-ready SPA + serverless functions. Everything conversion-related
runs in the visitor's browser; `api/` deploys as serverless functions.

## Hosting (free domain included)

Vercel's free Hobby tier gives you a permanent free domain:
`https://<your-project>.vercel.app` — no purchase needed. Custom domains can be
attached later at no extra cost (Vercel free includes SSL for them too).

## Option A — GitHub import (recommended)

1. Push this folder to a GitHub repo (`.env` is git-ignored — good).
2. Go to [vercel.com/new](https://vercel.com/new), import the repo.
3. Framework preset: **Vite** (auto-detected). Build command `npm run build`,
   output `dist` — defaults are correct.
4. Add environment variables (below) → Deploy.

## Option B — Vercel CLI

```sh
npm i -g vercel
vercel login
vercel               # from this folder — answer the prompts, accept defaults
vercel --prod        # when ready to go live
```

## Environment variables (Vercel dashboard → Settings → Environment Variables)

| Variable | Value | Notes |
| --- | --- | --- |
| `DATABASE_URL` | your Neon/Supabase Postgres URL | same one as `.env` |
| `BETTER_AUTH_SECRET` | same long random string as `.env` | signs sessions |
| `OPENROUTER_API_KEY` | your OpenRouter key | powers AI scan + paraphrase (free `stealth/ox-alpha`) |
| `OPENROUTER_MODEL` | `stealth/ox-alpha` | pin the model (stealth/ prefix required) |
| `BREVO_SMTP_KEY` | Brevo SMTP key (`xsmtpsib-…`, free tier) | emails signup verification codes + contact messages; without it codes show on screen |
| `BREVO_SMTP_USER` | the SMTP Login from Brevo → SMTP & API (e.g. a78eb9001@smtp-brevo.com) | the Login value from Brevo → SMTP & API page |
| `CONTACT_EMAIL` | your inbox (optional) | contact-form copies get emailed here |
| `GOOGLE_CSE_KEY` + `GOOGLE_CSE_ID` | free Google Programmable Search (optional, recommended) | reliable originality checks at volume (100 free queries/day) |
| `VITE_PAYPAL_CLIENT_ID` | your PayPal client id | enables checkout buttons |
| `PAYPAL_CLIENT_ID` | your PayPal client id | server side |
| `PAYPAL_CLIENT_SECRET` | your PayPal secret | server side |
| `PAYPAL_API_BASE` | `https://api-m.paypal.com` | **live** payments (`sandbox` for testing) |
| `PAYPAL_WEBHOOK_ID` | from PayPal dashboard | only once a webhook URL is registered |

**Do NOT set in production:**

- `VITE_DOWNLOADER_URL` / `VITE_OFFICE_URL` — those helper services are
  localhost-only. Without these vars the app shows a graceful
  "service not running" hint on the affected panels instead of breaking.
- `TESTING_UNLOCK_ALL` / `VITE_TESTING_UNLOCK_ALL` — opens every paywall.

Run `node scripts/deploy-check.mjs` locally any time to validate readiness.

## After first deploy — verify

1. Open `https://<project>.vercel.app` — landing renders, nav works.
2. Sign up a throwaway account → `/account` shows it.
3. Convert an image (client-side, should just work).
4. Tools → AI scan → verdict appears (proves `OPENROUTER_API_KEY` is wired).
5. Pricing → PayPal button renders (proves client id is wired).
6. If something 500s: Vercel dashboard → Deployments → Functions tab shows logs.

## Notes

- **Auth URLs need zero config** — better-auth infers them from the request
  host, so the free `.vercel.app` domain (or any later custom domain) just works.
- **Database** — Neon is already cloud-hosted; nothing to migrate.
- **Downloader & office services** — self-host on any always-on machine if you
  want those two features live; point `VITE_*` vars at the public URL and
  lock the services down (they are currently bound to `127.0.0.1`).
- **PayPal webhook** — after going live, register
  `https://<project>.vercel.app/api/paypal/webhook` in the PayPal developer
  dashboard and put its id into `PAYPAL_WEBHOOK_ID`.
