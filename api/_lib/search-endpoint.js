import { readJsonBody, sendJson } from './pro.js'
import { clientIp, rateLimited } from './ratelimit.js'
import { checkOriginalityServer } from './search.js'

const MAX_WORDS = 3000
function readJsonBodyLimited(req) {
  return readJsonBody(req, 200_000)
}

export async function originalityCheck(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed.' })
  }
  if (rateLimited(`originality:${clientIp(req)}`, 6)) {
    return sendJson(res, 429, {
      error: 'Too many checks in a minute — take a short breath and try again.',
    })
  }

  const body = await readJsonBodyLimited(req)
  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  const words = (text.match(/\S+/g) ?? []).length
  if (words < 12) {
    return sendJson(res, 400, { error: 'Paste at least a couple of full sentences.' })
  }
  if (words > MAX_WORDS) {
    return sendJson(res, 413, { error: `Text exceeds ${MAX_WORDS} words.` })
  }

  try {
    const report = await checkOriginalityServer(text)
    sendJson(res, 200, report)
  } catch (error) {
    sendJson(res, error.status ?? 502, {
      error: error.message ?? 'Originality check failed.',
    })
  }
}
