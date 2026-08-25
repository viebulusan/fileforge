// Email templates matching the FileForge forge aesthetic: dark paper,
// copper/lime accent, mono details. Built as nested tables with inline
// styles (email clients strip <style> in many cases) plus a small <style>
// block for progressive enhancements and phone breakpoints.

const ACCENT = '#d9ff3d'
const ACCENT_DIM = 'rgba(217, 255, 61, 0.4)'
const BG = '#0a0a09'
const CARD = '#121210'
const INK = '#f0efe8'
const INK_SOFT = '#b5b3a6'
const INK_FAINT = '#8b8a80'
const LINE = '#26251f'
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace"
const SANS = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

function shell({ preheader, title, kicker, bodyHtml, footnote }) {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" style="background-color:${BG};">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="dark" />
<meta name="supported-color-schemes" content="dark" />
<title>${title}</title>
<style>
  :root { color-scheme: dark; supported-color-schemes: dark; }
  html, body { margin: 0; padding: 0; background-color: ${BG} !important; }
  img { border: 0; }
  table { border-collapse: collapse; }
  @media only screen and (max-width: 620px) {
    .ff-wrap { width: 100% !important; }
    .ff-pad { padding-left: 22px !important; padding-right: 22px !important; }
    .ff-code { font-size: 38px !important; letter-spacing: 10px !important; }
    .ff-title { font-size: 24px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${BG};background:#0a0a09;" bgcolor="${BG}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
<div style="background-color:${BG};" bgcolor="${BG}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${BG}" style="background-color:${BG};">
  <tr>
    <td align="center" bgcolor="${BG}" style="padding:40px 16px 48px 16px;background-color:${BG};">
      <table role="presentation" class="ff-wrap" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:560px;">

        <!-- logo -->
        <tr>
          <td class="ff-pad" style="padding:0 8px 22px 8px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-family:${MONO};font-size:16px;font-weight:700;color:${INK};letter-spacing:0.06em;">
                  FileForge<span style="color:${ACCENT};">_</span>
                </td>
                <td align="right" style="font-family:${MONO};font-size:11px;color:${INK_FAINT};letter-spacing:0.18em;text-transform:uppercase;">
                  every format, forged locally
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- card -->
        <tr>
          <td bgcolor="${CARD}" style="background-color:${CARD};border:1px solid ${LINE};border-radius:4px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${CARD}">
              <tr>
                <td class="ff-pad" style="padding:34px 40px 8px 40px;font-family:${MONO};font-size:11px;font-weight:600;color:${INK_FAINT};letter-spacing:0.25em;text-transform:uppercase;">
                  <span style="color:${ACCENT};">//</span>&nbsp; ${kicker}
                </td>
              </tr>
              <tr>
                <td class="ff-pad ff-title" style="padding:14px 40px 0 40px;font-family:${SANS};font-size:26px;font-weight:700;color:${INK};letter-spacing:-0.02em;text-transform:uppercase;">
                  ${title}
                </td>
              </tr>
              ${bodyHtml}
            </table>
          </td>
        </tr>

        <!-- footnote -->
        ${footnote ? `
        <tr>
          <td class="ff-pad" style="padding:18px 40px 0 40px;font-family:${MONO};font-size:11px;line-height:1.7;color:${INK_FAINT};">
            ${footnote}
          </td>
        </tr>` : ''}

        <!-- footer -->
        <tr>
          <td class="ff-pad" style="padding:26px 8px 0 8px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${LINE};">
              <tr>
                <td style="padding-top:14px;font-family:${MONO};font-size:11px;color:${INK_FAINT};">
                  © ${new Date().getFullYear()} FileForge
                </td>
                <td align="right" style="padding-top:14px;font-family:${MONO};font-size:11px;color:${INK_FAINT};">
                  <span style="color:${ACCENT};">●</span> your files never leave this device
                </td>
              </tr>
            </table>
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

function paragraph(text, { color = INK_SOFT } = {}) {
  return `<p style="margin:0 0 16px 0;font-family:${SANS};font-size:14px;line-height:1.65;color:${color};">${text}</p>`
}

export function verificationEmail(code) {
  const digits = String(code)
    .split('')
    .map(
      (d) => `<td align="center" bgcolor="${BG}" style="background-color:${BG};border:1px solid ${ACCENT_DIM};border-radius:4px;width:52px;height:60px;font-family:${MONO};font-size:30px;font-weight:700;color:${ACCENT};">${d}</td>`,
    )
    .join('')
  const bodyHtml = `
  <tr>
    <td class="ff-pad" style="padding:18px 40px 0 40px;">${paragraph(
      'Enter this six-digit code to finish creating your account. It keeps throwaway signups out of the forge.',
    )}</td>
  </tr>
  <tr>
    <td class="ff-pad" align="center" style="padding:14px 40px 10px 40px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="padding:6px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="padding-right:8px;">${digits}</td>
        </tr></table>
      </td></tr></table>
    </td>
  </tr>
  <tr>
    <td class="ff-pad" style="padding:6px 40px 0 40px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${CARD}" style="border:1px solid ${LINE};border-radius:4px;">
        <tr>
          <td style="padding:12px 16px;font-family:${MONO};font-size:12px;line-height:1.7;color:${INK_FAINT};">
            expires in <span style="color:${INK};">10 minutes</span><br />
            didn't request it? ignore this email — nothing happens without the code.
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr><td style="padding:26px 0 30px 0;">&nbsp;</td></tr>`
  return {
    subject: `Your FileForge verification code: ${code}`,
    html: shell({
      preheader: `Your code is ${code} — it expires in 10 minutes.`,
      kicker: 'welcome to the forge',
      title: 'Confirm it’s you',
      bodyHtml,
      footnote:
        'If the buttons or code look off, paste the code exactly as shown. Need help? Just reply to this email.',
    }),
    text: [
      'Welcome to the forge.',
      '',
      `Your verification code is: ${code}`,
      '',
      'It expires in 10 minutes. If you did not request it, ignore this email.',
      '',
      '— FileForge',
    ].join('\n'),
  }
}

export function welcomeEmail({ name }) {
  const first = String(name ?? '').split(' ')[0] || 'there'
  const feature = (title, desc) => `
  <tr>
    <td style="padding:0 0 14px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${CARD}" style="border:1px solid ${LINE};border-radius:4px;">
        <tr>
          <td style="padding:14px 16px;font-family:${SANS};font-size:13px;line-height:1.6;color:${INK_SOFT};">
            <span style="color:${INK};font-weight:600;">${title}</span><br />${desc}
          </td>
        </tr>
      </table>
    </td>
  </tr>`
  const bodyHtml = `
  <tr>
    <td class="ff-pad" style="padding:18px 40px 0 40px;">${paragraph(
      `${first}, your account is live — every conversion runs on your own device, so there's nothing to configure and no queue to wait in.`,
    )}</td>
  </tr>
  <tr><td class="ff-pad" style="padding:6px 40px 0 40px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${feature('Convert — images, PDFs, audio & video', 'Drop files, pick a format, download. Big files included — nothing is uploaded.')}
      ${feature('Documents — Word ⇄ PDF and more', 'Word, PowerPoint and Excel become clean PDFs; PDFs become editable Word, PowerPoint, Excel or text.')}
      ${feature('Writing tools — paraphrase · AI scan · originality', 'Sentence-level AI highlighting built for academic screening, plus exact-match web checks for originality.')}
      ${feature('Download — save videos anywhere', 'Paste a YouTube link, pick a quality, pull down MP4 or MP3.')}
    </table>
  </td></tr>
  <tr>
    <td class="ff-pad" style="padding:8px 40px 0 40px;">${paragraph(
      `Your free plan includes 3 document conversions, 3 video downloads and 250 words per writing-tool run. Pro lifts every limit for a single $7 payment — no subscription.`,
    )}</td>
  </tr>
  <tr>
    <td class="ff-pad" align="center" style="padding:10px 40px 30px 40px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td align="center" style="background:${ACCENT};border-radius:4px;">
          <a href="/" style="display:inline-block;padding:13px 28px;font-family:${MONO};font-size:12px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#0a0a09;text-decoration:none;">Open the forge</a>
        </td>
      </tr></table>
    </td>
  </tr>`
  return {
    subject: 'Welcome to FileForge — your account is live',
    html: shell({
      preheader: 'Your account is verified. Convert images, PDFs, documents, audio and video — all on your own device.',
      kicker: 'account verified',
      title: 'Welcome aboard',
      bodyHtml,
      footnote: 'You receive this because you just created a FileForge account. Reply if anything looks wrong.',
    }),
    text: [
      'Welcome aboard — your account is verified.',
      '',
      'Everything converts on your own device: images, PDFs, documents, audio and video.',
      'Free plan: 3 document conversions, 3 video downloads, 250 words per writing run.',
      'Pro lifts every limit for a single $7 payment — no subscription.',
      '',
      '— FileForge',
    ].join('\n'),
  }
}

export function contactOwnerEmail({ name, email, message }) {
  const row = (label, value) => `
  <tr>
    <td style="padding:10px 16px;border-bottom:1px solid ${LINE};font-family:${MONO};font-size:11px;text-transform:uppercase;letter-spacing:0.14em;color:${INK_FAINT};vertical-align:top;width:88px;">${label}</td>
    <td style="padding:10px 16px;border-bottom:1px solid ${LINE};font-family:${SANS};font-size:13px;line-height:1.6;color:${INK};">${value}</td>
  </tr>`
  const escaped = String(message ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br />')
  const bodyHtml = `
  <tr>
    <td class="ff-pad" style="padding:18px 40px 0 40px;">${paragraph(
      'A new message landed in the contact queue.',
    )}</td>
  </tr>
  <tr>
    <td class="ff-pad" style="padding:6px 40px 0 40px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${CARD}" style="border:1px solid ${LINE};border-radius:4px;">
        ${row('name', name ?? '—')}
        ${row('email', `<a href="mailto:${email}" style="color:${ACCENT};text-decoration:none;">${email}</a>`)}
        ${row('message', escaped)}
      </table>
    </td>
  </tr>
  <tr>
    <td class="ff-pad" align="right" style="padding:18px 40px 30px 40px;">
      <a href="mailto:${email}?subject=Re%3A%20your%20FileForge%20message" style="font-family:${MONO};font-size:12px;color:${ACCENT};text-decoration:none;letter-spacing:0.12em;text-transform:uppercase;">reply by email →</a>
    </td>
  </tr>`
  return {
    subject: `FileForge contact — ${name}`,
    html: shell({
      preheader: `${name} wrote: ${String(message ?? '').slice(0, 80)}`,
      kicker: 'contact queue',
      title: 'New message',
      bodyHtml,
      footnote: 'Delivered by your own contact form. The message is also stored in the contact_messages table.',
    }),
    text: `From: ${name} <${email}>\n\n${message}`,
  }
}

export function contactAckEmail({ name, message }) {
  const trimmed = String(message ?? '').trim()
  const excerpt = trimmed.length > 240 ? `${trimmed.slice(0, 240)}…` : trimmed
  const bodyHtml = `
  <tr>
    <td class="ff-pad" style="padding:18px 40px 0 40px;">${paragraph(
      `${String(name ?? '').split(' ')[0] || 'Hi'}, thanks for writing in — your message is in the queue and we'll reply to this email address as soon as we can.`,
    )}</td>
  </tr>
  <tr>
    <td class="ff-pad" style="padding:6px 40px 0 40px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${CARD}" style="border:1px solid ${LINE};border-radius:4px;">
        <tr>
          <td style="padding:14px 16px;font-family:${SANS};font-size:13px;line-height:1.65;color:${INK_SOFT};">
            “${excerpt.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br />')}”
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td class="ff-pad" style="padding:14px 40px 0 40px;">${paragraph(
      'No action needed from you — this is just a receipt so you know it reached us.',
    )}</td>
  </tr>
  <tr><td style="padding:14px 0 30px 0;">&nbsp;</td></tr>`
  return {
    subject: 'We got your message — FileForge',
    html: shell({
      preheader: 'Thanks for writing in — we’ll reply as soon as we can.',
      kicker: 'message received',
      title: 'Thanks for reaching out',
      bodyHtml,
      footnote: 'You receive this because you used the contact form on FileForge.',
    }),
    text: [
      'Thanks for writing in — your message is in the queue.',
      '',
      `You wrote: "${excerpt}"`,
      '',
      "We'll reply to this email address as soon as we can.",
      '',
      '— FileForge',
    ].join('\n'),
  }
}

export function receiptEmail({ name, key, amount, currency, orderId }) {
  const who = name ? `Thanks, ${name}!` : 'Thanks!'
  const bodyHtml = `
  <tr>
    <td class="ff-pad" style="padding:18px 40px 0 40px;">${paragraph(
      `${who} your one-time FileForge Pro payment went through. Pro is already unlocked on the account you bought it from — this key is your proof of purchase.`,
    )}</td>
  </tr>
  <tr>
    <td class="ff-pad" style="padding:6px 40px 0 40px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${CARD}" style="border:1px solid ${LINE};border-radius:4px;">
        <tr>
          <td style="padding:16px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-family:${MONO};font-size:11px;color:${INK_FAINT};letter-spacing:0.14em;text-transform:uppercase;padding-bottom:8px;">license key</td>
              </tr>
              <tr>
                <td align="center" bgcolor="${BG}" style="background-color:${BG};border:1px solid ${ACCENT_DIM};border-radius:4px;padding:12px 10px;font-family:${MONO};font-size:19px;font-weight:700;letter-spacing:2px;color:${ACCENT};">${key}</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:0 16px 14px 16px;font-family:${MONO};font-size:12px;line-height:1.7;color:${INK_FAINT};">
            paid: <span style="color:${INK};">${currency} ${(amount / 100).toFixed(2)}</span> · once, no subscription<br />
            order: ${orderId}
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td class="ff-pad" style="padding:14px 40px 0 40px;">${paragraph(
      'Pro stays attached to your account automatically — you never need to type the key. If you ever want Pro on a different account, sign in there and redeem the key on your Account page.',
    )}</td>
  </tr>
  <tr><td style="padding:26px 0 30px 0;">&nbsp;</td></tr>`
  return {
    subject: `Your FileForge Pro license key — ${key}`,
    html: shell({
      preheader: 'Payment received — your license key is inside.',
      kicker: 'payment received',
      title: 'Welcome to Pro',
      bodyHtml,
      footnote:
        'Keep this email — the key is your proof of purchase. Questions? Just reply to this email.',
    }),
    text: [
      `${who} Your FileForge Pro payment went through.`,
      '',
      `License key: ${key}`,
      `Paid: ${currency} ${(amount / 100).toFixed(2)} (one-time)`,
      `Order: ${orderId}`,
      '',
      'Pro is unlocked on the account you paid from — no need to enter the key.',
      'To move Pro to another account later, redeem the key on that account\'s Account page.',
      '',
      '— FileForge',
    ].join('\n'),
  }
}
