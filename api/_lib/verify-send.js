import { readJsonBody, sendJson } from './pro.js'
import { clientIp, rateLimited } from './ratelimit.js'
import { issueCode } from './otp.js'
import { sendMail, mailConfigured, verificationEmail } from './mail.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function verifySend(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed.' })
  }
  if (rateLimited(`otp-send:${clientIp(req)}`, 6)) {
    return sendJson(res, 429, { error: 'Too many requests — wait a minute.' })
  }

  const body = await readJsonBody(req)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!EMAIL_RE.test(email)) {
    return sendJson(res, 400, { error: 'Enter a valid email address.' })
  }

  let code
  try {
    code = await issueCode(email)
  } catch (error) {
    return sendJson(res, error.status ?? 500, {
      error: error.message ?? 'Could not start verification.',
    })
  }

  const delivery = await sendMail({ to: email, ...verificationEmail(code) })
  if (delivery.sent) {
    return sendJson(res, 200, { delivered: true })
  }
  // No SMTP credentials yet — surface the code so the flow still works while
  // email setup is finished. The UI labels this clearly.
  if (!mailConfigured() || delivery.reason === 'not_configured' || delivery.reason === 'auth_rejected') {
    return sendJson(res, 200, { delivered: false, reason: delivery.reason, devCode: code })
  }
  return sendJson(res, 502, { error: 'Could not send the verification email — try again.' })
}
