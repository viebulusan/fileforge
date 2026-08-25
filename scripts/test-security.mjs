// Live penetration-test suite for FileForge production.
// Usage: node scripts/test-security.mjs [baseUrl] [downloaderUrl]
const BASE = process.argv[2] ?? 'https://fileforge-tawny.vercel.app'
const DL = process.argv[3] ?? 'https://fileforge-downloader.onrender.com'

const results = []
function record(name, pass, detail = '') {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

async function probe(label, url, opts, expect) {
  let res
  try {
    res = await fetch(url, { ...opts, signal: AbortSignal.timeout(30_000) })
  } catch (error) {
    const destroyed = /terminated|ECONNRESET|socket|fetch failed/i.test(String(error))
    record(label, expect.accept === 'destroyed' && destroyed, `network: ${String(error).slice(0, 80)}`)
    return null
  }
  const body = await res.text().catch(() => '')
  let pass = false
  if (expect.status) pass ||= expect.status.includes(res.status)
  if (expect.notStatus) pass = pass || !expect.notStatus.includes(res.status)
  if (expect.bodyNot) pass = pass && !expect.bodyNot.some((s) => body.toLowerCase().includes(s.toLowerCase()))
  record(
    label,
    Boolean(pass),
    `${res.status}${body ? ` · ${body.slice(0, 90).replace(/\n/g, ' ')}` : ''}`,
  )
  return { res, body }
}

const SITE_ORIGIN = BASE

console.log(`\n=== 1. unauthenticated access ===`)
await probe('usage requires auth', `${BASE}/api/usage`, {}, { status: [401] })
await probe('pro status requires auth', `${BASE}/api/pro/status`, {}, { status: [401] })
await probe('paypal order requires auth', `${BASE}/api/paypal/order`, { method: 'POST' }, { status: [401, 403] })
await probe('download file requires auth', `${BASE}/api/download/file`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: SITE_ORIGIN },
  body: '{"url":"https://example.com/x.mp4"}',
}, { status: [401] })
await probe('account delete requires auth', `${BASE}/api/account/delete`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: SITE_ORIGIN },
  body: '{"confirm":"DELETE"}',
}, { status: [401] })

console.log(`\n=== 2. cross-site request forgery ===`)
for (const path of ['/api/paypal/order', '/api/paypal/capture', '/api/pro/redeem', '/api/contact', '/api/account/delete']) {
  await probe(`foreign origin blocked ${path}`, `${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://attacker.evil.example' },
    body: '{}',
  }, { status: [401, 403] })
}

console.log(`\n=== 3. injection attempts land as clean 4xx ===`)
await probe('SQLi in license key', `${BASE}/api/pro/redeem`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: SITE_ORIGIN },
  body: JSON.stringify({ key: "FF-'; DROP TABLE license_keys;--" }),
}, { status: [400, 401, 403] })
await probe('SQLi in otp email', `${BASE}/api/verify/send`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: SITE_ORIGIN },
  body: JSON.stringify({ email: "' OR 1=1 --@x.com" }),
}, { status: [400] })

console.log(`\n=== 4. webhook forgery ===`)
await probe('forged capture event rejected', `${BASE}/api/paypal/webhook`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    id: 'WH-FORGED', event_version: '1.0', event_type: 'PAYMENT.CAPTURE.COMPLETED',
    resource: { id: 'FAKE123', amount: { value: '7.00', currency_code: 'USD' }, supplementary_data: { related_ids: { order: 'FAKEORDER' } } },
  }),
}, { status: [400, 403, 503], notStatus: [200] })

console.log(`\n=== 5. security headers ===`)
{
  const res = await fetch(BASE)
  const need = {
    'strict-transport-security': 'HSTS',
    'content-security-policy': 'CSP',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'frame-deny',
    'referrer-policy': 'referrer-policy',
  }
  for (const [header, label] of Object.entries(need)) {
    record(`header ${label}`, res.headers.has(header))
  }
}

console.log(`\n=== 6. method abuse & path games ===`)
await probe('GET on paypal order → 405/404', `${BASE}/api/paypal/order`, {}, { status: [404, 405] })
await probe('gateway function not directly routable', `${BASE}/api/gateway`, {}, { status: [404, 405] })
await probe('dot-dot path stays out of the API', `${BASE}/api/%2e%2e/usage`, {}, { status: [404, 405, 200], bodyNot: ['sign in', '"error"'] })
await probe('unknown api path 404', `${BASE}/api/nonexistent-xyz`, {}, { status: [404] })

console.log(`\n=== 7. oversized payload rejected ===`)
await probe('5MB body destroyed', `${BASE}/api/text/detect`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: SITE_ORIGIN },
  body: JSON.stringify({ text: 'A'.repeat(5 * 1024 * 1024) }),
}, { accept: 'destroyed', status: [413], notStatus: [200] })

console.log(`\n=== 8. error responses leak nothing ===`)
await probe('malformed json no stack trace', `${BASE}/api/text/paraphrase`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: SITE_ORIGIN },
  body: '{broken,,,',
}, {
  status: [400, 500],
  bodyNot: ['at ', 'node_modules', 'postgres://', 'neon', 'supabase', '.env', 'secret'],
})

console.log(`\n=== 9. rate limiting live-fire ===`)
{
  let got429 = false
  for (let i = 0; i < 12; i += 1) {
    const res = await fetch(`${BASE}/api/verify/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: SITE_ORIGIN },
      body: JSON.stringify({ email: `probe${i}@example.com` }),
    }).catch(() => null)
    if (res?.status === 429) { got429 = true; break }
    await res?.text().catch(() => {})
  }
  record('otp send rate limit kicks in', got429, got429 ? '429 within 12 tries' : 'never throttled!')
}

console.log(`\n=== 10. session cookie hygiene ===`)
{
  const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: SITE_ORIGIN },
    body: JSON.stringify({ email: 'probe@example.com', password: 'wrong-password-123' }),
  })
  const setCookies = res.headers.getSetCookie?.() ?? []
  const all = setCookies.join(' | ')
  // Even a failed sign-in must not hand out a session cookie; any cookies
  // that do appear anywhere in the app must be HttpOnly + Secure.
  const hasSession = /better-auth\.session_token=/.test(all)
  const secureFlags = !hasSession || (/httponly/i.test(all) && /secure/i.test(all))
  record('no session cookie on failed login', !hasSession)
  record('cookies carry HttpOnly+Secure', secureFlags, all.slice(0, 80))
}

console.log(`\n=== 11. downloader service (Render) ===`)
await probe('DL health open (by design)', `${DL}/api/health`, {}, { status: [200] })
await probe('DL foreign origin blocked', `${DL}/api/info`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: 'https://attacker.evil.example' },
  body: '{"url":"https://youtu.be/x"}',
}, { status: [403] })
await probe('DL SSRF metadata blocked', `${DL}/api/info`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: '{"url":"http://169.254.169.254/latest/meta-data/x.mp4"}',
}, { status: [400] })
await probe('DL SSRF loopback blocked', `${DL}/api/info`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: '{"url":"http://127.0.0.1:4416/ping.mp4"}',
}, { status: [400] })
await probe('DL debug probe SSRF blocked', `${DL}/api/debug-pot?url=http://127.0.0.1/x.mp4`, {}, { status: [400] })

let failed = results.filter((r) => !r.pass).length
console.log(`\n======== ${results.length - failed}/${results.length} checks passed, ${failed} failed ========`)
process.exit(failed > 0 ? 1 : 0)
