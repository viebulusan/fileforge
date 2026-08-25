// Email delivery via Brevo SMTP (free tier, 300 emails/day).
// Requires BREVO_SMTP_KEY (the xsmtpsib-… key from the Brevo dashboard) and
// BREVO_SMTP_USER (the Brevo account email — it is the SMTP username).
// When either is missing — or Brevo rejects the delivery — callers get
// { sent: false, reason } and fall back gracefully instead of failing.
import nodemailer from 'nodemailer'
import {
  verificationEmail,
  welcomeEmail,
  contactOwnerEmail,
  contactAckEmail,
} from './mail-templates.js'

const SMTP_HOST = 'smtp-relay.brevo.com'
const SMTP_PORT = 587
const DEFAULT_FROM = 'FileForge <noreply@fileforge.app>'

export { verificationEmail, welcomeEmail, contactOwnerEmail, contactAckEmail }

let cachedTransport = null
let cachedKey = null

function transport() {
  const key = process.env.BREVO_SMTP_KEY ?? ''
  const user = process.env.BREVO_SMTP_USER ?? ''
  if (!key || !user) return null
  if (cachedTransport && cachedKey === key) return cachedTransport
  cachedTransport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: false,
    auth: { user, pass: key },
    connectionTimeout: 12_000,
    greetingTimeout: 12_000,
    socketTimeout: 20_000,
  })
  cachedKey = key
  return cachedTransport
}

export function mailConfigured() {
  return Boolean(process.env.BREVO_SMTP_KEY && process.env.BREVO_SMTP_USER)
}

export async function sendMail({ to, subject, text, html }) {
  const mailer = transport()
  if (!mailer) return { sent: false, reason: 'not_configured' }
  try {
    const info = await mailer.sendMail({
      from: process.env.MAIL_FROM ?? DEFAULT_FROM,
      to,
      subject,
      text,
      ...(html ? { html } : {}),
    })
    return { sent: true, reason: null, messageId: info?.messageId }
  } catch (error) {
    const message = String(error?.message ?? '')
    // 535 = wrong credentials; 525 = IP not allowlisted (Brevo → Security).
    // Both mean the deployment's SMTP setup needs attention — surface that
    // distinctly so the issue is obvious in logs and the caller can fall back.
    const reason = message.includes('535') || message.includes('525')
      ? 'auth_rejected'
      : /timeout|ECONN|ETIMEDOUT|socket/i.test(message)
        ? 'network'
        : 'send_failed'
    console.error('[mail] brevo send failed:', message.slice(0, 200))
    return { sent: false, reason }
  }
}
