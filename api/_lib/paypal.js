import { makePool } from './db.js'
import { readJsonBody, sameOrigin, sendJson, sessionUser } from './pro.js'
import { generateKeys } from './pro.js'
import { receiptEmail } from './mail-templates.js'
import { mailConfigured, sendMail } from './mail.js'
import { clientIp, rateLimited } from './ratelimit.js'

const pool = makePool()

const PRICE_CENTS = Number(process.env.PRO_PRICE_CENTS ?? 700)
const CURRENCY = (process.env.PRO_CURRENCY ?? 'USD').toUpperCase()

function apiBase() {
  return (process.env.PAYPAL_API_BASE ?? 'https://api-m.sandbox.paypal.com').replace(/\/+$/, '')
}

export function paypalConfigured() {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET)
}

let tokenCache = null

async function accessToken() {
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.token
  }
  const basic = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`,
  ).toString('base64')
  const res = await fetch(`${apiBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      authorization: `Basic ${basic}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  if (!res.ok) throw new Error(`PayPal auth failed (${res.status})`)
  const data = await res.json()
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in ?? 300) * 1000,
  }
  return tokenCache.token
}

async function paypalFetch(path, options) {
  const token = await accessToken()
  const res = await fetch(`${apiBase()}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(options?.headers ?? {}),
    },
  })
  const data = await res.json().catch(() => ({}))
  return { status: res.status, ok: res.ok, data }
}

async function upgradeToPro(userId) {
  await pool.query(`UPDATE "user" SET plan = 'pro' WHERE id = $1`, [userId])
}

const KEY_NOTE_PREFIX = 'paypal:'

// Issue the buyer's license key exactly once per order (the capture endpoint
// and the webhook backup both call this; `note` makes it idempotent) and
// email the receipt. Never throws — a mail hiccup must not fail a payment.
async function deliverReceipt({ orderId, to, amountCents, currency }) {
  try {
    const note = KEY_NOTE_PREFIX + orderId
    const existing = await pool.query(
      'SELECT key FROM license_keys WHERE note = $1 LIMIT 1',
      [note],
    )
    if (existing.rowCount > 0) return { key: existing.rows[0].key, emailed: false }
    const [key] = generateKeys(1)
    await pool.query(
      'INSERT INTO license_keys (key, note) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING',
      [key, note],
    )
    let emailed = false
    if (to && mailConfigured()) {
      const delivery = await sendMail({
        to,
        ...receiptEmail({ key, amount: amountCents, currency, orderId }),
      })
      emailed = Boolean(delivery?.sent)
    }
    return { key, emailed }
  } catch (error) {
    console.error('receipt delivery failed', error.message)
    return null
  }
}

export async function paypalCreateOrder(req, res) {
  try {
    if (!sameOrigin(req)) {
      return sendJson(res, 403, { error: 'Cross-site requests are not allowed.' })
    }
    if (rateLimited(`pp-order:${clientIp(req)}`, 10)) {
      return sendJson(res, 429, { error: 'Too many attempts — wait a minute.' })
    }
    if (!paypalConfigured()) {
      return sendJson(res, 503, { error: 'Payments are not configured yet.' })
    }
    const user = await sessionUser(req)
    if (!user) return sendJson(res, 401, { error: 'Sign in to buy Pro.' })

    const created = await paypalFetch('/v2/checkout/orders', {
      method: 'POST',
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            amount: {
              currency_code: CURRENCY,
              value: (PRICE_CENTS / 100).toFixed(2),
            },
            description: 'FileForge Pro — one-time license',
            custom_id: user.id,
          },
        ],
        application_context: {
          shipping_preference: 'NO_SHIPPING',
        },
      }),
    })
    if (!created.ok || !created.data.id) {
      console.error('paypal order failed', created.status, created.data)
      return sendJson(res, 502, { error: 'Could not start the payment.' })
    }

    await pool.query(
      `INSERT INTO payments (user_id, paypal_order_id, amount_cents, currency, status)
       VALUES ($1, $2, $3, $4, 'created')`,
      [user.id, created.data.id, PRICE_CENTS, CURRENCY],
    )

    return sendJson(res, 200, { orderId: created.data.id })
  } catch (error) {
    console.error('create-order error', error.message)
    return sendJson(res, 500, { error: 'Could not start the payment.' })
  }
}

