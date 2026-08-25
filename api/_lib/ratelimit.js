// Shared in-memory, per-instance rate limiter for the serverless API routes.
// It won't stop a distributed attack on its own, but it blunts credential
// stuffing, license-key grinding and Gemini quota burn from single sources.

const WINDOW_MS = 60_000

const buckets = new Map()

function sweep(now) {
  if (buckets.size <= 5000) return
  for (const [key, hits] of buckets) {
    if (!hits.some((t) => now - t < WINDOW_MS)) buckets.delete(key)
  }
}

/**
 * Returns true when the caller is over the limit for this window.
 * @param {string} key stable identity (ip + purpose)
 * @param {number} max allowed hits per window
 */
export function rateLimited(key, max) {
  const now = Date.now()
  sweep(now)
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < WINDOW_MS)
  if (hits.length >= max) {
    buckets.set(key, hits)
    return true
  }
  hits.push(now)
  buckets.set(key, hits)
  return false
}

/**
 * Best-effort client identity. On Vercel the platform overwrites
 * x-forwarded-for with the real client IP, so the leftmost entry is
 * trustworthy there; x-real-ip is the fallback.
 */
export function clientIp(req) {
  const real = req.headers?.['x-real-ip']
  if (typeof real === 'string' && real.trim()) return real.trim()
  const forwarded = req.headers?.['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim()
  }
  return req.socket?.remoteAddress || 'unknown'
}
