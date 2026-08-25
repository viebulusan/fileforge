import http from 'node:http'
import { toNodeHandler } from 'better-auth/node'
import { auth } from '../api/_lib/auth.js'
import { proStatus, proRedeem } from '../api/_lib/pro.js'
import {
  paypalCreateOrder,
  paypalCapture,
  paypalWebhook,
} from '../api/_lib/paypal.js'
import { usageStatus, usageBump } from '../api/_lib/usage.js'
import { textDetect, textParaphrase } from '../api/_lib/text.js'
import { originalityCheck } from '../api/_lib/search-endpoint.js'
import { contactSubmit } from '../api/_lib/contact.js'
import { verifySend } from '../api/_lib/verify-send.js'
import { verifyCheck } from '../api/_lib/verify-check.js'
import { downloadInfo } from '../api/_lib/download-info.js'
import { downloadFile } from '../api/_lib/download-file.js'

const port = Number(process.env.PORT) || 8788

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`)
  // strip trailing slash so /api/contact/ works too
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.replace(/\/+$/, '')
  }

  switch (url.pathname) {
    case '/api/pro/status': return void proStatus(req, res)
    case '/api/pro/redeem': return void proRedeem(req, res)
    case '/api/usage': return void usageStatus(req, res)
    case '/api/usage/bump': return void usageBump(req, res)
    case '/api/paypal/order': return void paypalCreateOrder(req, res)
    case '/api/paypal/capture': return void paypalCapture(req, res)
    case '/api/paypal/webhook': return void paypalWebhook(req, res)
    case '/api/text/detect': return void textDetect(req, res)
    case '/api/text/paraphrase': return void textParaphrase(req, res)
    case '/api/text/originality': return void originalityCheck(req, res)
    case '/api/contact': return void contactSubmit(req, res)
    case '/api/verify/send': return void verifySend(req, res)
    case '/api/verify/check': return void verifyCheck(req, res)
    case '/api/download/info': return void downloadInfo(req, res)
    case '/api/download/file': return void downloadFile(req, res)
    default: break
  }

  toNodeHandler(auth)(req, res)
})

server.listen(port, () => console.log(`FileForge API ready on http://localhost:${port}`))
