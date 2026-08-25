import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useSession } from '../lib/auth-client.js'
import { pdfToDocument, PDF_TARGETS } from '../lib/converters/pdfToDocument.js'
import { convertToPdf } from '../lib/converters/officePdf.js'
import { UNLOCK_ALL } from '../lib/testing.js'

const OFFICE_URL = (import.meta.env.VITE_OFFICE_URL ?? '').replace(/\/+$/, '')
const FREE_DOC_USES = 3

const TO_PDF_ACCEPT =
  '.doc,.docx,.odt,.rtf,.txt,.md,.xls,.xlsx,.csv,.ods,.ppt,.pptx,.odp'
const TO_PDF_LABEL =
  'word · powerpoint · excel · opendocument · rtf · txt — anything libreoffice reads'

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function saveBlob(blob, name) {
  const href = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = name
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(href), 10_000)
}

async function officeToPdf(file) {
  const res = await fetch(`${OFFICE_URL}/convert`, {
    method: 'POST',
    headers: { 'X-Filename': encodeURIComponent(file.name) },
    body: file,
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data?.error ?? `Conversion failed (${res.status})`)
  }
  const blob = await res.blob()
  const name = decodeURIComponent(res.headers.get('X-Output-Name') ?? '') ||
    `${file.name.replace(/\.[^.]+$/, '')}.pdf`
  return { blob, name }
}

async function bumpUsage() {
  const res = await fetch('/api/usage/bump', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool: 'docs' }),
  })
  const data = await res.json().catch(() => ({}))
  if (res.status === 402) {
    return { allowed: false, limit: data?.limit ?? FREE_DOC_USES }
  }
  return { allowed: true, data }
}

function SignInCard() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
      <div className="mt-10 rounded-sm border border-line bg-paper-raised p-8 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-ink-faint">
          free tier
        </p>
        <h2 className="mt-3 text-xl font-bold uppercase tracking-[0.04em]">
          Sign in to convert documents
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-soft">
          Every account gets {FREE_DOC_USES} free document conversions — no
          payment, no card. Sign in so we can keep count.
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

function LimitReachedCard() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
      <div className="mt-10 rounded-sm border border-copper/60 bg-paper-raised p-8 text-center shadow-[0_0_80px_-32px_rgb(217_255_61/25%)]">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-copper">
          free conversions used up
        </p>
        <h2 className="mt-3 text-xl font-bold uppercase tracking-[0.04em]">
          You've used your {FREE_DOC_USES} free document conversions
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-soft">
          Pro unlocks unlimited Word, PowerPoint, Excel and OpenDocument
          conversions for a single $7 payment — no subscription.
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

/**
 * Documents are free with a per-account allowance; Pro/testing removes the cap.
 * Paywalls stay intact — UNLOCK_ALL simply opens every gate while testing.
 */
function DocsAccess({ children }) {
  const { data: session, isPending } = useSession()
  const user = session?.user
  const [remaining, setRemaining] = useState(null)
  const [exceeded, setExceeded] = useState(false)

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
        } else if (typeof data?.limits?.docs === 'number') {
          const left = Math.max(0, data.limits.docs - (data.used?.docs ?? 0))
          setRemaining(left)
          setExceeded(left === 0)
        }
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [isPending, user])

  async function recordUse() {
    if (UNLOCK_ALL) return true
    const { allowed } = await bumpUsage()
    if (!allowed) {
      setRemaining(0)
      setExceeded(true)
      return false
    }
    setRemaining((prev) => (prev == null ? prev : Math.max(0, prev - 1)))
    return true
  }

  if (UNLOCK_ALL) return children({})
  if (isPending) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
        <div className="mt-10 h-24 animate-pulse rounded-sm border border-line bg-paper-raised" />
      </div>
    )
  }
  if (!user) return <SignInCard />
  if (exceeded) return <LimitReachedCard />

  return children({
    remaining,
    recordUse,
    showAllowance: remaining != null,
  })
}

