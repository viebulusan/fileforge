import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useSession } from '../lib/auth-client.js'
import { countWords, paraphrase, diffPercent } from '../lib/text/paraphrase.js'
import { analyzeText } from '../lib/text/aidetect.js'
import { splitSentences } from '../lib/text/originality.js'
import { aiDetect, aiParaphrase } from '../lib/text/api.js'
import { UNLOCK_ALL } from '../lib/testing.js'

const FREE_WORD_LIMIT = 250

const TOOLS = [
  { id: 'paraphrase', label: 'Paraphrase' },
  { id: 'detect', label: 'AI scan' },
  { id: 'originality', label: 'Originality' },
]

function WordMeter({ words, limit }) {
  const capped = limit != null
  const over = capped && words > limit
  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
      <p
        className={`font-mono text-xs ${over ? 'text-red-400' : 'text-ink-faint'}`}
        aria-live="polite"
      >
        {words.toLocaleString()}
        {capped ? ` / ${limit.toLocaleString()} words` : ' words · unlimited'}
      </p>
      {over && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-red-400">
          <span role="alert">
            free plan covers {limit} words — this is {words - limit} over
          </span>
          <Link
            to="/pricing"
            className="border-b border-red-400/60 pb-0.5 uppercase tracking-[0.12em] transition hover:text-copper-deep hover:border-copper"
          >
            go pro for unlimited
          </Link>
        </p>
      )}
    </div>
  )
}

function Editor({ value, onChange, limit, placeholder }) {
  const words = countWords(value)
  return (
    <div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={9}
        placeholder={placeholder}
        spellCheck="false"
        className="w-full resize-y border border-line-strong bg-paper-raised px-4 py-3 font-mono text-sm leading-relaxed outline-none transition placeholder:text-ink-faint focus:border-copper"
        aria-label="Text to analyse"
      />
      <WordMeter words={words} limit={limit} />
    </div>
  )
}

function EngineBadge({ source }) {
  const deep = source === 'model'
  return (
    <span
      className={`border px-2.5 py-1 font-mono text-[0.66rem] uppercase tracking-[0.14em] ${
        deep
          ? 'border-copper/50 bg-copper-wash text-copper-deep'
          : 'border-line-strong text-ink-faint'
      }`}
    >
      {deep ? 'deep analysis' : 'quick estimate'}
    </span>
  )
}

