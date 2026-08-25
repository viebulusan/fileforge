// Single gateway for every non-auth API route. The Hobby plan caps
// deployments at 12 serverless functions, so instead of one file per route,
// vercel.json rewrites /api/* here and we dispatch on the original path.
import { proRedeem, proStatus } from './_lib/pro.js'
import { paypalCapture, paypalCreateOrder, paypalWebhook } from './_lib/paypal.js'
import { textDetect, textParaphrase } from './_lib/text.js'
import { originalityCheck } from './_lib/search-endpoint.js'
import { usageBump, usageStatus } from './_lib/usage.js'
import { contactSubmit } from './_lib/contact.js'
import { verifySend } from './_lib/verify-send.js'
import { verifyCheck } from './_lib/verify-check.js'
import { downloadInfo } from './_lib/download-info.js'
import { downloadFile } from './_lib/download-file.js'

export const config = { maxDuration: 60 }

function send404(res) {
  res.statusCode = 404
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify({ error: 'Not found.' }))
}

const ROUTES = {
  '/api/usage': { GET: usageStatus },
  '/api/usage/bump': { POST: usageBump },
  '/api/pro/status': { GET: proStatus },
  '/api/pro/redeem': { POST: proRedeem },
  '/api/paypal/order': { POST: paypalCreateOrder },
  '/api/paypal/capture': { POST: paypalCapture },
  '/api/paypal/webhook': { POST: paypalWebhook },
  '/api/text/detect': { POST: textDetect },
  '/api/text/paraphrase': { POST: textParaphrase },
  '/api/text/originality': { POST: originalityCheck },
  '/api/contact': { POST: contactSubmit },
  '/api/verify/send': { POST: verifySend },
  '/api/verify/check': { POST: verifyCheck },
  '/api/download/info': { POST: downloadInfo, GET: downloadInfo },
  '/api/download/file': { POST: downloadFile },
}

export default async function handler(req, res) {
  let url
  try {
    url = new URL(req.url, 'http://internal.local')
  } catch {
    return send404(res)
  }
  // vercel.json passes the pre-rewrite path in `path`; fall back to req.url
  // so local/dev servers work without the rewrite layer.
  const passedPath = url.searchParams.get('path')
  let pathname = passedPath && /^\/api\//.test(passedPath) ? passedPath : url.pathname

  // strip trailing slash (but keep "/")
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.replace(/\/+$/, '')
  }

  const methods = ROUTES[pathname]
  if (!methods) return send404(res)

  const route = methods[req.method]
  if (!route) {
    res.statusCode = 405
    res.setHeader('allow', Object.keys(methods).join(', '))
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: 'Method not allowed.' }))
    return
  }

  await route(req, res)
}
