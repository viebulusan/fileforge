// Production server (Render/free hosts): serves the built SPA from dist/ and
// mounts the API routes in the same process — one service, one origin.
// Local dev uses server/dev-api.mjs + vite instead; this file is for hosting.

import http from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
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

const port = Number(process.env.PORT) || 3000
const root = fileURLToPath(new URL('..', import.meta.url))
const dist = join(root, 'dist')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.md': 'text/markdown; charset=utf-8',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
}

function sendFile(res, filePath) {
  const type = MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
  res.writeHead(200, { 'content-type': type })
  createReadStream(filePath).pipe(res)
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)

  // API routes — same handlers as local development.
  if (url.pathname === '/api/pro/status') return void proStatus(req, res)
  if (url.pathname === '/api/pro/redeem') return void proRedeem(req, res)
  if (url.pathname === '/api/usage') return void usageStatus(req, res)
  if (url.pathname === '/api/usage/bump') return void usageBump(req, res)
  if (url.pathname === '/api/paypal/order') return void paypalCreateOrder(req, res)
  if (url.pathname === '/api/paypal/capture') return void paypalCapture(req, res)
  if (url.pathname === '/api/paypal/webhook') return void paypalWebhook(req, res)
  if (url.pathname === '/api/text/detect') return void textDetect(req, res)
  if (url.pathname === '/api/text/paraphrase') return void textParaphrase(req, res)
  if (url.pathname.startsWith('/api/auth/')) return void toNodeHandler(auth)(req, res)

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ error: 'Method not allowed.' }))
    return
  }

  // Static files from dist/, then SPA fallback to index.html.
  const safe = normalize(url.pathname).replace(/^(\.\.[/\\])+/, '')
  let filePath = join(dist, safe)
  if (!filePath.startsWith(dist)) filePath = join(dist, 'index.html')
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(dist, 'index.html')
  }
  if (!existsSync(filePath)) {
    res.statusCode = 503
    res.end('dist/ not built — run `npm run build` first.')
    return
  }
  sendFile(res, filePath)
})

server.listen(port, () => {
  console.log(`FileForge production server ready on :${port}`)
})
