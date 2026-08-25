import { readJsonBody, sendJson } from './pro.js'
import { clientIp, rateLimited } from './ratelimit.js'
import { confirmCode } from './otp.js'
import { sendMail, welcomeEmail } from './mail.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const REASONS = {
  no_code: 'Request a fresh code first.',
  expired: 'That code expired — request a new one.',
  mismatch: 'Wrong code — check the six digits and try again.',
  too_many: 'Too many wrong attempts — request a fresh code.',
  unknown_user: 'No account exists for that email.',
}

export async function verifyCheck(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed.' })
  }
  if (rateLimited(`otp-check:${clientIp(req)}`, 12)) {
    return sendJson(res, 429, { error: 'Too many attempts — wait a minute.' })
  }

  const body = await readJsonBody(req)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const code = typeof body?.code === 'string' ? body.code.replace(/\D/g, '') : ''
  if (!EMAIL_RE.test(email) || code.length !== 6) {
    return sendJson(res, 400, { error: 'Enter your email and the six-digit code.' })
  }

  try {
    const result = await confirmCode(email, code)
    if (!result.ok) {
      return sendJson(res, 400, { error: REASONS[result.reason] ?? 'Verification failed.' })
    }
    // Fire-and-forget welcome note — never block or fail the signup over it.
    const name = result.name ?? ''
    void sendMail({ to: email, ...welcomeEmail({ name }) }).catch(() => {})
    return sendJson(res, 200, { ok: true })
  } catch (error) {
    return sendJson(res, error.status ?? 500, {
      error: error.message ?? 'Verification failed.',
    })
  }
}
