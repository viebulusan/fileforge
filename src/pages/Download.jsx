import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useSession } from '../lib/auth-client.js'
import { downloadAndMux, downloadAsMp3 } from '../lib/converters/mux.js'
import { UNLOCK_ALL } from '../lib/testing.js'
import { companionBase, setCompanionBase } from '../lib/companion.js'
import { DOWNLOADS_COMING_SOON } from '../lib/features.js'

const FREE_DOWNLOADS = 3

// Desktop companion when connected, otherwise the hosted best-effort API.
const infoUrl = () => (companionBase() ? `${companionBase()}/api/info` : '/api/download/info')
const fileUrl = () => (companionBase() ? `${companionBase()}/api/download` : '/api/download/file')

function sanitizeFilename(name) {
  return String(name ?? 'video').replace(/[^\w .-]+/g, '_').slice(0, 120) || 'video'
}

const STAGE_LABEL = { video: 'downloading video', audio: 'downloading audio', merging: 'merging HD video + audio', converting: 'converting to mp3', saving: 'saving' }

/** Connect your own machine as the download engine. The companion runs yt-dlp
 *  on your connection — full quality, every site, no cloud-IP blocks. A free
 *  tunnel makes it reachable from any device, phone included. */
function CompanionPanel() {
  const [open, setOpen] = useState(false)
  const [connected, setConnected] = useState(() => Boolean(companionBase()))
  const [value, setValue] = useState('')
  const [error, setError] = useState('')

  async function connect() {
    const trimmed = value.trim().replace(/\/+$/, '')
    if (!trimmed) return
    setError('')
    try {
      const res = await fetch(`${trimmed}/api/health`, { signal: AbortSignal.timeout(8000) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.ok) throw new Error('not a FileForge companion')
      setCompanionBase(trimmed)
      setConnected(true)
      setValue('')
    } catch {
      setError('Could not reach a companion there — check the URL and that it is running.')
    }
  }

  function disconnect() {
    setCompanionBase(null)
    setConnected(false)
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-2 font-mono text-[0.68rem] uppercase tracking-[0.14em] text-ink-faint transition hover:text-copper"
      >
        <span aria-hidden="true" className={`text-copper transition-transform duration-200 ${open ? 'rotate-45' : ''}`}>+</span>
        {connected ? 'companion connected — full quality active' : 'connect your device for full quality (optional)'}
      </button>
      {open && (
        <div className="mt-3 rounded-sm border border-line bg-paper-raised p-4">
          {connected ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-mono text-xs leading-relaxed text-ink-soft">
                downloads route through <span className="text-copper">{companionBase()}</span> — your connection, every site, full quality.
              </p>
              <button
                type="button"
                onClick={disconnect}
                className="border border-line-strong px-3 py-1.5 font-mono text-[0.68rem] uppercase tracking-[0.14em] text-ink-soft transition hover:border-copper hover:text-copper"
              >
                disconnect
              </button>
            </div>
          ) : (
            <>
              <ol className="space-y-1 font-mono text-[0.68rem] leading-relaxed text-ink-faint">
                <li>1. on your computer (project folder): <code className="text-copper">cd downloader && node server.mjs</code></li>
                <li>2. expose it: <code className="text-copper">cloudflared tunnel --url http://localhost:8787</code> — copy the https URL it prints</li>
                <li>3. paste that URL below — this device (and your phone) will download through your computer</li>
              </ol>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  type="url"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  placeholder="https://your-tunnel.trycloudflare.com"
                  spellCheck="false"
                  className="min-w-0 flex-1 border border-line-strong bg-paper px-3 py-2 font-mono text-xs outline-none transition placeholder:text-ink-faint focus:border-copper"
                  aria-label="Companion URL"
                />
                <button
                  type="button"
                  onClick={() => void connect()}
                  className="bg-copper px-5 py-2 font-mono text-[0.68rem] font-bold uppercase tracking-[0.14em] text-paper transition hover:bg-ink"
                >
                  Connect
                </button>
              </div>
              {error && <p role="alert" className="mt-2 font-mono text-[0.68rem] text-red-400">{error}</p>}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return null
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.round(seconds % 60)
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let message = `Request failed (${res.status})`
    try {
      const data = await res.json()
      if (data?.error) message = data.error
    } catch {}
    throw new Error(message)
  }
  return res
}

/**
 * Downloads are free with a per-account allowance (5); Pro/testing removes the
 * cap. Mirrors Documents' DocsAccess — server keeps the count, not the client.
 */
function DownloadAccess({ children }) {
  const { data: session, isPending } = useSession()
  const user = session?.user
  const [remaining, setRemaining] = useState(null)
  const [exceeded, setExceeded] = useState(false)
  // Flips once the allowance fetch settles for the signed-in user. Until then
  // we render a skeleton — otherwise a used-up account gets a window to start
  // downloads before the limit card appears.
  const [usageResolved, setUsageResolved] = useState(false)

  useEffect(() => {
    if (UNLOCK_ALL || isPending || !user) return
    let alive = true
    fetch('/api/usage')
      .then((res) => res.json())
      .then((data) => {
        if (!alive) return
        if (data?.testing || data?.plan === 'pro') {
          setRemaining(null)
          setExceeded(false)
        } else if (typeof data?.limits?.download === 'number') {
          const left = Math.max(0, data.limits.download - (data.used?.download ?? 0))
          setRemaining(left)
          setExceeded(left === 0)
        }
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setUsageResolved(true)
      })
    return () => {
      alive = false
    }
  }, [isPending, user])

  const ready =
    UNLOCK_ALL || !user || usageResolved

  // Counted after a successful download so a failed transfer never burns one.
  async function recordUse() {
    const res = await fetch('/api/usage/bump', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'download' }),
    })
    if (res.status === 402) {
      setRemaining(0)
      setExceeded(true)
      return false
    }
    setRemaining((prev) => (prev == null ? prev : Math.max(0, prev - 1)))
    return true
  }

  if (UNLOCK_ALL) return children({})
  if (isPending || !ready) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
        <div className="mt-10 h-24 animate-pulse rounded-sm border border-line bg-paper-raised" />
      </div>
    )
  }
  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
        <div className="mt-10 rounded-sm border border-line bg-paper-raised p-8 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-ink-faint">
            free tier
          </p>
          <h2 className="mt-3 text-xl font-bold uppercase tracking-[0.04em]">
            Sign in to download videos
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-soft">
            Every account gets {FREE_DOWNLOADS} free downloads — no payment, no
            card. Sign in so we can keep count.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              to="/login"
              className="bg-copper px-6 py-2.5 font-mono text-xs font-bold uppercase tracking-[0.14em] text-paper transition hover:bg-ink"
            >
              Sign in
            </Link>
            <Link
              to="/signup"
              className="border border-line-strong px-6 py-2.5 font-mono text-xs font-bold uppercase tracking-[0.14em] transition hover:border-copper hover:text-copper"
            >
              Create account
            </Link>
          </div>
        </div>
      </div>
    )
  }
  if (exceeded) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
        <div className="mt-10 rounded-sm border border-copper/60 bg-paper-raised p-8 text-center shadow-[0_0_80px_-32px_rgb(217_255_61/25%)]">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-copper">
            free downloads used up
          </p>
          <h2 className="mt-3 text-xl font-bold uppercase tracking-[0.04em]">
            You've used your {FREE_DOWNLOADS} free downloads
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-soft">
            Pro unlocks unlimited video and audio downloads from thousands of
            sites for a single $7 payment — no subscription.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              to="/pricing"
              className="bg-copper px-6 py-2.5 font-mono text-xs font-bold uppercase tracking-[0.14em] text-paper transition hover:bg-ink"
            >
              Get Pro — $7 once
            </Link>
            <Link
              to="/convert"
              className="self-center border-b border-line-strong pb-0.5 font-mono text-xs uppercase tracking-[0.14em] text-ink-faint transition hover:border-copper hover:text-copper-deep"
            >
              keep using the free tools
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return children({ remaining, recordUse })
}

