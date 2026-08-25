// Writing tools (AI detection per-sentence + paraphrasing) powered by the
// free OpenRouter model "ox-alpha". The API key never leaves the server —
// the browser talks to these endpoints. Free shared-capacity models return
// 429s under load, so calls retry with backoff and the UI falls back to the
// offline quick-estimate engine when the model is unreachable.

import { clientIp, rateLimited } from './ratelimit.js'

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'
const DEFAULT_MODEL = 'stealth/ox-alpha'

// Hard caps so a stray client can't burn the quota.
const MAX_WORDS = 6000
const MAX_BODY_BYTES = 400_000

export function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

function readJsonBody(req, limit = MAX_BODY_BYTES) {
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
      if (raw.length > limit) req.destroy()
    })
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        resolve(null)
      }
    })
    req.on('error', () => resolve(null))
  })
}

function countWords(text) {
  const matches = String(text ?? '').trim().match(/\S+/g)
  return matches ? matches.length : 0
}

function model() {
  const raw = (process.env.OPENROUTER_MODEL || DEFAULT_MODEL).trim()
  // Tolerate vendor-prefixed ids ("stealth/ox-alpha"), stray whitespace and
  // leading/trailing slashes; fall back to the default if still not sane.
  const cleaned = raw.replace(/^\/+|\/+$/g, '')
  return /^[\w./-]+$/.test(cleaned) ? cleaned : DEFAULT_MODEL
}

// Free shared-capacity pools saturate independently — when the primary model
// is rate-limited, walk down the chain instead of failing the scan.
// openrouter/free auto-routes to whichever free model has capacity.
const MODEL_CHAIN = [
  model(),
  'openrouter/free',
  'google/gemma-4-31b-it:free',
]

// --- per-IP rate limiting (see _lib/ratelimit.js) ---
const RATE_MAX = 10

function rateLimitedFor(req) {
  return rateLimited(`text:${clientIp(req)}`, RATE_MAX)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Pulls the first balanced JSON object/array out of a model reply. */
function extractJson(text) {
  const start = text.search(/[{[]/)
  if (start === -1) return null
  const open = text[start]
  const close = open === '{' ? '}' : ']'
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === open) depth += 1
    else if (ch === close) {
      depth -= 1
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1))
        } catch {
          return null
        }
      }
    }
  }
  return null
}