function ParaphraseTool({ limit }) {
  const [input, setInput] = useState('')
  const [output, setOutput] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const blocked = limit != null && countWords(input) > limit

  async function run(variant = 0) {
    if (blocked || busy || countWords(input) === 0) return
    setBusy(true)
    setError('')
    try {
      try {
        const data = await aiParaphrase(input, variant)
        setOutput({
          text: data.text,
          changedPercent: diffPercent(input, data.text),
          source: 'model',
        })
        return
      } catch (err) {
        // Bad key / quota exhaustion must be visible — silently rewriting with
        // the offline engine would hide a real problem.
        if (err.kind === 'auth') throw err
        // no key configured, network hiccup, upstream glitch → offline engine
      }
      setOutput({ ...paraphrase(input), source: 'quick' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Paraphrasing failed.')
      setOutput(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-6 space-y-5">
      <Editor
        value={input}
        onChange={(text) => {
          setInput(text)
          setOutput(null)
        }}
        limit={limit}
        placeholder="Paste the text you want reworded — everything stays on this device."
      />
      <button
        type="button"
        onClick={() => void run(Math.floor(Math.random() * 1e6))}
        disabled={blocked || busy || countWords(input) === 0}
        className="bg-copper px-7 py-3 font-mono text-xs font-bold uppercase tracking-[0.18em] text-paper transition hover:bg-ink disabled:opacity-40"
      >
        {busy ? 'Rewriting…' : 'Rephrase'}
      </button>

      {error && (
        <p role="alert" className="border border-red-900/60 bg-red-950/30 px-4 py-3 font-mono text-xs text-red-400">
          {error}
        </p>
      )}

      {output && (
        <section aria-label="Paraphrased result" className="border border-copper/50 bg-paper-raised p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h3 className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-copper">
              result
            </h3>
            <div className="flex items-center gap-3">
              <p className="font-mono text-xs text-ink-faint">
                ~{output.changedPercent}% of words changed
              </p>
              <EngineBadge source={output.source} />
            </div>
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink">
            {output.text}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void run(Math.floor(Math.random() * 1e6) + 1)}
              className="border border-line-strong px-4 py-2 font-mono text-xs uppercase tracking-[0.14em] transition hover:border-copper hover:text-copper"
            >
              Try another variant
            </button>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(output.text)}
              className="border border-line-strong px-4 py-2 font-mono text-xs uppercase tracking-[0.14em] transition hover:border-copper hover:text-copper"
            >
              Copy
            </button>
          </div>
        </section>
      )}
    </div>
  )
}

const AUTO_SCAN_WORDS = 20
const MANUAL_SCAN_WORDS = 8

// Binary verdict per sentence — built for academic screening: red means the
// sentence reads as machine-generated, green means it reads as human-written.
function bandFor(score) {
  return score >= 50 ? 'ai' : 'human'
}

const BAND_STYLE = {
  ai: 'bg-red-500/20 text-red-200 decoration-red-400/70 decoration-2 underline underline-offset-4 rounded-sm',
  human: 'bg-emerald-500/15 text-emerald-100 decoration-emerald-400/60 decoration-2 underline underline-offset-4 rounded-sm',
}

function normKey(sentence) {
  return sentence.toLowerCase().replace(/[^\w]+/g, ' ').trim().slice(0, 60)
}

/** Map model sentences onto the locally-split ones so highlighting always
 *  lines up with exactly what the user pasted. */
function alignScores(localSentences, modelSentences) {
  const byKey = new Map()
  for (const item of modelSentences) {
    const key = normKey(item.text)
    if (key && !byKey.has(key)) byKey.set(key, item)
  }
  return localSentences.map((sentence, index) => {
    const direct = byKey.get(normKey(sentence))
    if (direct) {
      return { score: direct.score, note: direct.note }
    }
    const fallback = modelSentences[index]
    if (
      fallback &&
      normKey(fallback.text).slice(0, 24) === normKey(sentence).slice(0, 24)
    ) {
      return { score: fallback.score, note: fallback.note }
    }
    return { score: null, note: '' }
  })
}

function localDetect(text) {
  const sentences = splitSentences(text)
  const whole = analyzeText(text)
  const wordCount = whole.stats.wordCount
  let weightedSum = 0
  let weightTotal = 0

  const scored = sentences.map((sentence) => {
    const words = countWords(sentence)
    const report = analyzeText(sentence)
    // Blend the sentence reading toward the whole-text reading — single short
    // sentences alone produce wild numbers.
    const score =
      words > 0
        ? Math.round((report.score * 0.7 + whole.score * 0.3))
        : 0
    weightedSum += score * words
    weightTotal += words
    return {
      text: sentence,
      score,
      note: report.reasons[0] ?? '',
    }
  })

  return {
    source: 'quick',
    sentences,
    scores: scored.map((item) => ({ ...item })),
    overall: {
      score: weightTotal > 0 ? Math.round(weightedSum / weightTotal) : whole.score,
      confidence: wordCount >= 140 ? 'high' : wordCount >= 40 ? 'medium' : 'low',
      summary:
        'Quick on-device estimate. For university-grade screening use the deep analysis engine (configured server-side).',
    },
  }
}

function DetectTool({ limit }) {
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const seqRef = useRef(0)
  // Latest input, readable from the async pipeline — a scan must never attach
  // its results to text the user has already changed.
  const inputRef = useRef('')
  // One-shot gate: auto-scan fires once per paste; further scans are manual.
  // Without it every keystroke past the threshold would burn an API call.
  const autoRanRef = useRef(false)
  const words = countWords(input)
  const blocked = limit != null && countWords(input) > limit

  async function run() {
    if (blocked || busy || words < MANUAL_SCAN_WORDS) return
    const current = input
    inputRef.current = current
    const seq = ++seqRef.current
    setBusy(true)
    setError('')
    try {
      let data
      try {
        data = await aiDetect(current)
        data = {
          source: 'model',
          overall: data.overall,
          aligned: alignScores(splitSentences(current), data.sentences),
        }
      } catch (err) {
        // A bad key or exhausted quota must be visible — falling back offline
        // would silently hide a real problem.
        if (err.kind === 'auth') throw err
        data = null
      }
      if (!data) data = localDetect(current)
      if (seqRef.current !== seq || inputRef.current !== current) return
      setResult(data)
    } catch (err) {
      if (seqRef.current !== seq || inputRef.current !== current) return
      setError(err instanceof Error ? err.message : 'AI scan failed.')
      setResult(null)
    } finally {
      // Reset busy whenever this run is still the latest one — drift (edited
      // text) must discard the result, but never leave the button stuck.
      if (seqRef.current === seq) setBusy(false)
    }
  }

  // Auto-run once, when enough text accumulates (e.g. right after a paste).
  useEffect(() => {
    if (!autoRanRef.current && !blocked && !busy && !result && words >= AUTO_SCAN_WORDS) {
      autoRanRef.current = true
      void run()
    }
    if (words === 0) autoRanRef.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input])

  const flagged = useMemo(() => {
    if (!result) return []
    const entries =
      result.source === 'model'
        ? splitSentences(input).map((text, index) => ({
            text,
            score: result.aligned[index]?.score,
            note: result.aligned[index]?.note ?? '',
          }))
        : result.scores.map((item) => ({ ...item }))
    return entries
      .filter((item) => item.score != null && item.score >= 50)
      .sort((a, b) => b.score - a.score)
  }, [result, input])

  return (
    <div className="mt-6 space-y-5">
      <Editor
        value={input}
        onChange={(text) => {
          inputRef.current = text
          setInput(text)
          setResult(null)
        }}
        limit={limit}
        placeholder="Paste at least a paragraph — every sentence gets its own AI-likelihood reading."
      />

      <button
        type="button"
        onClick={() => {
          autoRanRef.current = true
          void run()
        }}
        disabled={blocked || busy || words < MANUAL_SCAN_WORDS}
        className="bg-copper px-7 py-3 font-mono text-xs font-bold uppercase tracking-[0.18em] text-paper transition hover:bg-ink disabled:opacity-40"
      >
        {busy ? 'Scanning…' : 'Run AI scan'}
      </button>

      {words > 0 && words < MANUAL_SCAN_WORDS && (
        <p className="font-mono text-xs text-ink-faint" aria-live="polite">
          add at least ~{MANUAL_SCAN_WORDS} words for a reading — the estimate sharpens with length.
        </p>
      )}

      {error && (
        <p role="alert" className="border border-red-900/60 bg-red-950/30 px-4 py-3 font-mono text-xs leading-relaxed text-red-400">
          {error}
        </p>
      )}

      {result && (() => {
        const sentences = result.source === 'model'
          ? splitSentences(input)
          : result.sentences
        const readings = result.source === 'model'
          ? result.aligned
          : result.scores
        return (
        <section aria-label="AI detection report" className="space-y-4">
          <div className="border border-line bg-paper-raised p-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h3 className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-ink-faint">
                  verdict
                </h3>
                <p
                  className={`mt-1 text-xl font-bold uppercase tracking-[0.04em] ${
                    result.overall.score >= 70
                      ? 'text-red-400'
                      : result.overall.score >= 40
                        ? 'text-copper'
                        : 'text-emerald-400'
                  }`}
                >
                  {result.overall.score >= 70
                    ? 'Likely AI-generated'
                    : result.overall.score >= 40
                      ? 'Mixed signals'
                      : 'Likely human-written'}
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-3xl font-bold tracking-tight text-copper">
                  {result.overall.score}
                  <span className="text-sm text-ink-faint">/100 AI-ish</span>
                </p>
                <p className="mt-1 font-mono text-[0.66rem] uppercase tracking-[0.14em] text-ink-faint">
                  signal strength: {result.overall.confidence}
                </p>
              </div>
            </div>

            {result.overall.summary && (
              <p className="mt-4 border-t border-line pt-3 text-sm leading-relaxed text-ink-soft">
                {result.overall.summary}
              </p>
            )}

            <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[0.66rem] uppercase tracking-[0.12em] text-ink-faint">
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true" className="size-2.5 rounded-sm bg-red-400/80" /> highlighted red = reads AI-generated (≥50)
              </span>
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true" className="size-2.5 rounded-sm bg-emerald-400/60" /> highlighted green = reads human-made (&lt;50)
              </span>
              <EngineBadge source={result.source} />
            </p>
          </div>

          <div className="border border-line bg-paper-raised p-5">
            <h3 className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-ink-faint">
              your text, sentence by sentence
            </h3>
            <p className="mt-3 text-sm leading-loose text-ink">
              {sentences.map((sentence, index) => {
                const reading = readings[index]
                const band = reading?.score == null ? null : bandFor(reading.score)
                return (
                  <span
                    key={index}
                    title={reading?.note || undefined}
                    className={band ? `rounded-sm px-0.5 ${BAND_STYLE[band]}` : undefined}
                  >
                    {sentence}{' '}
                  </span>
                )
              })}
            </p>
          </div>

          {flagged.length > 0 && (
            <ul className="space-y-2">
              {flagged.map((item, index) => (
                <li key={index} className="rounded-sm border border-line bg-paper-raised px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span
                      className={`font-mono text-[0.66rem] font-bold uppercase tracking-[0.14em] ${
                        item.score >= 65 ? 'text-red-400' : 'text-amber-300'
                      }`}
                    >
                      {item.score}% AI-likelihood
                    </span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-ink">“{item.text}”</p>
                  {item.note && (
                    <p className="mt-1 font-mono text-xs leading-relaxed text-ink-soft">{item.note}</p>
                  )}
                </li>
              ))}
            </ul>
          )}

          <p className="border-t border-line pt-3 font-mono text-[0.66rem] leading-relaxed text-ink-faint">
            heuristic/model estimate — no detector is proof. use it as a signal for further
            investigation, never as sole evidence.
          </p>
        </section>
        )
      })()}
    </div>
  )
}

function OriginalityTool({ limit }) {
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const blocked = limit != null && countWords(input) > limit

  async function run() {
    if (busy || countWords(input) === 0) return
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const res = await fetch('/api/text/originality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: input }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `Check failed (${res.status}).`)
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Originality check failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-6 space-y-5">
      <Editor
        value={input}
        onChange={(text) => {
          setInput(text)
          setResult(null)
        }}
        limit={limit}
        placeholder="Paste your draft — we spot-check its most distinctive sentences against the open web."
      />
      <button
        type="button"
        onClick={() => void run()}
        disabled={blocked || busy || countWords(input) === 0}
        className="bg-copper px-7 py-3 font-mono text-xs font-bold uppercase tracking-[0.18em] text-paper transition hover:bg-ink disabled:opacity-40"
      >
        {busy ? 'Checking the open web…' : 'Check originality'}
      </button>

      {error && (
        <p role="alert" className="border border-red-900/60 bg-red-950/30 px-4 py-3 font-mono text-xs text-red-400">
          {error}
        </p>
      )}

      {result && (
        <section aria-label="Originality report" className="border border-line bg-paper-raised p-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h3 className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-ink-faint">
                originality
              </h3>
              <p
                className={`mt-1 text-xl font-bold uppercase tracking-[0.04em] ${
                  result.originalPercent >= 80
                    ? 'text-emerald-400'
                    : result.originalPercent >= 50
                      ? 'text-copper'
                      : 'text-red-400'
                }`}
              >
                {result.originalPercent}% original
              </p>
            </div>
            <p className="font-mono text-xs text-ink-faint">
              {result.checkedCount} sentence{result.checkedCount === 1 ? '' : 's'} checked on the web
              {result.failedCount > 0 && ` · ${result.failedCount} skipped`}
            </p>
          </div>

          {result.flagged.length > 0 && (
            <div className="mt-5">
              <p className="font-mono text-xs uppercase tracking-[0.14em] text-red-400">
                exact matches found ({result.flagged.length})
              </p>
              <ul className="mt-3 space-y-3">
                {result.flagged.map((item) => (
                  <li key={item.phrase} className="rounded-sm border border-line bg-paper px-4 py-3">
                    <p className="text-sm leading-relaxed text-ink">“{item.phrase}”</p>
                    <a
                      href={item.searchUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block border-b border-line-strong pb-0.5 font-mono text-xs text-ink-faint transition hover:text-copper-deep hover:border-copper"
                    >
                      {item.hits} match{item.hits === 1 ? '' : 'es'} · see them
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.flagged.length === 0 && (
            <p className="mt-4 font-mono text-xs leading-relaxed text-emerald-400">
              none of the checked sentences matched anything on the open web.
            </p>
          )}
        </section>
      )}
    </div>
  )
}

export default function Tools() {
  const { data: session } = useSession()
  const plan = session?.user?.plan ?? 'free'
  const isPro = plan === 'pro' || UNLOCK_ALL
  const limit = isPro ? null : FREE_WORD_LIMIT
  const [tool, setTool] = useState('paraphrase')

  return (
    <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
      <p className="flex items-center gap-3 font-mono text-xs font-medium uppercase tracking-[0.25em] text-ink-faint">
        <span className="font-bold normal-case text-copper">//</span>
        write smarter, stay human
      </p>
      <h1 className="mt-4 text-4xl font-bold uppercase tracking-[-0.02em]">
        Writing tools
      </h1>
      <p className="mt-2 font-mono text-xs text-ink-faint">
        paraphrase · ai scan · originality — everything runs or checks locally first
        {!isPro && ` · free: ${FREE_WORD_LIMIT} words per run`}
      </p>

      <div role="tablist" aria-label="Writing tools" className="mt-8 flex flex-wrap gap-2">
        {TOOLS.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={tool === item.id}
            onClick={() => setTool(item.id)}
            className={`border px-5 py-2.5 font-mono text-xs uppercase tracking-[0.14em] transition ${
              tool === item.id
                ? 'border-copper bg-copper-wash text-copper-deep'
                : 'border-line-strong text-ink-soft hover:border-copper/60'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tool === 'paraphrase' && <ParaphraseTool limit={limit} key="para" />}
      {tool === 'detect' && <DetectTool limit={limit} key="detect" />}
      {tool === 'originality' && <OriginalityTool limit={limit} key="orig" />}

      {!isPro && (
        <p className="mt-10 rounded-sm border border-line bg-paper-raised px-4 py-3 text-center font-mono text-xs leading-relaxed text-ink-faint">
          need longer runs?{' '}
          <Link
            to="/pricing"
            className="border-b border-line-strong pb-0.5 transition hover:text-copper-deep hover:border-copper"
          >
            pro removes the word cap for good — $7 once
          </Link>
        </p>
      )}
    </div>
  )
}
