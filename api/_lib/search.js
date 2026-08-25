// Server-side phrase originality checks. Picks distinctive sentences and
// looks for exact matches on the open web.
//
// Engines, in order:
// 1. Google Programmable Search JSON API — official, exact-phrase honouring,
//    free tier (100 queries/day, not a trial). Used when GOOGLE_CSE_KEY +
//    GOOGLE_CSE_ID are configured (recommended for universities).
// 2. DuckDuckGo HTML endpoint — free and keyless default. Bing's HTML
//    endpoint stopped honouring quoted phrases, so it is not used.

const SEARCH_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

export function googleCseConfigured() {
  return Boolean(process.env.GOOGLE_CSE_KEY && process.env.GOOGLE_CSE_ID)
}

function decodeEntities(text) {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, digits) => String.fromCharCode(Number(digits)))
}

function stripTags(html) {
  return decodeEntities(String(html ?? '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

export function splitSentences(text) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function countWords(s) {
  const m = s.match(/\S+/g)
  return m ? m.length : 0
}

export function searchableCandidates(text, max = 8) {
  const candidates = splitSentences(text)
    .map((s) => s.replace(/^[-–—•*\d.)\s]+/, '').trim())
    .filter((s) => {
      const words = countWords(s)
      return words >= 6 && words <= 32
    })
  candidates.sort((a, b) => b.length - a.length)
  const seen = new Set()
  const unique = []
  for (const candidate of candidates) {
    const key = candidate.slice(0, 48).toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(candidate)
    if (unique.length >= max) break
  }
  return unique
}

function anomalyPage(html) {
  return /anomaly|captcha|challenge|verify you are/i.test(html.slice(0, 4000))
}

async function fetchWithTimeout(url, options, timeoutMs = 15_000) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) })
}

/**
 * One exact-phrase DuckDuckGo lookup, trying transports in order:
 *   1. this server's own connection (html layout, then lite layout)
 *   2. r.jina.ai reader relay — Jina's cloud fetches the page with clean IPs
 *      and returns markdown; immune to the engine's IP blocks
 *   3. plain CORS-proxy relays (allorigins/codetabs) as last resort
 * Returns { content, format } — format is 'html' or 'markdown'.
 * Throws when every transport is blocked/unavailable.
 */
async function queryDuckDuckGo(phrase) {
  const liteUrl = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(`"${phrase}"`)}`
  const directTargets = [
    { url: 'https://html.duckduckgo.com/html/', format: 'html', options: { method: 'POST', headers: { 'user-agent': SEARCH_UA, 'content-type': 'application/x-www-form-urlencoded', 'accept-language': 'en-US,en;q=0.9' }, body: new URLSearchParams({ q: `"${phrase}"` }) } },
    { url: liteUrl, format: 'html', options: { headers: { 'user-agent': SEARCH_UA, 'accept-language': 'en-US,en;q=0.9' } } },
  ]

  let lastBlock = null
  for (const { url, format, options } of directTargets) {
    try {
      const res = await fetchWithTimeout(url, options)
      const html = await res.text()
      if (res.ok && !anomalyPage(html)) {
        // DDG soft-blocks by serving a 200 page with the search form but no
        // results — only accept pages that show results (or an explicit
        // no-results marker), otherwise fall through to the relays.
        const hasResults =
          /<a[^>]+href="https?:\/\//i.test(html) || /no-results__message/.test(html)
        if (hasResults) return { content: html, format }
      }
      lastBlock = new Error('rate limited')
    } catch (error) {
      lastBlock = error
    }
  }

  // r.jina.ai reader relay (markdown output, clean egress IPs). Jina rejects
  // browser-like user agents, so this hop identifies as a plain client.
  try {
    const res = await fetchWithTimeout(
      `https://r.jina.ai/${liteUrl}`,
      { headers: { 'user-agent': 'FileForge-Originality/1.0' } },
      40_000,
    )
    if (res.ok) {
      const text = await res.text()
      if (text.includes('Markdown Content:')) {
        return { content: text, format: 'markdown' }
      }
      lastBlock = new Error('jina relay empty')
    } else {
      lastBlock = new Error(`jina relay ${res.status}`)
    }
  } catch (error) {
    lastBlock = error
  }

  // plain proxy relays, last resort
  const proxyRelays = [
    (target) => `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`,
    (target) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(target)}`,
  ]
  for (const relay of proxyRelays) {
    try {
      const res = await fetchWithTimeout(
        relay(liteUrl),
        { headers: { 'user-agent': SEARCH_UA } },
      )
      if (!res.ok) {
        lastBlock = new Error(`relay ${res.status}`)
        continue
      }
      const html = await res.text()
      if (html && !anomalyPage(html)) return { content: html, format: 'html' }
      lastBlock = new Error('rate limited')
    } catch (error) {
      lastBlock = error
    }
  }
  throw lastBlock ?? new Error('search unavailable')
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function normalizeNeedle(phrase) {
  // Lowercase, drop quote marks, collapse whitespace, and strip TRAILING
  // punctuation — extracted sentences end with "." while the matching
  // snippet text usually continues ("…foolishness, it was…"), so a trailing
  // period would break every exact match.
  return phrase
    .toLowerCase()
    .replace(/["“”']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.,!?;:]+$/, '')
}

/** Official Google Programmable Search JSON API (free tier). Returns hit
 *  count for the exact phrase, or throws so the caller can fall back. */
async function countExactMatchesGoogle(phrase) {
  const params = new URLSearchParams({
    key: process.env.GOOGLE_CSE_KEY,
    cx: process.env.GOOGLE_CSE_ID,
    q: `"${phrase}"`,
    num: 10,
  })
  const res = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`, {
    signal: AbortSignal.timeout(12_000),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    const error = new Error(`Google CSE failed (${res.status})`)
    error.detail = detail.slice(0, 160)
    throw error
  }
  const data = await res.json()
  // Google honours the quotes: totalResults counts pages containing the
  // phrase. Cap display noise at 10 like the DDG path does.
  const total = Number(data?.searchInformation?.totalResults ?? 0)
  return Math.min(total, 10)
}

