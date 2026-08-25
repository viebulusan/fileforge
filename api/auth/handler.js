import { toNodeHandler } from 'better-auth/node'
import { auth } from '../_lib/auth.js'

// The @vercel/node builder currently compiles catch-all routes ([...all].js)
// into single-segment matchers, so deep paths like /api/auth/sign-up/email
// never reach this function on their own. vercel.json rewrites every
// /api/auth/* request here with the original path in the `authPath` query
// param; we restore it so better-auth sees the real URL.
const nodeHandler = toNodeHandler(auth)

// Only genuine better-auth paths are accepted — anything else (protocol
// relative, absolute URLs, control characters) is ignored so the handler
// can never be tricked into presenting a forged URL to the auth router.
const AUTH_PATH_RE = /^\/api\/auth(\/[A-Za-z0-9\-._~!$&'()*+,;=:@%]*)?$/

export default function handler(req, res) {
  const url = new URL(req.url, 'http://internal.local')
  const authPath = url.searchParams.get('authPath')
  if (authPath && AUTH_PATH_RE.test(authPath)) {
    url.searchParams.delete('authPath')
    const qs = url.searchParams.toString()
    req.url = `${authPath}${qs ? `?${qs}` : ''}`
  }
  return nodeHandler(req, res)
}
