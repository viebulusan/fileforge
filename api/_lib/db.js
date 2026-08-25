// Single place that decides which Postgres instance the app talks to.
// Priority: DATABASE_URL (explicit, e.g. local .env) → POSTGRES_URL
// (Supabase marketplace integration on Vercel) → POSTGRES_URL_NON_POOLING.
import pg from 'pg'

export function databaseUrl() {
  const url =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING
  if (!url) {
    throw new Error(
      'No database configured — set DATABASE_URL (or connect the Supabase integration, which provides POSTGRES_URL).',
    )
  }
  return url
}

// Supabase's shared pooler serves a self-signed certificate chain; node pg
// can't verify it, so SSL trust is relaxed for those hosts. Their sslmode
// param is dropped because pg v9 promotes it to verify-full, overriding the
// option below. Other providers (Neon etc.) keep their URL untouched.
export function poolOptions(url) {
  if (!/supabase\.(co|com)/i.test(url)) {
    return { connectionString: url }
  }
  return {
    connectionString: url.replace(/([?&])sslmode=[^&]*&?/, '$1').replace(/[?&]$/, ''),
    ssl: { rejectUnauthorized: false },
  }
}

export function makePool() {
  return new pg.Pool(poolOptions(databaseUrl()))
}
