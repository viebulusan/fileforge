// Email templates — the FileForge forge aesthetic, rebuilt with
// email-client-safe tables and inline styles. Dark theme with the copper
// accent, fluid down to 320px phones via media queries, and a light-mode
// fallback for clients that refuse dark backgrounds.

const SITE_URL = (() => {
  const raw =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ??
    process.env.VERCEL_URL ??
    'https://fileforge-tawny.vercel.app'
  const trimmed = String(raw).trim().replace(/\/+$/, '')
  return trimmed.startsWith('http') ? trimmed : `https://${trimmed}`
})()

const DARK = '#0a0a09'
const RAISED = '#141412'
const LINE = '#2a2a26'
const INK = '#f0efe8'
const INK_SOFT = '#b5b3a6'
const INK_FAINT = '#8b8a80'
const COPPER = '#d9ff3d'
const COPPER_DEEP = '#b8dd1f'

function shell({ preheader, heading, kicker, bodyHtml, footerNote }) {
  return `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="dark light">
<meta name="supported-color-schemes" content="dark light">
<title>${heading}</title>
<style>
  body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  img { border: 0; outline: none; text-decoration: none; }
  table { border-collapse: collapse !important; }
  body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
  a { color: ${COPPER}; }
  @media screen and (max-width: 620px) {
    .ff-wrap { width: 100% !important; }
    .ff-pad { padding-left: 22px !important; padding-right: 22px !important; }
    .ff-code { font-size: 30px !important; letter-spacing: 8px !important; }
    .ff-heading { font-size: 22px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#0a0a09;background-color:#0a0a09;">

<div style="display:none;font-size:1px;color:#0a0a09;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</div>

<!-- light-mode clients: keep text readable if they force white -->
<div style="background-color:${DARK};" role="article" aria-roledescription="email" lang="en">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${DARK};">
  <tr>
    <td align="center" style="padding:28px 12px 40px 12px;">
      <table role="presentation" class="ff-wrap" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background-color:${RAISED};border:1px solid ${LINE};">

        <!-- header -->
        <tr>
          <td class="ff-pad" style="padding:26px 36px 0 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-family:ui-monospace,Menlo,Consolas,'Courier New',monospace;font-size:16px;font-weight:700;letter-spacing:0.06em;color:${INK};">
                  FileForge<span style="color:${COPPER};">_</span>
                </td>
                <td align="right" style="font-family:ui-monospace,Menlo,Consolas,'Courier New',monospace;font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:${INK_FAINT};">
                  every format,<br>forged locally
                </td>
              </tr>
            </table>
            <div style="height:1px;background-color:${LINE};line-height:1px;font-size:1px;margin-top:20px;">&nbsp;</div>
          </td>
        </tr>

        <!-- kicker + heading -->
        <tr>
          <td class="ff-pad" style="padding:30px 36px 0 36px;">
            <p style="margin:0;font-family:ui-monospace,Menlo,Consolas,'Courier New',monospace;font-size:11px;font-weight:700;letter-spacing:0.25em;text-transform:uppercase;color:${INK_FAINT};">
              <span style="color:${COPPER};">//</span> ${kicker}
            </p>
            <h1 class="ff-heading" style="margin:14px 0 0 0;font-family:ui-monospace,Menlo,Consolas,'Courier New',monospace;font-size:26px;line-height:1.15;font-weight:700;letter-spacing:-0.02em;color:${INK};text-transform:uppercase;">
              ${heading}
            </h1>
          </td>
        </tr>

        ${bodyHtml}

        <!-- footer -->
        <tr>
          <td class="ff-pad" style="padding:0 36px 30px 36px;">
            <div style="height:1px;background-color:${LINE};line-height:1px;font-size:1px;margin-bottom:18px;">&nbsp;</div>
            <p style="margin:0;font-family:ui-monospace,Menlo,Consolas,'Courier New',monospace;font-size:11px;line-height:1.7;color:${INK_FAINT};">
              ${footerNote}
            </p>
            <p style="margin:10px 0 0 0;font-family:ui-monospace,Menlo,Consolas,'Courier New',monospace;font-size:11px;line-height:1.7;color:${INK_FAINT};">
              <a href="${SITE_URL}" style="color:${COPPER_DEEP};text-decoration:none;">FileForge</a>
              &nbsp;·&nbsp;
              <a href="${SITE_URL}/terms" style="color:${INK_FAINT};text-decoration:none;">terms</a>
              &nbsp;·&nbsp;
              <a href="${SITE_URL}/privacy" style="color:${INK_FAINT};text-decoration:none;">privacy</a>
              &nbsp;·&nbsp;
              <a href="${SITE_URL}/contact" style="color:${INK_FAINT};text-decoration:none;">contact</a>
            </p>
            <p style="margin:10px 0 0 0;font-family:ui-monospace,Menlo,Consolas,'Courier New',monospace;font-size:11px;color:${INK_FAINT};">
              <span style="color:${COPPER};">●</span> your files never leave this device
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</div>
</body>
</html>`
}

