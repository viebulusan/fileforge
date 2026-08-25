import { readJsonBody, sameOrigin, sendJson, sessionUser } from './pro.js'
import { clientIp, rateLimited } from './ratelimit.js'
import { makePool } from './db.js'

const pool = makePool()

// Permanently delete the signed-in account. Requires typing DELETE to confirm.
// Cleans every table that references the user; license keys they redeemed stay
// burned (dangling reference) so a key can never be reused after deletion.
// contact_messages are kept as business records.
export async function accountDelete(req, res) {
  try {
    if (!sameOrigin(req)) {
      return sendJson(res, 403, { error: 'Cross-site requests are not allowed.' })
    }
    if (rateLimited(`del-acct:${clientIp(req)}`, 5)) {
      return sendJson(res, 429, { error: 'Too many attempts — wait a minute.' })
    }
    const user = await sessionUser(req)
    if (!user) return sendJson(res, 401, { error: 'Sign in first.' })

    const body = await readJsonBody(req)
    if (String(body?.confirm ?? '').trim().toUpperCase() !== 'DELETE') {
      return sendJson(res, 400, { error: 'Type DELETE to confirm.' })
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('DELETE FROM payments WHERE user_id = $1', [user.id])
      await client.query('DELETE FROM tool_usage WHERE user_id = $1', [user.id])
      await client.query('DELETE FROM verification_codes WHERE email = $1', [user.email])
      await client.query('DELETE FROM verification WHERE identifier = $1', [user.email])
      // session + account rows cascade from "user" via FK ON DELETE CASCADE.
      await client.query('DELETE FROM "user" WHERE id = $1', [user.id])
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      throw error
    } finally {
      client.release()
    }
    return sendJson(res, 200, { deleted: true })
  } catch (error) {
    console.error('account delete failed', error.message)
    return sendJson(res, 500, { error: 'Could not delete your account. Try again.' })
  }
}
