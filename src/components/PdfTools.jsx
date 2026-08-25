import { useRef, useState } from 'react'
import { downloadZip } from 'client-zip'
import { mergePdfs, extractPdfPages, rotatePdf } from '../lib/converters/pdf.js'
import { pdfToPngs } from '../lib/converters/pdfToImages.js'
import { imagesToPdf } from '../lib/converters/imagesToPdf.js'
import { acceptsImage, extOf } from '../lib/converters/images.js'
import { formatBytes } from '../lib/format.js'

const TOOLS = [
  { id: 'merge', label: 'Merge PDFs' },
  { id: 'extract', label: 'Extract pages' },
  { id: 'rotate', label: 'Rotate' },
  { id: 'pdf-to-images', label: 'PDF → images' },
  { id: 'images-to-pdf', label: 'Images → PDF' },
]

function DropArea({ onFiles, accept, hint, multiple = true }) {
  const ref = useRef(null)
  const [active, setActive] = useState(false)
  // Empty files slip through OS/browser edge cases and poison every tool
  // downstream (silent merge failures, corrupt outputs) — drop them here.
  const handle = (fileList) => {
    const usable = Array.from(fileList).filter((f) => f.size > 0)
    if (usable.length > 0) onFiles(usable)
  }
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        onDragOver={(event) => {
          event.preventDefault()
          setActive(true)
        }}
        onDragLeave={() => setActive(false)}
        onDrop={(event) => {
          event.preventDefault()
          setActive(false)
          if (event.dataTransfer.files.length > 0) handle(event.dataTransfer.files)
        }}
        className={`w-full rounded-sm border-2 border-dashed px-4 py-8 text-sm transition ${
          active
            ? 'border-copper bg-copper-wash'
            : 'border-line-strong bg-paper hover:border-copper/60 hover:bg-copper-wash/40'
        }`}
      >
        Drop {multiple ? 'files' : 'a file'} here, or click to browse
        <span className="mt-1 block font-mono text-xs text-ink-faint">{hint}</span>
      </button>
      <input
        ref={ref}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(event) => {
          if (event.target.files.length > 0) handle(event.target.files)
          event.target.value = ''
        }}
      />
    </>
  )
}

function ResultRow({ name, blob, url }) {
  return (
    <div className="mt-3 flex items-center justify-between rounded-sm border border-copper/40 bg-copper-wash px-4 py-2.5">
      <span className="truncate font-mono text-xs">
        {name} · {formatBytes(blob.size)}
      </span>
      <a
        href={url}
        download={name}
        className="rounded-sm bg-copper px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-wider text-paper transition hover:bg-ink"
      >
        Download
      </a>
    </div>
  )
}

function useResult() {
  const [result, setResult] = useState(null)
  const showResult = (name, blob) =>
    setResult({ name, blob, url: URL.createObjectURL(blob) })
  return [result, showResult]
}

function useBusy() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const wrap = async (fn) => {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }
  return [busy, wrap, error]
}

function BusyError({ error }) {
  if (!error) return null
  return (
    <p role="alert" className="mt-3 border border-red-900/60 bg-red-950/30 px-4 py-3 font-mono text-xs leading-relaxed text-red-400">
      {error}
    </p>
  )
}

function MergeTool() {
  const [files, setFiles] = useState([])
  const [busy, wrap, error] = useBusy()
  const [result, showResult] = useResult()

  function move(index, delta) {
    setFiles((current) => {
      const next = [...current]
      const target = index + delta
      if (target < 0 || target >= next.length) return current
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  return (
    <div>
      <DropArea
        accept=".pdf,application/pdf"
        hint="pdf only · order matters"
        onFiles={(incoming) =>
          setFiles((current) => [...current, ...incoming.filter((f) => extOf(f.name) === '.pdf')])
        }
      />
      {files.length > 0 && (
        <ol className="mt-4 space-y-1.5">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex items-center gap-3 rounded-sm border border-line bg-paper-raised px-3.5 py-2 text-sm"
            >
              <span className="font-mono text-xs text-ink-faint">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <span className="font-mono text-xs text-ink-faint">{formatBytes(file.size)}</span>
              <button type="button" onClick={() => move(index, -1)} aria-label={`Move ${file.name} up`} className="px-1 text-ink-faint hover:text-ink">↑</button>
              <button type="button" onClick={() => move(index, 1)} aria-label={`Move ${file.name} down`} className="px-1 text-ink-faint hover:text-ink">↓</button>
              <button
                type="button"
                onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                aria-label={`Remove ${file.name}`}
                className="px-1 text-ink-faint hover:text-ink"
              >
                ×
              </button>
            </li>
          ))}
        </ol>
      )}
      <button
        type="button"
        disabled={busy || files.length < 2}
        onClick={() =>
          wrap(async () => showResult('merged.pdf', await mergePdfs(files)))
        }
        className="mt-4 rounded-sm bg-copper px-5 py-2.5 font-mono text-xs font-bold uppercase tracking-[0.14em] text-paper transition hover:bg-ink disabled:opacity-40"
      >
        {busy ? 'Merging…' : `Merge ${files.length || ''} PDFs`}
      </button>
      {result && <ResultRow {...result} />}
      <BusyError error={error} />
    </div>
  )
}