export async function paypalCapture(req, res) {
  try {
    if (!sameOrigin(req)) {
      return sendJson(res, 403, { error: 'Cross-site requests are not allowed.' })
    }
    if (rateLimited(`pp-capture:${clientIp(req)}`, 10)) {
      return sendJson(res, 429, { error: 'Too many attempts — wait a minute.' })
    }
    if (!paypalConfigured()) {
      return sendJson(res, 503, { error: 'Payments are not configured yet.' })
    }
    const user = await sessionUser(req)
    if (!user) return sendJson(res, 401, { error: 'Sign in first.' })

    const body = await readJsonBody(req)
    const orderId = String(body?.orderId ?? '').trim()
    if (!orderId) return sendJson(res, 400, { error: 'Missing payment reference.' })

    const client = await pool.connect()
    let payerEmail = null
    let captured
    try {
      await client.query('BEGIN')
      const row = await client.query(
        `SELECT id, status FROM payments WHERE paypal_order_id = $1 AND user_id = $2 FOR UPDATE`,
        [orderId, user.id],
      )
      if (row.rowCount === 0) {
        await client.query('ROLLBACK')
        return sendJson(res, 404, { error: 'Unknown payment.' })
      }
      if (row.rows[0].status === 'captured') {
        await upgradeToPro(user.id)
        await client.query('COMMIT')
        return sendJson(res, 200, { plan: 'pro', alreadyDone: true })
      }

      captured = await paypalFetch(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
        method: 'POST',
        body: '{}',
      })
      if (!captured.ok || captured.data.status !== 'COMPLETED') {
        const detail =
          captured.data?.details?.[0]?.description ??
          captured.data?.message ??
          'Payment could not be completed.'
        await client.query('ROLLBACK')
        return sendJson(res, 402, { error: String(detail) })
      }

      const capture = captured.data.purchase_units?.[0]?.payments?.captures?.[0]
      await client.query(
        `UPDATE payments SET status = 'captured', captured_at = now(), payer_email = $1 WHERE id = $2`,
        [capture?.payer_email ?? captured.data.payer?.email_address ?? null, row.rows[0].id],
      )
      await client.query(`UPDATE "user" SET plan = 'pro' WHERE id = $1`, [user.id])
      await client.query('COMMIT')
      payerEmail = capture?.payer_email ?? captured.data.payer?.email_address ?? user.email ?? null
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      throw error
    } finally {
      client.release()
    }
    const receipt = await deliverReceipt({
      orderId,
      to: payerEmail,
      amountCents: PRICE_CENTS,
      currency: CURRENCY,
    })
    return sendJson(res, 200, { plan: 'pro', licenseKey: receipt?.key ?? null, receiptEmailed: receipt?.emailed === true })
  } catch (error) {
    console.error('capture error', error.message)
    return sendJson(res, 500, { error: 'Payment capture failed on our side.' })
  }
}

async function readRawBody(req, limit = 100_000) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
      if (raw.length > limit) req.destroy()
    })
    req.on('end', () => resolve(raw))
    req.on('error', reject)
  })
}

const WEBHOOK_EVENTS = new Set(['PAYMENT.CAPTURE.COMPLETED'])

export async function paypalWebhook(req, res) {
  try {
    const webhookId = process.env.PAYPAL_WEBHOOK_ID
    if (!webhookId) {
      return sendJson(res, 503, { error: 'Webhook not configured.' })
    }
    const raw = await readRawBody(req)
    let event
    try {
      event = JSON.parse(raw)
    } catch {
      return sendJson(res, 400, { error: 'Invalid payload.' })
    }

    const verifyRes = await paypalFetch('/v1/notifications/verify-webhook-signature', {
      method: 'POST',
      headers: {},
      body: JSON.stringify({
        auth_algo: req.headers['paypal-auth-algo'],
        cert_url: req.headers['paypal-cert-url'],
        transmission_id: req.headers['paypal-transmission-id'],
        transmission_sig: req.headers['paypal-transmission-sig'],
        transmission_time: req.headers['paypal-transmission-time'],
        webhook_id: webhookId,
        webhook_event: event,
      }),
    })
    if (!verifyRes.ok || verifyRes.data.verification_status !== 'SUCCESS') {
      console.error('webhook signature invalid')
      return sendJson(res, 400, { error: 'Signature verification failed.' })
    }

    if (!WEBHOOK_EVENTS.has(event.event_type)) {
      return sendJson(res, 200, { received: true })
    }

    const resource = event.resource ?? {}
    const orderId =
      resource.supplementary_data?.related_ids?.order ?? null

    if (!orderId) return sendJson(res, 200, { received: true })

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const found = await client.query(
        `SELECT id, user_id, status FROM payments WHERE paypal_order_id = $1 FOR UPDATE`,
        [orderId],
      )
      if (found.rowCount > 0 && found.rows[0].status !== 'captured') {
        await client.query(
          `UPDATE payments SET status = 'captured', captured_at = now() WHERE id = $1`,
          [found.rows[0].id],
        )
        await upgradeToPro(found.rows[0].user_id)
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      throw error
    } finally {
      client.release()
    }
    // Backup path (capture endpoint unreachable): deliver the receipt here.
    // deliverReceipt's note lookup makes double delivery impossible.
    if (orderId) {
      const cap = event.resource
      const amountCents = Math.round(Number(cap.amount?.value ?? 0) * 100)
      await deliverReceipt({
        orderId,
        to: cap.payer?.email_address ?? null,
        amountCents,
        currency: cap.amount?.currency_code ?? 'USD',
      })
    }
    return sendJson(res, 200, { received: true })
  } catch (error) {
    console.error('webhook error', error.message)
    return sendJson(res, 500, { error: 'Webhook processing failed.' })
  }
}
