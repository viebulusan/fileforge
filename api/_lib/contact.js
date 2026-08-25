import { makePool } from './db.js'
import { readJsonBody, sameOrigin, sendJson } from './pro.js'
import { clientIp, rateLimited } from './ratelimit.js'
import {
  sendMail,
  mailConfigured,
  contactAckEmail,
  contactOwnerEmail,
} from './mail.js'

const pool = makePool()

let tableReady = false
async function ensureTable() {
  if (tableReady) return
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function contactSubmit(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed.' })
  }
  if (!sameOrigin(req)) {
    return sendJson(res, 403, { error: 'Cross-site requests are not allowed.' })
  }
  if (rateLimited(`contact:${clientIp(req)}`, 4)) {
    return sendJson(res, 429, { error: 'Too many messages — try again in a minute.' })
  }

  const body = await readJsonBody(req)
  // Honeypot: bots fill every field; humans never see this one.
  if (typeof body?.company === 'string' && body.company.trim() !== '') {
    return sendJson(res, 200, { ok: true })
  }
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 120) : ''
  const email = typeof body?.email === 'string' ? body.email.trim().slice(0, 200) : ''
  const message = typeof body?.message === 'string' ? body.message.trim().slice(0, 5000) : ''
  if (!name || !EMAIL_RE.test(email) || message.length < 10) {
    return sendJson(res, 400, {
      error: 'Add your name, a valid email and a message of at least 10 characters.',
    })
  }

  await ensureTable()
  await pool.query(
    `INSERT INTO contact_messages (name, email, message) VALUES ($1, $2, $3)`,
    [name, email, message],
  )

  let emailed = false
  if (mailConfigured()) {
    const sends = [sendMail({ to: email, ...contactAckEmail({ name, message }) })]
    const owner = process.env.CONTACT_EMAIL
    if (owner) {
      sends.push(sendMail({ to: owner, ...contactOwnerEmail({ name, email, message }) }))
    }
    const deliveries = await Promise.allSettled(sends)
    emailed = deliveries.some((d) => d.status === 'fulfilled' && d.value?.sent)
    if (emailed) {
      await pool.query(
        `UPDATE contact_messages SET emailed = TRUE WHERE email = $1 AND message = $2`,
        [email, message],
      ).catch(() => {})
    }
  }

  return sendJson(res, 200, { ok: true, emailed })
}