function ExtractTool() {
  const [file, setFile] = useState(null)
  const [ranges, setRanges] = useState('')
  const [busy, wrap, error] = useBusy()
  const [result, showResult] = useResult()
  const [keptCount, setKeptCount] = useState(null)

  return (
    <div>
      <DropArea
        multiple={false}
        accept=".pdf,application/pdf"
        hint="one pdf · e.g. “1-3, 7, 9-12”"
        onFiles={(incoming) => {
          const pdf = incoming.find((f) => extOf(f.name) === '.pdf')
          if (pdf) {
            setFile(pdf)
            setRanges('')
            setKeptCount(null)
          }
        }}
      />
      {file && (
        <p className="mt-3 font-mono text-xs text-ink-faint">
          source: {file.name} · {formatBytes(file.size)}
        </p>
      )}
      <label className="mt-4 block">
        <span className="font-mono text-xs uppercase tracking-wide text-ink-faint">
          pages to keep
        </span>
        <input
          value={ranges}
          onChange={(event) => setRanges(event.target.value)}
          placeholder="1-3, 7"
          className="mt-1 w-full rounded-sm border border-line-strong bg-paper-raised px-3.5 py-2.5 font-mono text-sm outline-none focus:border-copper"
        />
      </label>
      <button
        type="button"
        disabled={busy || !file}
        onClick={() =>
          wrap(async () => {
            const { blob, count } = await extractPdfPages(file, ranges)
            const base = file.name.replace(/\.pdf$/i, '')
            setKeptCount(count)
            showResult(`${base}-extracted.pdf`, blob)
          })
        }
        className="mt-4 rounded-sm bg-copper px-5 py-2.5 font-mono text-xs font-bold uppercase tracking-[0.14em] text-paper transition hover:bg-ink disabled:opacity-40"
      >
        {busy ? 'Extracting…' : 'Extract pages'}
      </button>
      {keptCount != null && !busy && (
        <p className="mt-2 font-mono text-xs text-ink-faint">
          kept {keptCount} page{keptCount === 1 ? '' : 's'}
        </p>
      )}
      {result && <ResultRow {...result} />}
      <BusyError error={error} />
    </div>
  )
}

function RotateTool() {
  const turns = [
    { id: 90, label: '90° right' },
    { id: 180, label: '180°' },
    { id: 270, label: '90° left' },
  ]
  const [file, setFile] = useState(null)
  const [turn, setTurn] = useState(90)
  const [busy, wrap, error] = useBusy()
  const [result, showResult] = useResult()

  return (
    <div>
      <DropArea
        multiple={false}
        accept=".pdf,application/pdf"
        hint="one pdf · every page"
        onFiles={(incoming) => {
          const pdf = incoming.find((f) => extOf(f.name) === '.pdf')
          if (pdf) setFile(pdf)
        }}
      />
      {file && (
        <p className="mt-3 font-mono text-xs text-ink-faint">
          source: {file.name} · {formatBytes(file.size)}
        </p>
      )}
      <fieldset className="mt-4 flex gap-2">
        <legend className="sr-only">Rotation</legend>
        {turns.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setTurn(option.id)}
            aria-pressed={turn === option.id}
            className={`rounded-sm border px-4 py-2 font-mono text-xs transition ${
              turn === option.id
                ? 'border-copper bg-copper-wash text-copper-deep'
                : 'border-line-strong text-ink-soft hover:border-copper/60'
            }`}
          >
            {option.label}
          </button>
        ))}
      </fieldset>
      <button
        type="button"
        disabled={busy || !file}
        onClick={() =>
          wrap(async () => {
            const base = file.name.replace(/\.pdf$/i, '')
            showResult(`${base}-rotated.pdf`, await rotatePdf(file, turn))
          })
        }
        className="mt-4 rounded-sm bg-copper px-5 py-2.5 font-mono text-xs font-bold uppercase tracking-[0.14em] text-paper transition hover:bg-ink disabled:opacity-40"
      >
        {busy ? 'Rotating…' : 'Rotate all pages'}
      </button>
      {result && <ResultRow {...result} />}
      <BusyError error={error} />
    </div>
  )
}

