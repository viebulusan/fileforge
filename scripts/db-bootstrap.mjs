// Database bootstrap + one-time data migration. Runs on every Vercel build
// (`npm run build` → see package.json) where the platform injects the real
// connection strings:
//   - target DB  : DATABASE_URL ?? POSTGRES_URL ?? POSTGRES_URL_NON_POOLING
//                  (Supabase integration provides POSTGRES_URL on Vercel)
//   - legacy DB  : LEGACY_DATABASE_URL (optional). When set, every row is
//                  copied legacy → target with ON CONFLICT DO NOTHING, so the
//                  same script can run many times safely.
// Also usable locally: `node --env-file=.env scripts/db-bootstrap.mjs`.
import pg from 'pg'
import { readFileSync } from 'node:fs'
import { poolOptions } from '../api/_lib/db.js'

// Local runs don't go through `node --env-file`; pick up .env if present.
if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
  try {
    for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2]
    }
  } catch {
    /* no .env — fine, Vercel injects everything */
  }
}

function targetUrl() {
  const url =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING
  if (!url) {
    // Nothing configured — skip rather than break local builds. Vercel always
    // provides a database, so production deployments bootstrap for real.
    console.log('db-bootstrap: no database configured — skipping')
    process.exit(0)
  }
  return url
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS "user" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  "emailVerified" BOOLEAN NOT NULL DEFAULT FALSE,
  image TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  plan TEXT NOT NULL DEFAULT 'free',
  role TEXT,
  banned BOOLEAN,
  "banReason" TEXT,
  "banExpires" TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  token TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "impersonatedBy" TEXT,
  "activeOrganizationId" TEXT
);
CREATE TABLE IF NOT EXISTS account (
  id TEXT PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" TIMESTAMPTZ,
  "refreshTokenExpiresAt" TIMESTAMPTZ,
  scope TEXT,
  password TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  issuer TEXT
);
CREATE TABLE IF NOT EXISTS verification (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free';
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS role TEXT;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS banned BOOLEAN;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "banReason" TEXT;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "banExpires" TIMESTAMPTZ;
ALTER TABLE session ADD COLUMN IF NOT EXISTS "impersonatedBy" TEXT;
ALTER TABLE session ADD COLUMN IF NOT EXISTS "activeOrganizationId" TEXT;
ALTER TABLE account ADD COLUMN IF NOT EXISTS issuer TEXT;

CREATE TABLE IF NOT EXISTS license_keys (
  key TEXT PRIMARY KEY,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  redeemed_by TEXT,
  redeemed_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  paypal_order_id TEXT UNIQUE NOT NULL,
  amount_cents INT NOT NULL DEFAULT 700,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'created',
  payer_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  captured_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS payments_user_id_idx ON payments (user_id);
CREATE INDEX IF NOT EXISTS payments_status_idx ON payments (status);
CREATE TABLE IF NOT EXISTS tool_usage (
  user_id TEXT NOT NULL,
  tool TEXT NOT NULL,
  uses INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tool)
);
CREATE TABLE IF NOT EXISTS verification_codes (
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS verification_codes_email_idx ON verification_codes (email);
CREATE TABLE IF NOT EXISTS contact_messages (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  message TEXT NOT NULL,
  emailed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`

// Tables copied legacy → target, in dependency order. `cols` are shared
// columns (intersection), so slight schema drift between the two databases
// doesn't break the copy.
const COPY_TABLES = [
  { table: 'user', cols: ['id', 'name', 'email', '"emailVerified"', 'image', '"createdAt"', '"updatedAt"', 'plan', 'role', 'banned', '"banReason"', '"banExpires"'], conflict: 'user_pkey' },
  { table: 'session', cols: ['id', '"expiresAt"', 'token', '"createdAt"', '"updatedAt"', '"ipAddress"', '"userAgent"', '"userId"', '"impersonatedBy"', '"activeOrganizationId"'], conflict: 'session_pkey' },
  { table: 'account', cols: ['id', '"accountId"', '"providerId"', '"userId"', '"accessToken"', '"refreshToken"', '"idToken"', '"accessTokenExpiresAt"', '"refreshTokenExpiresAt"', 'scope', 'password', '"createdAt"', '"updatedAt"', 'issuer'], conflict: 'account_pkey' },
  { table: 'verification', cols: ['id', 'identifier', 'value', '"expiresAt"', '"createdAt"', '"updatedAt"'], conflict: 'verification_pkey' },
  { table: 'license_keys', cols: ['key', 'note', 'created_at', 'redeemed_by', 'redeemed_at'], conflict: 'license_keys_pkey' },
  { table: 'payments', cols: ['id', 'user_id', 'paypal_order_id', 'amount_cents', 'currency', 'status', 'payer_email', 'created_at', 'captured_at'], conflict: 'payments_paypal_order_id_key', sequences: ['payments_id_seq'] },
  { table: 'tool_usage', cols: ['user_id', 'tool', 'uses', 'updated_at'], conflict: 'tool_usage_pkey' },
  { table: 'verification_codes', cols: ['email', 'code_hash', 'expires_at', 'attempts', 'created_at'], conflict: null },
  { table: 'contact_messages', cols: ['id', 'name', 'email', 'message', 'emailed', 'created_at'], conflict: 'contact_messages_pkey', sequences: ['contact_messages_id_seq'] },
]

async function tableColumns(client, table) {
  const { rows } = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'`,
    [table],
  )
  return new Set(rows.map((r) => r.column_name))
}

async function copyTable(legacy, target, spec) {
  const targetCols = await tableColumns(target, spec.table)
  const cols = spec.cols.filter((c) => targetCols.has(c.replace(/"/g, '')))
  if (cols.length === 0) {
    console.log(`  skip ${spec.table} (no shared columns)`)
    return 0
  }
  const colList = cols.join(', ')
  const rows = await legacy.query(`SELECT ${colList} FROM "${spec.table}"`)
  let inserted = 0
  for (const row of rows.rows) {
    const values = cols.map((_, i) => `$${i + 1}`)
    const sql = `INSERT INTO "${spec.table}" (${colList}) VALUES (${values.join(', ')})
      ON CONFLICT ${spec.conflict ? `ON CONSTRAINT ${spec.conflict}` : ''} DO NOTHING`
    const result = await target.query(sql, cols.map((c) => row[c.replace(/"/g, '')]))
    inserted += result.rowCount ?? 0
  }
  for (const seq of spec.sequences ?? []) {
    // Keep SERIAL/BIGSERIAL sequences ahead of the copied explicit ids.
    await target
      .query(`SELECT setval('${seq}', (SELECT COALESCE(MAX(id), 0) + 1 FROM "${spec.table}"), false)`)
      .catch(() => {})
  }
  console.log(`  ${spec.table}: ${rows.rows.length} rows read, ${inserted} inserted`)
  return inserted
}

async function main() {
  const target = new pg.Pool(poolOptions(targetUrl()))
  try {
    console.log('db-bootstrap: ensuring schema…')
    await target.query(SCHEMA_SQL)
    console.log('db-bootstrap: schema ready')

    const legacyUrl = process.env.LEGACY_DATABASE_URL
    if (!legacyUrl) {
      console.log('db-bootstrap: LEGACY_DATABASE_URL not set — skipping data copy')
      return
    }
    console.log('db-bootstrap: copying data from legacy database…')
    const legacy = new pg.Pool({ connectionString: legacyUrl })
    try {
      for (const spec of COPY_TABLES) {
        await copyTable(legacy, target, spec)
      }
    } finally {
      await legacy.end()
    }
    console.log('db-bootstrap: data migration complete')
  } finally {
    await target.end()
  }
}

main().catch((error) => {
  console.error('db-bootstrap failed:', error.message)
  process.exit(1)
})
