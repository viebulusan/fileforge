// Server-side request forgery (SSRF) protection for user-submitted URLs.
// Any endpoint that fetches a caller-supplied URL must run it through
// assertPublicUrl first: it rejects non-http(s) protocols, localhost-style
// hostnames and any host whose DNS resolves to a private, reserved or
// link-local address (cloud metadata, internal services, etc.).
//
// guardedFetch wraps the same validation around redirect following — Node's
// default fetch follows redirects silently, which would let a public URL
// bounce straight to an internal one.

import dns from 'node:dns/promises'
import net from 'node:net'

function isPrivateIpv4(ip) {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true
  const [a, b] = parts
  return (
    a === 0 || // this-network
    a === 10 || // RFC1918
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local / cloud metadata
    (a === 172 && b >= 16 && b <= 31) || // RFC1918
    (a === 192 && b === 168) || // RFC1918
    (a === 192 && b === 0) || // protocol assignments
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    a >= 224 // multicast + reserved
  )
}

function isPrivateIpv6(ip) {
  const lower = ip.toLowerCase()
  if (lower === '::' || lower === '::1') return true
  if (/^f[cd]/.test(lower)) return true // fc00::/7 unique-local
  if (/^fe[89ab]/.test(lower)) return true // fe80::/10 link-local
  if (/^ff/.test(lower)) return true // multicast
  // IPv4-mapped ::ffff:a.b.c.d
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return isPrivateIpv4(mapped[1])
  return false
}

export function isPrivateAddress(address) {
  const version = net.isIP(address)
  if (version === 4) return isPrivateIpv4(address)
  if (version === 6) return isPrivateIpv6(address)
  return true // not an IP → treat as unsafe
}

const INTERNAL_HOST_RE = /(^|\.)(localhost|local|internal|intranet|lan|home\.arpa)$/i

async function assertHostIsPublic(hostname) {
  const host = hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '')
  if (!host || host === '*' || INTERNAL_HOST_RE.test(host)) {
    throw new Error('That link points somewhere we are not allowed to go.')
  }
  const bare = net.isIP(host) ? host : null
  if (bare) {
    if (isPrivateAddress(bare)) throw new Error('That link points at a private network.')
    return
  }
  let addrs
  try {
    addrs = await dns.lookup(host, { all: true, verbatim: true })
  } catch {
    throw new Error('That link could not be resolved.')
  }
  if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) {
    throw new Error('That link points at a private network.')
  }
}

/** Validates protocol + resolved addresses. Returns the parsed URL. */
export async function assertPublicUrl(rawUrl) {
  let url
  try {
    url = new URL(typeof rawUrl === 'string' ? rawUrl : String(rawUrl))
  } catch {
    throw new Error('Invalid link.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http(s) links are supported.')
  }
  await assertHostIsPublic(url.hostname)
  return url
}

/**
 * fetch() with the same guarantees, re-validating every redirect hop.
 * maxRedirects caps the chain; each hop must stay publicly-routable.
 */
export async function guardedFetch(rawUrl, init = {}, { maxRedirects = 3, timeoutMs = 55_000 } = {}) {
  let currentUrl = typeof rawUrl === 'string' ? rawUrl : String(rawUrl)
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const url = await assertPublicUrl(currentUrl)
    const response = await fetch(url, {
      ...init,
      redirect: 'manual',
      signal: init.signal ?? AbortSignal.timeout(timeoutMs),
    })
    const location = response.headers.get('location')
    if (response.status >= 300 && response.status < 400 && location) {
      if (hop === maxRedirects) throw new Error('Too many redirects.')
      currentUrl = new URL(location, url).href
      continue
    }
    return response
  }
  throw new Error('Too many redirects.')
}