function PdfToImagesTool() {
  const [file, setFile] = useState(null)
  const [busy, wrap, error] = useBusy()
  const [status, setStatus] = useState('')
  const [results, setResults] = useState([])

  function reset() {
    results.forEach((r) => URL.revokeObjectURL(r.url))
    setResults([])
    setStatus('')
  }

  return (
    <div>
      <DropArea
        multiple={false}
        accept=".pdf,application/pdf"
        hint="each page becomes a png at 2× resolution"
        onFiles={(incoming) => {
          const pdf = incoming.find((f) => extOf(f.name) === '.pdf')
          if (pdf) {
            reset()
            setFile(pdf)
          }
        }}
      />
      {file && (
        <div className="mt-3 flex items-center justify-between gap-4">
          <p className="font-mono text-xs text-ink-faint">
            source: {file.name} · {formatBytes(file.size)}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              wrap(async () => {
                setStatus('Rendering…')
                try {
                  const pages = await pdfToPngs(file)
                  const withUrls = pages.map((page) => ({
                    ...page,
                    url: URL.createObjectURL(page.blob),
                  }))
                  setResults(withUrls)
                  setStatus(
                    `${pages.length} page${pages.length === 1 ? '' : 's'} rendered`,
                  )
                  if (pages.length > 1) {
                    const zipBlob = await downloadZip(
                      pages.map(({ name, blob }) => ({ name, input: blob })),
                    ).blob()
                    setResults((current) => [
                      {
                        name: `${file.name.replace(/\.pdf$/i, '')}-pages.zip`,
                        blob: zipBlob,
                        url: URL.createObjectURL(zipBlob),
                      },
                      ...current,
                    ])
                  }
                } catch (error) {
                  setStatus('')
                  throw error
                }
              })
            }
            className="shrink-0 rounded-sm bg-copper px-5 py-2 font-mono text-xs font-bold uppercase tracking-[0.14em] text-paper transition hover:bg-ink disabled:opacity-40"
          >
            Render pages
          </button>
        </div>
      )}
      {status && !busy && (
        <p className="mt-3 font-mono text-xs text-ink-soft">{status}</p>
      )}
      <BusyError error={error} />
      {results.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {results.map((entry) => (
            <li key={entry.name}>
              <ResultRow {...entry} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ImagesToPdfTool() {
  const [files, setFiles] = useState([])
  const [fitA4, setFitA4] = useState(true)
  const [busy, wrap, error] = useBusy()
  const [result, showResult] = useResult()

  return (
    <div>
      <DropArea
        accept="image/*,.heic,.heif,.avif"
        hint="any images · combined into one pdf in this order"
        onFiles={(incoming) =>
          setFiles((current) => [...current, ...incoming.filter(acceptsImage)])
        }
      />
      {files.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex items-center gap-3 rounded-sm border border-line bg-paper-raised px-3.5 py-2 text-sm"
            >
              <span className="font-mono text-xs text-ink-faint">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <button
                type="button"
                onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                aria-label={`Remove ${file.name}`}
                className="px-1 text-ink-faint hover:text-ink"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className="mt-4 flex items-center gap-2.5 text-sm text-ink-soft">
        <input
          type="checkbox"
          checked={fitA4}
          onChange={(event) => setFitA4(event.target.checked)}
          className="size-4 accent-[#d9ff3d]"
        />
        Fit each image onto an A4 page (centered)
      </label>
      <button
        type="button"
        disabled={busy || files.length === 0}
        onClick={() =>
          wrap(async () => {
            const blob = await imagesToPdf(files, { fitA4 })
            showResult(
              files[0].name.replace(/\.[^.]+$/, '') + '.pdf',
              blob,
            )
          })
        }
        className="mt-4 rounded-sm bg-copper px-5 py-2.5 font-mono text-xs font-bold uppercase tracking-[0.14em] text-paper transition hover:bg-ink disabled:opacity-40"
      >
        {busy ? 'Building…' : `Create PDF from ${files.length || ''} image${files.length === 1 ? '' : 's'}`}
      </button>
      {result && <ResultRow {...result} />}
      <BusyError error={error} />
    </div>
  )
}

const PANELS = {
  merge: MergeTool,
  extract: ExtractTool,
  rotate: RotateTool,
  'pdf-to-images': PdfToImagesTool,
  'images-to-pdf': ImagesToPdfTool,
}

export default function PdfTools() {
  const [tool, setTool] = useState('merge')
  const Panel = PANELS[tool]

  return (
    <div>
      <div role="tablist" aria-label="PDF tools" className="flex flex-wrap gap-2">
        {TOOLS.map((entry) => (
          <button
            key={entry.id}
            role="tab"
            aria-selected={tool === entry.id}
            onClick={() => setTool(entry.id)}
            className={`rounded-sm border px-4 py-1.5 font-mono text-xs transition ${
              tool === entry.id
                ? 'border-copper bg-copper-wash text-copper-deep'
                : 'border-line-strong text-ink-soft hover:border-copper/60'
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="mt-6 rounded-sm border border-line bg-paper-raised p-6 sm:p-8">
        <Panel />
      </div>
    </div>
  )
}
