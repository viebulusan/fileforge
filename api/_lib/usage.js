import { makePool } from './db.js'
import { readJsonBody, sameOrigin, sendJson, sessionUser } from './pro.js'

const pool = makePool()

export const TESTING_UNLOCK_ALL = process.env.TESTING_UNLOCK_ALL === '1'

// Free-tier allowances per tracked tool (null = unlimited).
const FREE_LIMITS = { docs: 3, download: 3 }

function limitFor(tool) {
  return FREE_LIMITS[tool] ?? null
}

async function usedCounts(userId, tools) {
  const rows = await pool.query(
    'SELECT tool, uses FROM tool_usage WHERE user_id = $1 AND tool = ANY($2)',
    [userId, tools],
  )
  const map = Object.fromEntries(rows.rows.map((row) => [row.tool, row.uses]))
  return Object.fromEntries(tools.map((tool) => [tool, map[tool] ?? 0]))
}

export async function usageStatus(req, res) {
  try {
    if (TESTING_UNLOCK_ALL) {
      return sendJson(res, 200, { testing: true })
    }
    const user = await sessionUser(req)
    if (!user) return sendJson(res, 401, { error: 'Sign in first.' })
    const plan = user.plan ?? 'free'
    const tools = Object.keys(FREE_LIMITS)
    const used = await usedCounts(user.id, tools)
    return sendJson(res, 200, {
      testing: false,
      plan,
      limits: Object.fromEntries(
        tools.map((tool) => [tool, plan === 'pro' ? null : limitFor(tool)]),
      ),
      used,
    })
  } catch {
    return sendJson(res, 500, { error: 'Could not read your usage.' })
  }
}

/** Atomically consumes one allowance unit. Returns {ok, used?, limit?}. */
export async function consumeToolUse(user, tool) {
  const plan = user.plan ?? 'free'
  if (plan === 'pro') return { ok: true, unlimited: true }
  const limit = limitFor(tool)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const row = await client.query(
      'SELECT uses FROM tool_usage WHERE user_id = $1 AND tool = $2 FOR UPDATE',
      [user.id, tool],
    )
    const used = row.rows[0]?.uses ?? 0
    if (used >= limit) {
      await client.query('ROLLBACK')
      return { ok: false, used, limit }
    }
    await client.query(
      `INSERT INTO tool_usage (user_id, tool, uses) VALUES ($1, $2, 1)
       ON CONFLICT (user_id, tool)
       DO UPDATE SET uses = tool_usage.uses + 1, updated_at = now()`,
      [user.id, tool],
    )
    await client.query('COMMIT')
    return { ok: true, used: used + 1, limit }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

/** Gives back one unit — used when a download failed after pre-consuming. */
export async function refundToolUse(user, tool) {
  const plan = user.plan ?? 'free'
  if (plan === 'pro') return
  await pool.query(
    `UPDATE tool_usage SET uses = GREATEST(uses - 1, 0), updated_at = now()
     WHERE user_id = $1 AND tool = $2`,
    [user.id, tool],
  ).catch(() => {})
}

export async function usageBump(req, res) {
  try {
    if (!sameOrigin(req)) {
      return sendJson(res, 403, { error: 'Cross-site requests are not allowed.' })
    }
    if (TESTING_UNLOCK_ALL) {
      return sendJson(res, 200, { ok: true, testing: true })
    }
    const user = await sessionUser(req)
    if (!user) return sendJson(res, 401, { error: 'Sign in to keep converting.' })

    const body = await readJsonBody(req)
    const tool = String(body?.tool ?? '')
    if (!(tool in FREE_LIMITS)) {
      return sendJson(res, 400, { error: 'Unknown tool.' })
    }

    const result = await consumeToolUse(user, tool)
    if (!result.ok) {
      return sendJson(res, 402, {
        error: `The free plan includes ${result.limit} conversions — upgrade to Pro for unlimited.`,
        used: result.used,
        limit: result.limit,
      })
    }
    return sendJson(res, 200, { ok: true, used: result.used, limit: result.limit, ...(result.unlimited ? { unlimited: true } : {}) })
  } catch {
    // Fail-open on our side: the conversion already succeeded for the user.
    return sendJson(res, 200, { ok: true, recorded: false })
  }
}