/** The 6-digit signup/login verification code. */
export function verificationEmail(code) {
  const bodyHtml = `
        <tr>
          <td class="ff-pad" style="padding:26px 36px 0 36px;">
            <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:${INK_SOFT};">
              Enter this code to finish creating your account. It keeps throwaway
              signups out of the forge and your plan following you across devices.
            </p>
          </td>
        </tr>
        <tr>
          <td class="ff-pad" style="padding:26px 36px 6px 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${DARK};border:1px solid ${LINE};">
              <tr>
                <td align="center" style="padding:30px 16px;">
                  <span class="ff-code" style="font-family:ui-monospace,Menlo,Consolas,'Courier New',monospace;font-size:38px;font-weight:700;letter-spacing:12px;color:${COPPER};">${code}</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td class="ff-pad" style="padding:18px 36px 0 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-family:ui-monospace,Menlo,Consolas,'Courier New',monospace;font-size:12px;line-height:1.8;color:${INK_FAINT};">
                  expires in 10 minutes<br>
                  asked for it twice? only the newest code works.
                </td>
                <td align="right" style="vertical-align:top;">
                  <a href="${SITE_URL}/signup" style="display:inline-block;background-color:${COPPER};color:#0a0a09;font-family:ui-monospace,Menlo,Consolas,'Courier New',monospace;font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;text-decoration:none;padding:12px 22px;">
                    back to the forge →
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>`

  return {
    subject: `Your FileForge verification code: ${code}`,
    text: [
      'Welcome to the forge.',
      '',
      `Your verification code is: ${code}`,
      '',
      'It expires in 10 minutes. If you did not request it, ignore this email.',
      '',
      '— FileForge',
    ].join('\n'),
    html: shell({
      preheader: `Code: ${code} — expires in 10 minutes`,
      kicker: 'welcome to the forge',
      heading: 'Verify your email',
      bodyHtml,
      footerNote:
        "You received this because someone signed up at FileForge with this address. Didn't sign up? Ignore this email — nothing happens without the code.",
    }),
  }
}

/** Acknowledgment copy sent to whoever used the contact form. */
export function contactAckEmail({ name, message }) {
  const bodyHtml = `
        <tr>
          <td class="ff-pad" style="padding:26px 36px 0 36px;">
            <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:${INK_SOFT};">
              Hi ${name}, thanks for writing in. Your message is in our queue and
              we reply by email as fast as we can — usually within a day or two.
            </p>
          </td>
        </tr>
        <tr>
          <td class="ff-pad" style="padding:22px 36px 0 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${DARK};border:1px solid ${LINE};">
              <tr>
                <td style="padding:18px 20px;font-family:ui-monospace,Menlo,Consolas,'Courier New',monospace;font-size:12px;line-height:1.8;color:${INK_SOFT};">
                  <span style="color:${INK_FAINT};">you wrote:</span><br>
                  ${message.replace(/\n/g, '<br>')}
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td class="ff-pad" style="padding:22px 36px 0 36px;">
            <a href="${SITE_URL}/convert" style="display:inline-block;background-color:${COPPER};color:#0a0a09;font-family:ui-monospace,Menlo,Consolas,'Courier New',monospace;font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;text-decoration:none;padding:12px 22px;">
              keep converting →
            </a>
          </td>
        </tr>`

  return {
    subject: 'We got your message — FileForge',
    text: `Hi ${name},\n\nThanks for writing in — your message is in our queue and we reply by email as fast as we can.\n\nYou wrote:\n${message}\n\n— FileForge`,
    html: shell({
      preheader: 'Your message is in the queue — we reply by email.',
      kicker: 'talk to the forge',
      heading: 'Message received',
      bodyHtml,
      footerNote:
        'You received this because you used the contact form at FileForge. No marketing, no newsletters — just this reply.',
    }),
  }
}

/** Notification sent to the site owner when contact form is used. */
export function contactOwnerEmail({ name, email, message }) {
  const bodyHtml = `
        <tr>
          <td class="ff-pad" style="padding:26px 36px 0 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${DARK};border:1px solid ${LINE};">
              <tr>
                <td style="padding:18px 20px;font-family:ui-monospace,Menlo,Consolas,'Courier New',monospace;font-size:12px;line-height:1.9;color:${INK_SOFT};">
                  <span style="color:${INK_FAINT};">from:</span> ${name}<br>
                  <span style="color:${INK_FAINT};">email:</span> <a href="mailto:${email}" style="color:${COPPER_DEEP};text-decoration:none;">${email}</a>
                </td>
              </tr>
              <tr>
                <td style="padding:0 20px 18px 20px;font-family:ui-monospace,Menlo,Consolas,'Courier New',monospace;font-size:12px;line-height:1.8;color:${INK};">
                  ${message.replace(/\n/g, '<br>')}
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td class="ff-pad" style="padding:22px 36px 0 36px;">
            <a href="mailto:${email}?subject=Re%3A%20your%20FileForge%20message" style="display:inline-block;background-color:${COPPER};color:#0a0a09;font-family:ui-monospace,Menlo,Consolas,'Courier New',monospace;font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;text-decoration:none;padding:12px 22px;">
              reply to ${name.split(' ')[0]} →
            </a>
          </td>
        </tr>`

  return {
    subject: `FileForge contact — ${name}`,
    text: `From: ${name} <${email}>\n\n${message}`,
    html: shell({
      preheader: `${name} wrote via the contact form`,
      kicker: 'new contact message',
      heading: 'Someone wrote in',
      bodyHtml,
      footerNote: 'Internal notification — a visitor used the FileForge contact form.',
    }),
  }
}
