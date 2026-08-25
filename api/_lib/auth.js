import { betterAuth } from 'better-auth'
import { Kysely, PostgresDialect } from 'kysely'
import { makePool } from './db.js'

const kysely = new Kysely({
  dialect: new PostgresDialect({
    pool: makePool(),
  }),
})

function originOf(value) {
  if (!value) return null
  const trimmed = value.trim().replace(/\/+$/, '')
  if (!trimmed) return null
  return trimmed.startsWith('http') ? trimmed : `https://${trimmed}`
}

// Hosting platforms inject their public URL automatically — Vercel
// (VERCEL_URL / VERCEL_PROJECT_PRODUCTION_URL) and Render
// (RENDER_EXTERNAL_URL) — so auth works on free subdomains, previews and
// custom domains without manual configuration.
const deployedOrigins = [
  originOf(process.env.RENDER_EXTERNAL_URL),
  originOf(process.env.VERCEL_PROJECT_PRODUCTION_URL),
  originOf(process.env.VERCEL_URL),
  originOf(process.env.BETTER_AUTH_URL),
].filter(Boolean)

const configuredOrigins = (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

// Local development fallback when nothing is configured.
const devOrigins =
  deployedOrigins.length === 0 && configuredOrigins.length === 0
    ? ['http://localhost:5173']
    : []

export const auth = betterAuth({
  database: {
    db: kysely,
    type: 'postgres',
  },
  baseURL: originOf(process.env.BETTER_AUTH_URL) ?? deployedOrigins[0] ?? undefined,
  trustedOrigins: [...new Set([...deployedOrigins, ...configuredOrigins, ...devOrigins])],
  user: {
    additionalFields: {
      plan: {
        type: 'string',
        required: false,
        defaultValue: 'free',
        input: false,
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // Accounts stay locked until the emailed six-digit code is confirmed
    // (see api/verify/*). Keeps throwaway signups out of the database.
    requireEmailVerification: true,
  },
  rateLimit: {
    // Blunts credential stuffing / signup spam. Per-instance memory on
    // serverless, but every extra hurdle counts.
    enabled: true,
    window: 60,
    max: 40,
  },
})
