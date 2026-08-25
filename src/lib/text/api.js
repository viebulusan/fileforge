// Browser client for the writing-analysis endpoints (/api/text/*).
// Errors carry a `kind` so the UI can decide between falling back to the
// quick local estimate (config/network) and showing the problem (auth/quota).

async function post(path, payload) {
  let response
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {
    const error = new Error('Could not reach the FileForge API.')
    error.kind = 'network'
    throw error
  }
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(data?.error ?? `Request failed (${response.status})`)
    error.kind = data?.kind ?? 'api'
    throw error
  }
  return data
}

/**
 * Sentence-level AI detection.
 * Resolves { sentences: [{text, score, note}], overall: {score, confidence, summary} }.
 */
export function aiDetect(text) {
  return post('/api/text/detect', { text })
}

/** Paraphrase. Resolves { text }. */
export function aiParaphrase(text, variant = 0) {
  return post('/api/text/paraphrase', { text, variant })
}