function ToPdfPanel({ serviceUp, recordUse, showAllowance, remaining }) {
  const inputRef = useRef(null)
  const [dragActive, setDragActive] = useState(false)
  const [jobs, setJobs] = useState([])
  const [busy, setBusy] = useState(false)

  // The desktop companion (LibreOffice) gives the highest fidelity when it is
  // reachable; otherwise the built-in browser engine takes over.
  const useCompanion = Boolean(OFFICE_URL) && serviceUp === true

  async function convert(files) {
    if (busy) return
    const list = [...files].slice(0, 5)
    setBusy(true)
    for (const file of list) {
      const id = `${file.name}-${Date.now()}-${Math.random()}`
      if (recordUse && !(await recordUse())) {
        setJobs((prev) => [
          ...prev.filter((j) => j.name !== file.name),
          {
            id,
            name: file.name,
            size: file.size,
            status: 'error',
            error: 'free conversions used up',
          },
        ])
        continue
      }
      setJobs((prev) => [
        ...prev.filter((j) => j.name !== file.name),
        { id, name: file.name, size: file.size, status: 'working' },
      ])
      try {
        const result = useCompanion
          ? await officeToPdf(file)
          : {
              name: `${file.name.replace(/\.[^.]+$/, '')}.pdf`,
              blob: await convertToPdf(file),
            }
        saveBlob(result.blob, result.name)
        setJobs((prev) =>
          prev.map((job) =>
            job.id === id ? { ...job, status: 'done', resultSize: result.blob.size } : job,
          ),
        )
      } catch (err) {
        setJobs((prev) => {
          const jobs = prev
          return jobs.map((job) =>
            job.id === id
              ? { ...job, status: 'error', error: err instanceof Error ? err.message : 'Conversion failed.' }
              : job,
          )
        })
      }
    }
    setBusy(false)
  }

  return (
    <section aria-labelledby="to-pdf-heading">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="to-pdf-heading" className="font-bold uppercase tracking-[0.08em]">
          Documents to PDF
        </h2>
        <span className="font-mono text-[0.66rem] uppercase tracking-wider text-copper">
          {useCompanion ? 'desktop companion' : 'runs in your browser'}
        </span>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-ink-soft">
        Word, PowerPoint, Excel and every OpenDocument format become clean,
        readable PDFs —{' '}
        {useCompanion
          ? 'powered by LibreOffice on this machine.'
          : 'converted entirely on this device. Nothing is uploaded anywhere.'}
      </p>

      <p className="mt-3 font-mono text-xs leading-relaxed text-ink-faint">
        built-in engine: docx · txt · md · rtf · csv tsv · xlsx xls · odt ods · pptx
        {OFFICE_URL ? ' · companion handles the rest' : ''}
        {OFFICE_URL && serviceUp === false && ' — companion offline right now, so the built-in engine is handling files it can'}
      </p>

      {showAllowance && remaining != null && (
        <p className="mt-3 font-mono text-xs text-ink-faint" aria-live="polite">
          free conversions left: <span className="text-copper">{remaining}</span> ·{' '}
          <Link
            to="/pricing"
            className="border-b border-line-strong pb-0.5 transition hover:border-copper hover:text-copper-deep"
          >
            unlimited with pro
          </Link>
        </p>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault()
          setDragActive(true)
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragActive(false)
          if (event.dataTransfer.files.length > 0) void convert(event.dataTransfer.files)
        }}
        aria-label="Add documents to convert to PDF"
        className={`group mt-4 w-full rounded-sm border-2 border-dashed px-6 py-12 transition disabled:cursor-not-allowed disabled:opacity-50 ${
          dragActive
            ? 'border-copper bg-copper-wash'
            : 'border-line-strong bg-paper-raised hover:border-copper/60 hover:bg-copper-wash/40'
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.25}
          aria-hidden="true"
          className={`mx-auto size-9 text-copper transition-transform duration-300 ${
            dragActive ? '-translate-y-1 scale-110' : ''
          }`}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V6m0 0-3.5 3.5M12 6l3.5 3.5M5 20h14" />
        </svg>
        <p className="mt-4 font-medium">
          {busy ? 'Converting…' : 'Drop a document here, or click to browse'}
        </p>
        <p className="mt-1 font-mono text-xs uppercase tracking-[0.12em] text-ink-faint">
          {TO_PDF_LABEL}
        </p>
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={TO_PDF_ACCEPT}
        className="hidden"
        onChange={(event) => {
          if (event.target.files.length > 0) void convert(event.target.files)
          event.target.value = ''
        }}
      />

      {jobs.length > 0 && (
        <ul className="mt-6 space-y-2">
          {jobs.map((job) => (
            <li
              key={job.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-sm border border-line bg-paper-raised px-4 py-3"
            >
              <div className="min-w-0 flex-1 basis-48">
                <p className="truncate text-sm font-medium">{job.name}</p>
                <p className="font-mono text-xs text-ink-faint">
                  {formatBytes(job.size)}
                  {job.status === 'done' &&
                    ` → pdf ready (${formatBytes(job.resultSize)}) saved to downloads`}
                  {job.status === 'error' && (
                    <span className="text-red-400"> · {job.error}</span>
                  )}
                </p>
              </div>
              <span
                className={`font-mono text-[0.66rem] uppercase tracking-wider ${
                  job.status === 'done'
                    ? 'text-emerald-400'
                    : job.status === 'error'
                      ? 'text-red-400'
                      : 'text-copper'
                }`}
              >
                {job.status === 'done' ? '✓ done' : job.status === 'error' ? 'failed' : '… working'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function FromPdfPanel({ recordUse, showAllowance, remaining }) {
  const inputRef = useRef(null)
  const [target, setTarget] = useState('docx')
  const [dragActive, setDragActive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const chosen = PDF_TARGETS.find((item) => item.id === target) ?? PDF_TARGETS[0]

  async function convert(file) {
    if (!file || busy) return
    setBusy(true)
    setError('')
    setResult(null)
    try {
      if (recordUse && !(await recordUse())) {
        setError('Your free document conversions are used up — upgrade to Pro for unlimited.')
        return
      }
      setProgress('reading text…')
      const blob = await pdfToDocument(file, target, (page, total) =>
        setProgress(`extracting page ${page} / ${total}…`),
      )
      setProgress('building document…')
      const name = `${file.name.replace(/\.pdf$/i, '')}${chosen.ext}`
      saveBlob(blob, name)
      setResult({ name, size: blob.size })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF conversion failed.')
    } finally {
      setBusy(false)
      setProgress('')
    }
  }

  return (
    <section aria-labelledby="from-pdf-heading" className="border-t border-line pt-8">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="from-pdf-heading" className="font-bold uppercase tracking-[0.08em]">
          PDF to document
        </h2>
        <span className="font-mono text-[0.66rem] uppercase tracking-wider text-copper">
          runs in your browser
        </span>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-ink-soft">
        Pulls the text out of any PDF and rebuilds it as an editable file —
        pick the format, drop the PDF, get a clean document. Text-based PDFs
        only; scanned pages have no text to grab.
      </p>

      <div role="radiogroup" aria-label="Output format" className="mt-5 flex flex-wrap gap-2">
        {PDF_TARGETS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={target === item.id}
            onClick={() => setTarget(item.id)}
            disabled={busy}
            className={`border px-4 py-2 font-mono text-xs uppercase tracking-[0.12em] transition disabled:opacity-50 ${
              target === item.id
                ? 'border-copper bg-copper-wash text-copper-deep'
                : 'border-line-strong text-ink-soft hover:border-copper/60'
            }`}
          >
            {item.label}
            <span aria-hidden="true" className="ml-1.5 text-ink-faint">{item.ext}</span>
          </button>
        ))}
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault()
          setDragActive(true)
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragActive(false)
          void convert(event.dataTransfer.files[0])
        }}
        aria-label={`Add a PDF to convert to ${chosen.label}`}
        className={`group mt-4 w-full rounded-sm border-2 border-dashed px-6 py-12 transition disabled:cursor-not-allowed disabled:opacity-50 ${
          dragActive
            ? 'border-copper bg-copper-wash'
            : 'border-line-strong bg-paper-raised hover:border-copper/60 hover:bg-copper-wash/40'
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.25}
          aria-hidden="true"
          className={`mx-auto size-9 text-copper transition-transform duration-300 ${
            dragActive ? '-translate-y-1 scale-110' : ''
          }`}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5v9m0-9-3.5 3.5M12 7.5l3.5 3.5M5 20h14" />
        </svg>
        <p className="mt-4 font-medium">
          {busy ? progress || 'Working…' : `Drop a PDF here to get ${chosen.label}, or click to browse`}
        </p>
        <p className="mt-1 font-mono text-xs uppercase tracking-[0.12em] text-ink-faint">
          .pdf → {chosen.ext} · nothing is uploaded anywhere
        </p>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={(event) => {
          void convert(event.target.files[0])
          event.target.value = ''
        }}
      />

      {showAllowance && remaining != null && (
        <p className="mt-3 font-mono text-xs text-ink-faint" aria-live="polite">
          free conversions left: <span className="text-copper">{remaining}</span>
        </p>
      )}

      {error && (
        <p role="alert" className="mt-4 border border-red-900/60 bg-red-950/30 px-4 py-3 font-mono text-xs leading-relaxed text-red-400">
          {error}
        </p>
      )}
      {result && (
        <p role="status" className="mt-4 border border-emerald-900/50 bg-emerald-950/20 px-4 py-3 font-mono text-xs text-emerald-400">
          ✓ {result.name} ({formatBytes(result.size)}) saved to your downloads.
        </p>
      )}
    </section>
  )
}

export default function Documents() {
  const [serviceUp, setServiceUp] = useState(null)

  // The desktop companion (LibreOffice) is optional — it upgrades fidelity
  // when reachable, but the built-in browser engine always works.
  const hasService = Boolean(OFFICE_URL)

  useEffect(() => {
    if (!hasService) return
    let alive = true
    async function probe() {
      try {
        const res = await fetch(`${OFFICE_URL}/health`, { signal: AbortSignal.timeout(3000) })
        const data = await res.json().catch(() => ({}))
        if (alive) setServiceUp(Boolean(data?.ok && data?.soffice))
      } catch {
        if (alive) setServiceUp(false)
      }
    }
    void probe()
    return () => {
      alive = false
    }
  }, [hasService])

  return (
    <DocsAccess>
      {({ remaining, recordUse, showAllowance }) => (
        <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
          <p className="flex items-center gap-3 font-mono text-xs font-medium uppercase tracking-[0.25em] text-ink-faint">
            <span className="font-bold normal-case text-copper">//</span>
            the office suite, forged locally
          </p>
          <h1 className="mt-4 text-4xl font-bold uppercase tracking-[-0.02em]">
            Documents &amp; PDF
          </h1>
          <p className="mt-2 font-mono text-xs text-ink-faint">
            word ⇄ pdf · ppt → pdf · xlsx → pdf · odt ods odp → pdf
          </p>

          <div className="mt-10 space-y-8 rounded-sm border border-line bg-paper-raised/40 p-6 sm:p-8">
            <ToPdfPanel
              serviceUp={serviceUp}
              recordUse={recordUse}
              showAllowance={showAllowance}
              remaining={remaining}
            />
            <FromPdfPanel
              recordUse={recordUse}
              showAllowance={showAllowance}
              remaining={remaining}
            />
          </div>

          <p className="mx-auto mt-8 max-w-md text-center font-mono text-xs leading-relaxed text-ink-faint">
            need the free basics instead?{' '}
            <Link
              to="/convert"
              className="border-b border-line-strong pb-0.5 transition hover:text-copper-deep hover:border-copper"
            >
              convert covers images, pdf surgery and simple docs
            </Link>
          </p>
        </div>
      )}
    </DocsAccess>
  )
}