async function callModelOnce(modelId, { system, user, jsonShape, temperature, maxTokens }) {
  const key = process.env.OPENROUTER_API_KEY

  const userContent = jsonShape
    ? `${user}\n\nReply with ONLY a valid JSON object of this exact shape — no markdown fences, no commentary:\n${jsonShape}`
    : user

  const body = {
    model: modelId,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userContent },
    ],
    temperature,
    // Reasoning models spend tokens thinking before answering — keep the
    // budget generous so the actual answer is never truncated to null.
    max_tokens: maxTokens,
    reasoning: { exclude: true },
  }

  let lastError = null
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt > 0) await sleep(5_000)
    let response
    try {
      response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${key}`,
          'content-type': 'application/json',
          'HTTP-Referer': process.env.OPENROUTER_SITE_URL ?? 'https://fileforge.app',
          'X-Title': 'FileForge',
        },
        signal: AbortSignal.timeout(28_000),
        body: JSON.stringify(body),
      })
    } catch (networkError) {
      lastError =
        networkError?.name === 'TimeoutError'
          ? new Error('The analysis engine took too long — try again.')
          : new Error('Could not reach the analysis engine.')
      lastError.kind = 'network'
      lastError.status = networkError?.name === 'TimeoutError' ? 504 : 502
      continue
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      let message = `Analysis engine error (${response.status})`
      try {
        const parsed = JSON.parse(detail)
        message = parsed?.error?.message ?? message
      } catch {
        /* keep default */
      }
      lastError = new Error(message)
      if (response.status === 401 || response.status === 403) {
        lastError.kind = 'auth'
        lastError.status = response.status
        throw lastError // bad key never gets better by retrying
      }
      lastError.kind = response.status === 429 ? 'rate' : 'api'
      lastError.status = response.status === 429 ? 429 : response.status >= 500 ? 502 : 400
      continue // 429/5xx → retry
    }

    const data = await response.json().catch(() => null)
    const choice = data?.choices?.[0]
    const text = String(choice?.message?.content ?? '').trim()
    if (!text) {
      lastError = new Error(
        choice?.finish_reason === 'length'
          ? 'The analysis engine ran out of room — shorten the text and try again.'
          : 'The analysis engine returned no content.',
      )
      lastError.kind = 'api'
      lastError.status = 502
      continue
    }
    return text
  }
  throw lastError ?? new Error('The analysis engine is unavailable.')
}

/** Walks the model chain: primary first, then free fallbacks — one saturated
 *  pool no longer takes the scan down. Auth/config errors abort immediately. */
async function callModel(spec) {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) {
    const error = new Error('OPENROUTER_API_KEY is not configured on this deployment.')
    error.kind = 'config'
    error.status = 503
    throw error
  }
  let lastError = null
  for (const modelId of MODEL_CHAIN) {
    try {
      return await callModelOnce(modelId, spec)
    } catch (error) {
      if (error?.kind === 'auth' || error?.kind === 'config') throw error
      lastError = error
    }
  }
  throw lastError ?? new Error('The analysis engine is unavailable.')
}

/** callModel + JSON parse with a full retry round — malformed model output
 *  (reasoning models sometimes ramble) gets a second chance, not a 502. */
async function callModelJson(spec, parse) {
  let lastError = null
  for (let round = 0; round < 2; round += 1) {
    if (round > 0) await sleep(4_000)
    try {
      const raw = await callModel(spec)
      return parse(raw)
    } catch (error) {
      if (error?.kind === 'auth' || error?.kind === 'config') throw error
      lastError = error
    }
  }
  throw lastError ?? new Error('The analysis engine is unavailable.')
}

/* ---------------- AI detection ---------------- */

const DETECT_JSON_SHAPE = `{
  "sentences": [
    { "text": "<every sentence verbatim, in order>", "score": <0-100 integer>, "note": "<max 14 words>" }
  ],
  "overall": { "score": <0-100 integer>, "confidence": "low|medium|high", "summary": "<two sentences max>" }
}`

const DETECT_SYSTEM = `You are a meticulous writing-provenance analyst helping universities screen student work.
You estimate how likely each sentence was generated by a large language model (ChatGPT, Gemini, Claude, etc.).

CALIBRATION — false accusations harm real students, so when genuinely uncertain, stay under 50.

Score every sentence 0-100 for "likelihood this sentence was AI-generated":

STRONG evidence (score 80-100) — needs SEVERAL together:
- Recognisable stock phrases used unironically: "delve into", "plays a crucial role", "it is important to note", "in today's fast-paced world", "ever-evolving landscape", "tapestry", "testament to", "unlock the potential", "harness the power", "navigate the complexities", "in the realm of", "pave the way", "foster", "underscore", "highlight the significance"
- Hollow generality: impressive-sounding sentences that convey no specific information and could open any essay on any topic
- Perfectly uniform rhythm sustained across neighbouring sentences
- Stacked hedging ("can play a significant role in helping to potentially...")

MODERATE evidence (55-79) — needs SEVERAL together:
- Listy transitions (Furthermore, Moreover, Additionally) opening consecutive sentences
- "Rule of three" overuse (every sentence has a triple: "X, Y, and Z")
- Symmetrical sentence shapes repeated back to back
- Generic abstractions with vague evidence ("many experts believe", "studies have shown" with nothing specific)

WEAK or NO evidence (0-54):
- Clean grammar, formal register, or technical vocabulary are NOT evidence — competent humans write this way, especially in academia
- Concrete specifics are strong human evidence: names, dates, places, numbers, course codes, personal anecdotes, local details, quoted speech
- Irregular rhythm, colloquialisms, typos, idiosyncratic punctuation, unusual word choices → strongly human (0-20)

Calibration anchors:
- "In today's fast-paced world, technology plays a crucial role in shaping modern education." → 90+
- "Furthermore, educators must delve into innovative methodologies to foster engagement." → 85+
- "The mitochondrion produces ATP via oxidative phosphorylation across its inner membrane." → 15-25 (technical but factual and specific)
- "I lost marks on question 3 because I forgot to convert cm to m." → 0-10
- A well-structured topic sentence with a specific, checkable claim → 25-40
- "The sample comprised 214 undergraduates recruited through the university's research participation pool." → 10-20 (precise methods prose — humans write this)
- "According to the article, the storm made landfall shortly after midnight." → 5-15 (factual reporting)
- "My grandmother kept a jar of buttons on the kitchen windowsill in Cebu." → 0-10 (specific personal detail)
- "This essay will discuss the causes and effects of climate change." → 30-45 (boilerplate a student could write — not proof of AI)

Rules:
- Cover EVERY sentence of the submitted text exactly once, verbatim, in order. Never merge or split.
- Quotes/citations inside the text score by their own likelihood, not the surrounding prose.
- When neighbouring sentences share a stock-phrase cluster, score them together high; a SINGLE mild stock phrase alone stays 40-55, never higher.
- note: at most 14 words. When you cite a stock phrase, quote it exactly.
- overall.score: word-count-weighted average of sentence scores. confidence: low under 60 words, medium under 200, high above.
- summary: two sentences max, plain language a teacher can quote, and mention at least one concrete observation.`

// Sentences in this band get a focused second opinion — single readings here
// are noisy, and this is exactly the range that decides a student's fate.
const VERIFY_BAND_MIN = 35
const VERIFY_BAND_MAX = 70

function borderline(sentences) {
  return sentences
    .map((item, index) => ({ index, item }))
    .filter(({ item }) => item.score >= VERIFY_BAND_MIN && item.score <= VERIFY_BAND_MAX)
}

const VERIFY_JSON_SHAPE = `{
  "sentences": [
    { "index": <the number given>, "score": <0-100 integer>, "note": "<max 14 words>" }
  ]
}`

function parseDetect(raw) {
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw
  const sentences = Array.isArray(data?.sentences) ? data.sentences : null
  const overall = data?.overall ?? null
  if (!sentences || !overall) throw new Error('Malformed analysis payload.')
  return {
    sentences: sentences.map((item) => ({
      text: String(item.text ?? ''),
      score: Math.max(0, Math.min(100, Math.round(Number(item.score ?? 0)))),
      note: String(item.note ?? '').slice(0, 160),
    })),
    overall: {
      score: Math.max(0, Math.min(100, Math.round(Number(overall.score ?? 0)))),
      confidence: ['low', 'medium', 'high'].includes(overall.confidence)
        ? overall.confidence
        : 'medium',
      summary: String(overall.summary ?? '').slice(0, 400),
    },
  }
}

/** Focused second pass on borderline sentences (35-70). Averages the two
 *  opinions so one noisy reading can't flag an innocent sentence. */
async function verifyBorderline(sentences, fullText) {
  const targets = borderline(sentences)
  if (targets.length === 0) return sentences

  const listing = targets
    .map(({ index, item }) => `${index + 1}. ${item.text}`)
    .join('\n')
  let raw
  try {
    raw = await callModel({
      system: `You are re-examining sentences that a first analysis found borderline (35-70 AI-likelihood).
For each numbered sentence, given its surrounding text, decide its AI-likelihood 0-100 with the same conservative calibration:
stock-phrase clusters, hollow generality, uniform rhythm and stacked hedging push UP; concrete specifics, personal detail, technical precision and irregular rhythm push DOWN.
Formal academic register alone is NOT evidence. Reply for every sentence listed.`,
      user: `Full text for context:\n\n${fullText.slice(0, 6000)}\n\nSentences to re-examine:\n${listing}`,
      jsonShape: VERIFY_JSON_SHAPE,
      temperature: 0.1,
      maxTokens: 6000,
    })
  } catch {
    return sentences // second opinion is a bonus, never a failure
  }

  let verdicts
  try {
    verdicts = extractJson(raw)?.sentences ?? []
  } catch {
    return sentences
  }

  const byIndex = new Map()
  for (const v of verdicts) {
    const idx = Number(v.index) - 1
    const score = Number(v.score)
    if (Number.isInteger(idx) && idx >= 0 && idx < sentences.length && Number.isFinite(score)) {
      byIndex.set(idx, Math.max(0, Math.min(100, Math.round(score))))
    }
  }
  return sentences.map((item, index) => {
    if (!byIndex.has(index)) return item
    const second = byIndex.get(index)
    return {
      ...item,
      score: Math.round((item.score + second) / 2),
      note: second >= 50 && item.score < 50 ? item.note : item.note,
    }
  })
}

export async function textDetect(req, res) {
  try {
    if (rateLimitedFor(req)) {
      return sendJson(res, 429, {
        error: 'Too many scans in a minute — take a short breath and try again.',
        kind: 'rate',
      })
    }
    const body = await readJsonBody(req)
    const text = typeof body?.text === 'string' ? body.text.trim() : ''
    if (countWords(text) < 5) {
      return sendJson(res, 400, { error: 'Submit at least a few words of text.' })
    }
    if (countWords(text) > MAX_WORDS) {
      return sendJson(res, 413, { error: `Text exceeds ${MAX_WORDS} words.` })
    }
    const parsed = await callModelJson(
      {
        system: DETECT_SYSTEM,
        user: `Analyse this text:\n\n${text}`,
        jsonShape: DETECT_JSON_SHAPE,
        temperature: 0.1,
        maxTokens: 12000,
      },
      (raw) => parseDetect(extractJson(raw)),
    )
    const verified = await verifyBorderline(parsed.sentences, text)

    // Recompute the overall score from the settled sentence scores.
    const weighted = verified.reduce(
      (acc, item) => {
        const words = countWords(item.text)
        acc.sum += item.score * words
        acc.total += words
        return acc
      },
      { sum: 0, total: 0 },
    )
    const overallScore =
      weighted.total > 0 ? Math.round(weighted.sum / weighted.total) : parsed.overall.score
    sendJson(res, 200, {
      sentences: verified,
      overall: {
        ...parsed.overall,
        score: overallScore,
      },
    })
  } catch (error) {
    sendJson(res, error.status ?? 500, {
      error: error.message ?? 'Detection failed.',
      kind: error.kind ?? 'api',
    })
  }
}

/* ---------------- Paraphrasing ---------------- */

const PARAPHRASE_SYSTEM = `You are an expert paraphrasing engine. Rewrite the submitted text so it reads as natural, fluent human writing while:

1. Preserving the exact meaning — no added claims, no dropped points.
2. Keeping the register/tone (formal stays formal, casual stays casual).
3. Staying within ±20% of the original length.
4. Varying sentence structure and vocabulary from the source — a paraphrase that copies the sentence skeleton is a failure.
5. Keeping proper nouns, numbers, dates, citations, quotes and technical terms unchanged.
6. Sounding like a competent human writer: varied rhythm, concrete verbs, zero stock filler phrases ("delve into", "in today's world", "plays a crucial role").

If variant hint "restructure" is given, deliberately use different sentence order and connectors than any obvious alternative.
Reply with ONLY the rewritten text — no preamble, no explanations, no quotation marks around it.`

export async function textParaphrase(req, res) {
  try {
    if (rateLimitedFor(req)) {
      return sendJson(res, 429, {
        error: 'Too many rewrites in a minute — take a short breath and try again.',
        kind: 'rate',
      })
    }
    const body = await readJsonBody(req)
    const text = typeof body?.text === 'string' ? body.text.trim() : ''
    if (countWords(text) < 2) {
      return sendJson(res, 400, { error: 'Nothing to paraphrase.' })
    }
    if (countWords(text) > MAX_WORDS) {
      return sendJson(res, 413, { error: `Text exceeds ${MAX_WORDS} words.` })
    }
    const restructure = body?.variant > 0
    const raw = await callModel(
      {
        system: PARAPHRASE_SYSTEM,
        user: restructure
          ? `Variant #${body.variant}: use clearly different structure from previous attempts.\n\n${text}`
          : text,
        temperature: 0.75,
        maxTokens: 12000,
      },
    )
    const cleaned = raw.replace(/^["“']|["”']$/g, '').trim()
    if (!cleaned) {
      return sendJson(res, 502, { error: 'The rewriter returned nothing — try again.', kind: 'api' })
    }
    sendJson(res, 200, { text: cleaned })
  } catch (error) {
    sendJson(res, error.status ?? 500, {
      error: error.message ?? 'Paraphrasing failed.',
      kind: error.kind ?? 'api',
    })
  }
}
