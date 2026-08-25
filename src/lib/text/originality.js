// Originality spot-check: picks the most "searchable" sentences and looks for
// exact matches on the open web via the local FileForge office service.
// Needs internet; the service does the searching so CORS stays out of the way.

import { countWords } from './paraphrase.js'

export function splitSentences(text) {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function searchableCandidates(text, max = 8) {
  const candidates = splitSentences(text)
    .map((s) => s.replace(/^[-–—•*\d.)\s]+/, '').trim())
    .filter((s) => {
      const words = countWords(s)
      // Too short → false positives everywhere; too long → engines truncate.
      return words >= 6 && words <= 32
    })
  // Longest sentences are the most distinctive — check those first.
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

export async function checkOriginality(text, serviceUrl, { onProgress } = {}) {
  const base = (serviceUrl ?? '').replace(/\/+$/, '')
  if (!base) throw new Error('Originality check is disabled in this deployment.')

  const phrases = searchableCandidates(text)
  if (phrases.length === 0) {
    throw new Error(
      'Nothing to check — add a few full sentences of at least six words.',
    )
  }

  const results = []
  let done = 0
  let failed = 0

  for (const phrase of phrases) {
    try {
      const res = await fetch(`${base}/check?q=${encodeURIComponent(phrase)}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `check failed (${res.status})`)
      results.push({ phrase, hits: Number(data.hits ?? 0) })
    } catch {
      failed += 1
      results.push({ phrase, hits: null })
    }
    onProgress?.(++done, phrases.length)
  }

  const scored = results.filter((r) => r.hits != null)
  if (scored.length === 0) {
    throw new Error(
      'Could not reach the web checker. Make sure the local office service is running and you are online.',
    )
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