async function countExactMatchesDuckDuckGo(phrase) {
  // queryDuckDuckGo already rotates: direct html → direct lite → jina reader
  // relay → proxy relays. One extra backoff round covers transient failures.
  let page
  try {
    page = await queryDuckDuckGo(phrase)
  } catch {
    await sleep(2500)
    page = await queryDuckDuckGo(phrase)
  }
  const { content, format } = page
  const needle = normalizeNeedle(phrase)

  // r.jina.ai reader output: numbered markdown results, `1.[Title](url)`.
  // The query echo lives above "Markdown Content:" so it never self-matches.
  if (format === 'markdown') {
    if (!/Markdown Content:/.test(content)) {
      throw new Error('unparseable results page')
    }
    const body = content.split('Markdown Content:')[1] ?? ''
    const entries = body.split(/\n\d+\.\[/).slice(1)
    if (entries.length === 0) return 0 // genuinely no results
    return entries.filter((entry) => stripTags(entry).toLowerCase().includes(needle)).length
  }

  // No-results pages carry this marker and zero organic links.
  if (/no-results__message/.test(content)) return 0

  // html.duckduckgo.com layout: title link + snippet per result block.
  const titles = [...content.matchAll(/class="result__a"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => stripTags(m[1]))
  const snippets = [...content.matchAll(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => stripTags(m[1]))
  if (titles.length > 0) {
    return [...titles, ...snippets].filter((t) => t.toLowerCase().includes(needle)).length
  }

  // lite.duckduckgo.com layout: plain <a href="http…">Title</a> rows, one
  // result per chunk (title + snippet). Splitting on each result link keeps
  // the query echo (header/search box) out of the comparison.
  const chunks = content.split(/<a[^>]+href="https?:\/\/[^"]*"[^>]*>/i).slice(1)
  if (chunks.length > 0) {
    return chunks.filter((chunk) => stripTags(chunk).toLowerCase().includes(needle)).length
  }

  // No recognizable results structure — the page is unknown, NOT "original".
  // Throw so the caller counts it as failed instead of a false all-clear.
  throw new Error('unparseable results page')
}

// SearxNG public instances rotate per phrase — each rate-limits independently,
// so a busy instance is skipped and the next one answers. Strict exact-phrase
// counting: engines that silently ignore quotes just report 0 (conservative).
const SEARX_INSTANCES = [
  'https://search.inetol.net',
  'https://searxng.site',
  'https://priv.au',
  'https://searx.be',
  'https://search.hbubli.cc',
  'https://opnxng.com',
  'https://baresearch.org',
  'https://paulgo.io',
]

let searxStart = Math.floor(Math.random() * SEARX_INSTANCES.length)

async function countExactMatchesSearx(phrase) {
  const needle = normalizeNeedle(phrase)
  let lastError = new Error('no search instance answered')
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const base = SEARX_INSTANCES[(searxStart + attempt) % SEARX_INSTANCES.length]
    try {
      const res = await fetch(`${base}/search?q=${encodeURIComponent(`"${phrase}"`)}`, {
        headers: { 'user-agent': SEARCH_UA, accept: 'text/html', 'accept-language': 'en-US,en;q=0.9' },
        signal: AbortSignal.timeout(10_000),
      })
      if (res.status === 429 || res.status === 403) {
        searxStart = (searxStart + 1) % SEARX_INSTANCES.length
        lastError = new Error(`${base} rate-limited`)
        continue
      }
      if (!res.ok) continue
      const html = await res.text()
      const titles = [...html.matchAll(/<h3[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/g)].map((m) => stripTags(m[1]))
      const contents = [...html.matchAll(/<p[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/p>/g)].map((m) =>
        stripTags(m[1]),
      )
      const texts = [...titles, ...contents].map((t) => t.toLowerCase())
      if (texts.length === 0) continue // challenge page or empty — next instance
      return texts.filter((t) => t.includes(needle)).length
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}

export async function countExactMatches(phrase) {
  // Search the sentence WITHOUT trailing punctuation — an extracted sentence
  // ends with "." but the matching web text usually continues ("…foolishness,
  // it was…"), so querying the period finds nothing. The needle below is
  // normalized the same way.
  phrase = String(phrase ?? '').replace(/\s+/g, ' ').trim().replace(/[.,!?;:]+$/, '')
  if (!phrase) throw new Error('empty phrase')
  if (googleCseConfigured()) {
    try {
      return await countExactMatchesGoogle(phrase)
    } catch {
      // fall through to the keyless engines
    }
  }
  try {
    return await countExactMatchesDuckDuckGo(phrase)
  } catch {
    // DDG (and its relays) saturated or blocked — rotate through SearxNG.
    return countExactMatchesSearx(phrase)
  }
}

// Exact-match lookups are pure functions of the phrase — cache them briefly so
// re-checking the same draft doesn't hammer the engine.
const matchCache = new Map()
const MATCH_CACHE_TTL_MS = 5 * 60 * 1000

// Concurrency gate + stagger: at most two lookups in flight, launched with a
// small gap, so one scan can't trip the engine's bot heuristics.
let inflight = 0
const queue = []
let lastLaunch = 0

function queued(task) {
  return new Promise((resolve, reject) => {
    const run = async () => {
      const sinceLastLaunch = Date.now() - lastLaunch
      if (sinceLastLaunch < 400) await sleep(400 - sinceLastLaunch)
      lastLaunch = Date.now()
      try {
        resolve(await task())
      } catch (error) {
        reject(error)
      } finally {
        inflight -= 1
        if (queue.length > 0) queue.shift()()
      }
    }
    if (inflight >= 2) queue.push(run)
    else {
      inflight += 1
      run()
    }
  })
}

export async function checkOriginalityServer(text, { onProgress } = {}) {
  const phrases = searchableCandidates(text)
  if (phrases.length === 0) {
    const error = new Error(
      'Nothing to check — add a few full sentences of at least six words.',
    )
    error.status = 400
    throw error
  }

  const results = []
  let done = 0
  let failed = 0

  for (const phrase of phrases) {
    const cacheKey = phrase.toLowerCase()
    const cached = matchCache.get(cacheKey)
    if (cached && Date.now() < cached.expiresAt) {
      results.push({ phrase, hits: cached.hits })
      onProgress?.(++done, phrases.length)
      continue
    }
    try {
      const hits = await queued(() => countExactMatches(phrase))
      results.push({ phrase, hits })
      matchCache.set(cacheKey, { hits, expiresAt: Date.now() + MATCH_CACHE_TTL_MS })
      if (matchCache.size > 500) {
        for (const [key, entry] of matchCache) {
          if (Date.now() >= entry.expiresAt) matchCache.delete(key)
          if (matchCache.size <= 250) break
        }
      }
    } catch {
      failed += 1
      results.push({ phrase, hits: null })
    }
    onProgress?.(++done, phrases.length)
  }

  const scored = results.filter((r) => r.hits != null)
  if (scored.length === 0) {
    const error = new Error(
      'The web checker is busy right now — give it a minute and try again.',
    )
    error.status = 503
    throw error
  }

  const matched = scored.filter((r) => r.hits > 0)
  const originalPercent = Math.round((1 - matched.length / scored.length) * 100)

  return {
    originalPercent,
    checkedCount: scored.length,
    failedCount: failed,
    flagged: matched.map((r) => ({
      phrase: r.phrase,
      hits: r.hits,
      searchUrl: `https://duckduckgo.com/?q=${encodeURIComponent(`"${r.phrase}"`)}`,
    })),
  }
}
