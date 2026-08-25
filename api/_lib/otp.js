// Email verification codes. Six digits, 10-minute TTL, stored hashed in
// Postgres so codes survive cold starts and work across instances.

import { makePool } from './db.js'
import crypto from 'node:crypto'

const CODE_TTL_MS = 10 * 60 * 1000
const RESEND_COOLDOWN_MS = 45 * 1000
const MAX_ATTEMPTS = 6

const pool = makePool()

let tableReady = false
async function ensureTables() {
  if (tableReady) return
  await pool.query(`
    CREATE TABLE IF NOT EXISTS verification_codes (
      email TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      attempts INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)
  await pool.query(
    `CREATE INDEX IF NOT EXISTS verification_codes_email_idx ON verification_codes (email)`,
  )
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contact_messages (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      message TEXT NOT NULL,
      emailed BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)
  tableReady = true
}

function hashCode(email, code) {
  return crypto
    .createHash('sha256')
    .update(`${email.toLowerCase()}::${code}::${process.env.BETTER_AUTH_SECRET ?? ''}`)
    .digest('hex')
}

export async function issueCode(email) {
  await ensureTables()
  // Cooldown: don't let one mailbox trigger endless sends.
  const recent = await pool.query(
    `SELECT created_at FROM verification_codes WHERE email = $1 ORDER BY created_at DESC LIMIT 1`,
    [email.toLowerCase()],
  )
  const last = recent.rows[0]?.created_at
  if (last && Date.now() - new Date(last).getTime() < RESEND_COOLDOWN_MS) {
    const error = new Error('A code was just sent — wait a moment before asking again.')
    error.status = 429
    throw error
  }

  const code = String(Math.floor(100000 + Math.random() * 900000))
  await pool.query(`DELETE FROM verification_codes WHERE email = $1`, [email.toLowerCase()])
  await pool.query(
    `INSERT INTO verification_codes (email, code_hash, expires_at) VALUES ($1, $2, $3)`,
    [email.toLowerCase(), hashCode(email, code), new Date(Date.now() + CODE_TTL_MS)],
  )
  return code
}

/** Verifies the code and marks the account verified. Returns { ok, reason }. */
export async function confirmCode(email, code) {
  await ensureTables()
  const rows = await pool.query(
    `SELECT code_hash, expires_at, attempts FROM verification_codes WHERE email = $1`,
    [email.toLowerCase()],
  )
  const record = rows.rows[0]
  if (!record) return { ok: false, reason: 'no_code' }
  if (new Date(record.expires_at).getTime() < Date.now()) {
    await pool.query(`DELETE FROM verification_codes WHERE email = $1`, [email.toLowerCase()])
    return { ok: false, reason: 'expired' }
  }
  if (record.attempts >= MAX_ATTEMPTS) {
    await pool.query(`DELETE FROM verification_codes WHERE email = $1`, [email.toLowerCase()])
    return { ok: false, reason: 'too_many' }
  }

  if (record.code_hash !== hashCode(email, code)) {
    await pool.query(
      `UPDATE verification_codes SET attempts = attempts + 1 WHERE email = $1`,
      [email.toLowerCase()],
    )
    return { ok: false, reason: 'mismatch' }
  }

  await pool.query(`DELETE FROM verification_codes WHERE email = $1`, [email.toLowerCase()])
  const updated = await pool.query(
    `UPDATE "user" SET "emailVerified" = TRUE WHERE email = $1 RETURNING id, name`,
    [email.toLowerCase()],
  )
  if (updated.rowCount === 0) return { ok: false, reason: 'unknown_user' }
  return { ok: true, name: updated.rows[0]?.name ?? '' }
}