function ComingSoon() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
      <p className="flex items-center gap-3 font-mono text-xs font-medium uppercase tracking-[0.25em] text-ink-faint">
        <span className="font-bold text-copper normal-case">//</span>
        paste a link · pull it down
      </p>
      <div className="mt-10 rounded-sm border border-copper/60 bg-paper-raised p-8 text-center shadow-[0_0_80px_-32px_rgb(217_255_61/25%)]">
        <p className="inline-block border border-copper/50 bg-copper-wash px-3 py-1 font-mono text-[0.68rem] font-bold uppercase tracking-[0.18em] text-copper">
          coming soon
        </p>
        <h2 className="mt-4 text-xl font-bold uppercase tracking-[0.04em]">
          Video downloads are almost here
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-soft">
          We're putting the finishing touches on the downloader — mp4 up to 4K
          and mp3, from YouTube and thousands of other sites. Check back very
          shortly.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            to="/convert"
            className="bg-copper px-6 py-2.5 font-mono text-xs font-bold uppercase tracking-[0.14em] text-paper transition hover:bg-ink"
          >
            Try the converter meanwhile
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function Download() {
  if (DOWNLOADS_COMING_SOON) return <ComingSoon />
  return <DownloadTool />
}

function DownloadTool() {
  const [url, setUrl] = useState('')
  const [info, setInfo] = useState(null)
  const [probing, setProbing] = useState(false)
  const [quality, setQuality] = useState(null)
  const [audioOnly, setAudioOnly] = useState(false)
  const [busy, setBusy] = useState(false)
  const [ratio, setRatio] = useState(null)
  const [stage, setStage] = useState(null) // downloading video | audio | merging
  const [error, setError] = useState('')
  const resultRef = useRef(null)

  async function probe(event) {
    event.preventDefault()
    if (!url.trim() || probing || busy) return
    setProbing(true)
    setError('')
    setInfo(null)
    setQuality(null)
    try {
      const res = await post(infoUrl(), { url: url.trim() })
      let data = await res.json()
      // YouTube sometimes refuses the server's player API but still serves
      // basic metadata (oEmbed). Retry twice for the full quality list.
      for (let attempt = 0; attempt < 2 && data?.metadataOnly; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 3000))
        try {
          const retry = await post(infoUrl(), { url: url.trim() })
          const retryData = await retry.json()
          if (!retryData?.metadataOnly && !retryData?.error) data = retryData
        } catch {}
      }
      setInfo(data)
      setQuality(data.qualities[0]?.id ?? null)
      if (data?.metadataOnly) {
        setError(
          'Found the video, but YouTube is withholding stream quality info from our server right now — audio may still download. For the full quality list (up to 4K), connect a downloader companion (see the note below).',
        )
      }
      requestAnimationFrame(() =>
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that link')
    } finally {
      setProbing(false)
    }
  }

  async function startDownload(recordUse, remaining) {
    if (!info || busy) return
    // Belt-and-braces: never start when the allowance is visibly spent.
    if (remaining != null && remaining <= 0) return
    setBusy(true)
    setError('')

    const chosen = info.qualities.find((q) => q.id === quality)
    const needsMux = !audioOnly && chosen?.videoOnly === true
    const container = chosen?.container === 'webm' ? 'webm' : 'mp4'

    try {
      let blob
      let name = sanitizeFilename(info.title) + (audioOnly ? '.mp3' : '.mp4')

      if (needsMux) {
        // High quality: video-only stream + best audio, merged in-browser.
        const bestAudioId = info.audioItag ?? info.qualities.find((q) => q.audio)?.id ?? 'a-auto'
        blob = await downloadAndMux(
          [
            {
              url: fileUrl(),
              body: { url: url.trim(), quality: chosen.id, part: 'video' },
              type: chosen.container === 'webm' ? 'video/webm' : 'video/mp4',
              stage: 'video',
            },
            {
              url: fileUrl(),
              body: { url: url.trim(), quality: bestAudioId, part: 'audio' },
              type: 'audio/mp4',
              stage: 'audio',
            },
          ],
          (stageName, fraction) => {
            setStage(stageName)
            setRatio(fraction > 0 ? fraction : null)
          },
          container,
        )
        name = sanitizeFilename(info.title) + (container === 'webm' ? '.webm' : '.mp4')
      } else if (audioOnly && !companionBase()) {
        // Hosted audio: real MP3, converted in the browser after the fetch.
        const audioQuality = quality?.startsWith('a-') ? quality : info.qualities.find((q) => q.audio)?.id
        blob = await downloadAsMp3(
          {
            url: fileUrl(),
            body: { url: url.trim(), quality: audioQuality, part: 'audio' },
            type: 'audio/mp4',
            stage: 'audio',
          },
          (stageName, fraction) => {
            setStage(stageName)
            setRatio(fraction > 0 ? fraction : null)
          },
        )
        // Parts don't consume server-side — record the single use here.
        if (recordUse) await recordUse()
      } else {
        setStage(audioOnly ? 'audio' : 'video')
        const res = await post(fileUrl(), {
          url: url.trim(),
          quality,
          audioOnly,
        })
        const total = Number(res.headers.get('content-length')) || 0
        name =
          decodeURIComponent(res.headers.get('x-download-name') ?? '') || name
        const reader = res.body.getReader()
        const chunks = []
        let received = 0
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          chunks.push(value)
          received += value.length
          setRatio(total > 0 ? received / total : null)
        }
        blob = new Blob(chunks, { type: audioOnly ? 'audio/mpeg' : 'video/mp4' })
      }

      setStage('saving')
      const href = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = href
      anchor.download = name
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(href), 10000)
      // Hosted mode counts server-side; the companion relies on the client bump.
      if (recordUse && companionBase()) await recordUse()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed')
    } finally {
      setBusy(false)
      setRatio(null)
      setStage(null)
    }
  }

  const pct = ratio != null ? Math.min(100, Math.round(ratio * 100)) : null

  return (
    <DownloadAccess>
      {({ remaining, recordUse }) => (
      <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
      <p className="flex items-center gap-3 font-mono text-xs font-medium uppercase tracking-[0.25em] text-ink-faint">
        <span className="font-bold text-copper normal-case">//</span>
        paste a link · pull it down
      </p>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-4xl font-bold uppercase tracking-[-0.02em]">
          Download
        </h1>
        {remaining != null && (
          <p className="font-mono text-xs text-ink-faint" aria-live="polite">
            free downloads left: <span className="text-copper">{remaining}</span>
            {' · '}
            <Link to="/pricing" className="border-b border-line-strong pb-0.5 transition hover:border-copper hover:text-copper">
              go pro for unlimited
            </Link>
          </p>
        )}
      </div>
      <p className="mt-2 font-mono text-xs text-ink-faint">
        youtube · facebook · instagram · thousands more sources
      </p>

      <form onSubmit={probe} className="mt-8 flex flex-col gap-3 sm:flex-row">
        <input
          type="url"
          required
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://www.youtube.com/watch?v=…"
          spellCheck="false"
          className="min-w-0 flex-1 border border-line-strong bg-paper-raised px-4 py-3 font-mono text-sm outline-none transition placeholder:text-ink-faint focus:border-copper"
          aria-label="Video link"
        />
        <button
          type="submit"
          disabled={probing || busy}
          className="bg-copper px-6 py-3 font-mono text-xs font-bold uppercase tracking-[0.18em] text-paper transition hover:bg-ink disabled:opacity-40"
        >
          {probing ? 'Reading…' : 'Fetch'}
        </button>
      </form>

      <CompanionPanel />

      {error && (
        <div role="alert" className="mt-4 border border-red-900/60 bg-red-950/30 px-4 py-3">
          <p className="font-mono text-xs leading-relaxed text-red-400">{error}</p>
          <details className="mt-2">
            <summary className="cursor-pointer font-mono text-[0.68rem] uppercase tracking-[0.14em] text-ink-faint transition hover:text-copper">
              how to get the full quality list
            </summary>
            <div className="mt-2 space-y-2 font-mono text-[0.68rem] leading-relaxed text-ink-soft">
              <p>
                <span className="text-copper">host a companion (recommended)</span> — deploy the
                project's <code>downloader/</code> folder to Render (free): Render dashboard →
                New → Blueprint → your repo. It reads <code>downloader/render.yaml</code>. Then set{' '}
                <code>VITE_DOWNLOADER_URL</code> in Vercel to your <code>*.onrender.com</code> URL
                and redeploy. Runs yt-dlp, which keeps up with YouTube — full quality for everyone.
              </p>
              <p>
                <span className="text-copper">local machine</span> — in <code>downloader/</code>{' '}
                run <code>node server.mjs</code> (port 8787), then set{' '}
                <code>VITE_DOWNLOADER_URL=http://127.0.0.1:8787</code> locally.
              </p>
            </div>
          </details>
        </div>
      )}

      {info && (
        <section ref={resultRef} aria-label="Video details" className="mt-8 border border-line bg-paper-raised">
          <div className="flex flex-col gap-5 p-5 sm:flex-row sm:p-6">
            {info.thumbnail && (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="relative block shrink-0"
                title="Open the original"
              >
                <img
                  src={info.thumbnail}
                  alt={`Thumbnail for ${info.title}`}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="aspect-video w-full border border-line object-cover sm:w-56"
                />
                <span className="absolute bottom-1.5 right-1.5 bg-black/70 px-1.5 py-0.5 font-mono text-[0.6rem] uppercase tracking-wider text-white">
                  source
                </span>
              </a>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="text-lg leading-snug font-semibold">{info.title}</h2>
              <p className="mt-1.5 font-mono text-xs text-ink-faint">
                {[info.uploader, info.extractor, formatDuration(info.duration)]
                  .filter(Boolean)
                  .join(' · ')}
              </p>

              {!audioOnly && info.qualities.length > 0 && (
                <div className="mt-5" role="radiogroup" aria-label="Quality">
                  <span className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-ink-faint">
                    quality
                  </span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {info.qualities.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        role="radio"
                        aria-checked={!audioOnly && quality === option.id}
                        onClick={() => {
                          setQuality(option.id)
                          setAudioOnly(false)
                        }}
                        disabled={busy}
                        title={option.videoOnly ? 'video + audio merged on this device' : undefined}
                        className={`border px-3.5 py-1.5 font-mono text-xs transition disabled:opacity-50 ${
                          !audioOnly && quality === option.id
                            ? 'border-copper bg-copper-wash text-copper-deep'
                            : 'border-line-strong text-ink-soft hover:border-copper/60'
                        }`}
                      >
                        {option.label}
                        {option.videoOnly && (
                          <span className="ml-1.5 text-[0.6rem] uppercase tracking-wider text-copper">
                            hd
                          </span>
                        )}
                      </button>
                    ))}
                    {info.hasAudio && (
                      <button
                        type="button"
                        role="radio"
                        aria-checked={audioOnly}
                        onClick={() => setAudioOnly(true)}
                        disabled={busy}
                        className={`border px-3.5 py-1.5 font-mono text-xs transition disabled:opacity-50 ${
                          audioOnly
                            ? 'border-copper bg-copper-wash text-copper-deep'
                            : 'border-line-strong text-ink-soft hover:border-copper/60'
                        }`}
                      >
                        MP3 · audio
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="mt-6 flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => void startDownload(recordUse, remaining)}
                  disabled={busy}
                  className="bg-copper px-7 py-3 font-mono text-xs font-bold uppercase tracking-[0.18em] text-paper transition hover:bg-ink disabled:opacity-40"
                >
                  {busy
                    ? `${STAGE_LABEL[stage] ?? 'Downloading'}${pct != null ? ` · ${pct}%` : '…'}`
                    : 'Download'}
                </button>
                {busy && ratio == null && (
                  <span className="size-4 animate-spin rounded-full border-2 border-line-strong border-t-copper" role="status" aria-label="Downloading" />
                )}
              </div>
              {busy && stage === 'merging' && (
                <p className="mt-2 font-mono text-[0.66rem] leading-relaxed text-ink-faint" aria-live="polite">
                  merging happens on this device — keep the tab open until it finishes.
                </p>
              )}
              {busy && pct != null && (
                <div className="mt-4 h-1 w-full bg-paper-inset">
                  <div
                    className="h-full bg-copper transition-[width]"
                    style={{ width: `${pct}%` }}
                    role="progressbar"
                    aria-valuenow={pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  />
                </div>
              )}
            </div>
          </div>
        </section>
      )}
      </div>
      )}
    </DownloadAccess>
  )
}
