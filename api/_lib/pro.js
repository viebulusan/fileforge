import crypto from 'node:crypto'
import { makePool } from './db.js'
import { auth } from './auth.js'
import { clientIp, rateLimited } from './ratelimit.js'

const pool = makePool()

/**
 * CSRF guard for state-changing routes. better-auth already checks origins
 * for its own endpoints and issues SameSite=Lax cookies; this closes the
 * same gap for the custom API routes. Requests without an Origin header
 * (curl, server-to-server) still pass — session auth is mandatory anyway.
 */
function originOf(value) {
  if (!value) return null
  const trimmed = value.trim().replace(/\/+$/, '')
  if (!trimmed) return null
  try {
    return new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`).host
  } catch {
    return null
  }
}

// Hosts this deployment legitimately serves from — mirrors the auth config.
const TRUSTED_HOSTS = new Set(
  [
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
    process.env.RENDER_EXTERNAL_URL,
    process.env.BETTER_AUTH_URL,
    ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? '').split(','),
    // local dev servers (only trusted when no deployment host is configured,
    // mirroring the auth config's devOrigins fallback)
    ...(process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL
      ? []
      : ['localhost:5173', '127.0.0.1:5173', 'localhost:4173', '127.0.0.1:4173']),
  ]
    .filter(Boolean)
    .map((value) => originOf(value))
    .filter(Boolean),
)

export function sameOrigin(req) {
  const origin = req.headers?.origin
  if (!origin || typeof origin !== 'string') return true
  let originHost
  try {
    originHost = new URL(origin).host
  } catch {
    return false
  }
  if (originHost === req.headers?.host) return true
  // Dev proxies (Vite) forward the browser's Origin while addressing the API
  // server by its own host — accept this app's trusted deployment hosts.
  return TRUSTED_HOSTS.has(originHost)
}

function headersFrom(req) {
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers ?? {})) {
    if (value === undefined) continue
    if (Array.isArray(value)) {
      for (const entry of value) headers.append(key, String(entry))
    } else {
      headers.set(key, String(value))
    }
  }
  return headers
}

export function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

export function readJsonBody(req, limit = 10_000) {
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
      if (raw.length > limit) req.destroy()
    })
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        resolve(null)
      }
    })
    req.on('error', () => resolve(null))
  })
}

export async function sessionUser(req) {
  const session = await auth.api.getSession({ headers: headersFrom(req) })
  return session?.user ?? null
}

function normalizeKey(value) {
  return String(value ?? '')
    .toUpperCase()
    .replace(/\s+/g, '')
}

const KEY_RE = /^FF-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/

export async function proStatus(req, res) {
  try {
    const user = await sessionUser(req)
    if (!user) return sendJson(res, 401, { error: 'Sign in first.' })
    return sendJson(res, 200, { plan: user.plan ?? 'free' })
  } catch {
    return sendJson(res, 500, { error: 'Could not read your plan.' })
  }
}

// The license key from a captured PayPal payment, so buyers can always look
// their key up on this page even if they lost the receipt email.
const PAYPAL_KEY_NOTE_PREFIX = 'paypal:'

export async function proKey(req, res) {
  try {
    const user = await sessionUser(req)
    if (!user) return sendJson(res, 401, { error: 'Sign in first.' })
    const found = await pool.query(
      `SELECT k.key FROM payments p
       JOIN license_keys k ON k.note = $1 || p.paypal_order_id
       WHERE p.user_id = $2 AND p.status = 'captured'
       ORDER BY COALESCE(p.captured_at, p.created_at) DESC
       LIMIT 1`,
      [PAYPAL_KEY_NOTE_PREFIX, user.id],
    )
    return sendJson(res, 200, { key: found.rows[0]?.key ?? null })
  } catch {
    return sendJson(res, 500, { error: 'Could not read your license key.' })
  }
}

export async function proRedeem(req, res) {
  try {
    if (!sameOrigin(req)) {
      return sendJson(res, 403, { error: 'Cross-site requests are not allowed.' })
    }
    if (rateLimited(`redeem:${clientIp(req)}`, 10)) {
      return sendJson(res, 429, { error: 'Too many attempts — wait a minute and try again.' })
    }
    const user = await sessionUser(req)
    if (!user) return sendJson(res, 401, { error: 'Sign in to redeem a key.' })

    const body = await readJsonBody(req)
    if (!body || typeof body !== 'object') {
      return sendJson(res, 400, { error: 'Invalid request body.' })
    }

    const key = normalizeKey(body.key)
    if (!KEY_RE.test(key)) {
      return sendJson(res, 400, { error: 'That key does not look right. Format: FF-XXXX-XXXX-XXXX-XXXX' })
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const found = await client.query(
        'SELECT key FROM license_keys WHERE key = $1 AND redeemed_by IS NULL FOR UPDATE',
        [key],
      )
      if (found.rowCount === 0) {
        await client.query('ROLLBACK')
        return sendJson(res, 404, { error: 'That key is invalid or already used.' })
      }
      await client.query(
        `UPDATE license_keys SET redeemed_by = $1, redeemed_at = now() WHERE key = $2`,
        [user.id, key],
      )
      await client.query(`UPDATE "user" SET plan = 'pro' WHERE id = $1`, [user.id])
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      throw error
    } finally {
      client.release()
    }
    return sendJson(res, 200, { plan: 'pro' })
  } catch {
    return sendJson(res, 500, { error: 'Redemption failed on our side. Try again.' })
  }
}

export function generateKeys(count, note = null) {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  // 248 = largest multiple of 31 below 256 — rejection sampling keeps every
  // character exactly equally likely (no modulo bias).
  const pick = () => {
    for (;;) {
      const byte = crypto.randomBytes(1)[0]
      if (byte < 248) return alphabet[byte % alphabet.length]
    }
  }
  const block = () =>
    Array.from({ length: 4 }, pick).join('')
  const keys = []
  for (let i = 0; i < count; i += 1) {
    keys.push(`FF-${block()}-${block()}-${block()}-${block()}`)
  }
  return note ? keys.map((key) => ({ key, note })) : keys
}
