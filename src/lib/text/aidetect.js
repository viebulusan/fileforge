// Heuristic AI-text estimator. Runs fully in the browser.
// It measures statistical "tells" of machine-written prose — it is an
// estimate, not a verdict, and the UI says so.

const AI_CLICHES = [
  'in today\'s fast-paced world',
  'in the ever-evolving landscape',
  'it is important to note',
  'it is worth noting',
  'plays a crucial role',
  'plays a vital role',
  'plays a significant role',
  'delve into',
  'navigating the complexities',
  'a testament to',
  'in conclusion',
  'furthermore',
  'moreover',
  'additionally',
  'seamlessly integrate',
  'unlock the potential',
  'harness the power',
  'in the realm of',
  'embark on a journey',
  'tapestry',
  'multifaceted',
  'paradigm shift',
  'robust framework',
  'cutting-edge',
  'revolutionize',
  'game-changer',
  'when it comes to',
  'at the end of the day',
  'in the world of',
  'underscores the importance',
  'foster a sense of',
  'pave the way for',
  'it is essential to',
  'shaping the future',
]

function sentences(text) {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z"''(])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function mean(values) {
  if (values.length === 0) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

function stdev(values) {
  if (values.length < 2) return 0
  const m = mean(values)
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)))
}

export function analyzeText(text) {
  const words = text.match(/\S+/g) ?? []
  const wordCount = words.length
  const sents = sentences(text)
  const sentLengths = sents.map((s) => (s.match(/\S+/g) ?? []).length)

  const avgSentence = mean(sentLengths)
  const sentenceStdev = stdev(sentLengths)
  // Burstiness: human prose swings between short and long sentences;
  // machine prose is eerily uniform. 0 → uniform, ~1+ → varied.
  const burstiness = avgSentence > 0 ? Math.min(sentenceStdev / avgSentence, 1.5) : 0

  const lower = text.toLowerCase()
  const clicheHits = AI_CLICHES.filter((phrase) => lower.includes(phrase))

  const uniqueWords = new Set(words.map((w) => w.toLowerCase().replace(/[^\w'’-]/g, '')))
  const ttr = wordCount > 0 ? uniqueWords.size / wordCount : 0

  const commasPerSentence =
    sents.length > 0
      ? (text.match(/,/g) ?? []).length / sents.length
      : 0

  const emDashCount = (text.match(/—|--/g) ?? []).length
  const emDashDensity = wordCount > 0 ? emDashCount / wordCount * 1000 : 0

  // --- scoring: each signal votes 0..1 towards "AI" ---
  const fewBreaks = wordCount >= 50 && sents.length <= 2
  const uniformityVote = fewBreaks || avgSentence === 0
    ? 0.5 // can't judge rhythm without breaks — neutral, don't punish blindly
    : Math.max(0, 1 - burstiness / 0.55) // low burstiness → AI-ish
  const lengthVote = avgSentence >= 14 && avgSentence <= 26 ? 0.8 : avgSentence > 30 || avgSentence < 8 ? 0.15 : 0.45
  const clicheVote = Math.min(1, clicheHits.length / 4)
  const polishVote = commasPerSentence > 1.1 ? 0.7 : 0.35 // tidy comma rhythm reads machine-y
  const dashVote = Math.min(1, emDashDensity / 6) // LLMs love em-dashes
  const repetitionVote = ttr > 0 && ttr < 0.42 ? 0.65 : 0.25 // very repetitive → template-like

  const score = Math.round(
    100 *
      (uniformityVote * 0.3 +
        lengthVote * 0.16 +
        clicheVote * 0.22 +
        polishVote * 0.08 +
        dashVote * 0.12 +
        repetitionVote * 0.12),
  )

  const reasons = []
  if (fewBreaks) {
    reasons.push('long stretch with almost no sentence breaks')
  } else if (uniformityVote > 0.5) {
    reasons.push('sentence lengths are unusually uniform')
  } else if (burstiness > 0.75) {
    reasons.push('sentence lengths vary a lot — a human tell')
  }
  if (clicheHits.length > 0) {
    reasons.push(`stock AI phrases found (${clicheHits.slice(0, 3).join(', ')})`)
  }
  if (dashVote > 0.5) reasons.push('heavy em-dash usage')
  if (repetitionVote > 0.5) reasons.push('limited vocabulary variety')

  // Short samples are statistically noisy — say so instead of pretending.
  const confidence =
    wordCount >= 140 ? 'high' : wordCount >= 40 ? 'medium' : 'low'

  let band
  if (score >= 70) band = { label: 'Likely AI-generated', tone: 'high' }
  else if (score >= 40) band = { label: 'Mixed signals', tone: 'mid' }
  else band = { label: 'Likely human-written', tone: 'low' }

  return {
    score,
    band,
    confidence,
    reasons,
    stats: {
      wordCount,
      sentenceCount: sents.length,
      avgSentence: Math.round(avgSentence * 10) / 10,
      burstiness: Math.round(burstiness * 100) / 100,
      vocabulary: Math.round(ttr * 100),
    },
  }
}
