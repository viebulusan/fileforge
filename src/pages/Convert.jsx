import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { downloadZip } from 'client-zip'
import { planFor } from '../lib/converters/registry.js'
import { formatBytes } from '../lib/format.js'
import PdfTools from '../components/PdfTools.jsx'
import { useSession } from '../lib/auth-client.js'
import { UNLOCK_ALL } from '../lib/testing.js'

const QUALITY_OPTIONS = [
  { id: 'high', label: 'High' },
  { id: 'balanced', label: 'Balanced' },
  { id: 'compact', label: 'Compact' },
]

const MODES = [
  { id: 'files', label: 'Files & docs' },
  { id: 'pdf', label: 'PDF tools' },
]

let nextItemId = 1

export default function Convert() {
  const [items, setItems] = useState([])
  const [preset, setPreset] = useState('balanced')
  const [dragActive, setDragActive] = useState(false)
  const [mode, setMode] = useState('files')
  const [avRatio, setAvRatio] = useState(null)
  const inputRef = useRef(null)
  const { data: session } = useSession()
  const isPro = session?.user?.plan === 'pro'

  const updateItem = useCallback((id, patch) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    )
  }, [])

  const runItem = useCallback(
    async (item) => {
      updateItem(item.id, {
        status: 'working',
        error: null,
        resultUrl: null,
        resultSize: null,
      })
      try {
        const blob = await item.family.convert(
          item.file,
          item.target,
          item.preset,
        )
        if (item.resultUrl) URL.revokeObjectURL(item.resultUrl)
        setAvRatio(null)
        updateItem(item.id, {
          status: 'done',
          resultUrl: URL.createObjectURL(blob),
          resultBlob: blob,
          resultSize: blob.size,
        })
      } catch (error) {
        setAvRatio(null)
        updateItem(item.id, {
          status: 'error',
          error:
            error instanceof Error ? error.message : 'Conversion failed here.',
        })
      }
    },
    [updateItem],
  )

  const addFiles = useCallback(
    async (fileList) => {
      const incoming = Array.from(fileList).filter((file) => file.size > 0)
      for (const file of incoming) {
        const family = planFor(file)
        if (!family) {
          const ext = file.name.slice(file.name.lastIndexOf('.')) || file.name
          setItems((current) => [
            ...current,
            {
              id: nextItemId++,
              file,
              name: file.name,
              size: file.size,
              status: 'unsupported',
              unsupportedExt: ext,
            },
          ])
          continue
        }
        if (family.id === 'av' && !isPro && !UNLOCK_ALL) {
          setItems((current) => [
            ...current,
            {
              id: nextItemId++,
              file,
              family,
              name: file.name,
              size: file.size,
              status: 'locked',
            },
          ])
          continue
        }
        const targets = await family.outputsFor(file)
        const preferred =
          targets.find((t) => t.id === 'webp') ??
          targets.find((t) => t.id === 'jpeg') ??
          targets[0]
        const item = {
          id: nextItemId++,
          file,
          family,
          name: file.name,
          base: family.baseOf(file.name),
          size: file.size,
          ext: family.extOf(file.name),
          targets,
          targetId: preferred?.id ?? null,
          target: preferred,
          preset: 'balanced',
          status: 'working',
        }
        setItems((current) => [...current, item])
        void runItem(item)
      }
    },
    [runItem, isPro],
  )

  useEffect(() => {
    function onPaste(event) {
      const files = Array.from(event.clipboardData?.files ?? [])
      if (files.length > 0) {
        event.preventDefault()
        void addFiles(files)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [addFiles])

  useEffect(() => {
    function onProgress(event) {
      setAvRatio(event.detail.ratio)
    }
    window.addEventListener('ff-av-progress', onProgress)
    return () => window.removeEventListener('ff-av-progress', onProgress)
  }, [])

  function changeTarget(item, targetId) {
    const target = item.targets.find((t) => t.id === targetId)
    if (!target) return
    const updated = { ...item, targetId, target, status: 'working' }
    updateItem(item.id, { targetId, target, status: 'working' })
    void runItem(updated)
  }

  function changePresetForItem(item, newPreset) {
    const updated = { ...item, preset: newPreset }
    updateItem(item.id, { preset: newPreset })
    void runItem(updated)
  }

  function removeItem(id) {
    setItems((current) => {
      const item = current.find((entry) => entry.id === id)
      if (item?.resultUrl) URL.revokeObjectURL(item.resultUrl)
      return current.filter((entry) => entry.id !== id)
    })
  }

  async function downloadAll() {
    const done = items.filter((item) => item.status === 'done')
    const blob = await downloadZip(
      done.map((item) => ({
        name: `${item.base}${item.target.ext}`,
        input: item.resultBlob,
      })),
    ).blob()
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'fileforge-converted.zip'
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  const doneCount = items.filter((item) => item.status === 'done').length

  return (
    <div className="mx-auto max-w-4xl px-5 py-12 sm:px-8">
      <p className="flex items-center gap-3 font-mono text-xs font-medium uppercase tracking-[0.25em] text-ink-faint">
        <span className="font-bold normal-case text-copper">//</span>
        runs on this device · nothing uploaded
      </p>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-4xl font-bold uppercase tracking-[-0.02em]">
          Convert
        </h1>
        <div role="tablist" aria-label="Converter sections" className="flex border border-line-strong font-mono text-xs uppercase tracking-[0.14em]">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={mode === m.id}
              onClick={() => setMode(m.id)}
              className={`px-4 py-2 transition ${
                mode === m.id
                  ? 'bg-copper font-bold text-paper'
                  : 'text-ink-soft hover:text-copper'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {mode === 'pdf' ? (
        <PdfTools />
      ) : (
        <>
          <div className="mt-8 flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-ink-faint">
              quality preset
            </span>
            <select
              value={preset}
              onChange={(event) => setPreset(event.target.value)}
              className="rounded-sm border border-line-strong bg-paper-raised px-2.5 py-1.5 font-mono text-xs"
            >
              {QUALITY_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault()
              setDragActive(true)
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(event) => {
              event.preventDefault()
              setDragActive(false)
              if (event.dataTransfer.files.length > 0) void addFiles(event.dataTransfer.files)
            }}
            aria-label="Add files to convert"
            className={`group mt-4 w-full rounded-sm border-2 border-dashed px-6 py-14 transition ${
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
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 16.5V6m0 0-3.5 3.5M12 6l3.5 3.5M5 20h14"
              />
            </svg>
            <p className="mt-4 font-medium">
              Drop files here, or click to browse
            </p>
            <p className="mt-1 font-mono text-xs uppercase tracking-[0.12em] text-ink-faint">
              images · docs · audio · video — or paste from clipboard
            </p>
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/*,.heic,.heif,.avif,.csv,.tsv,.json,.xlsx,.xls,.md,.markdown,.mp4,.m4v,.webm,.mkv,.mov,.avi,.wmv,.flv,.ts,.ogv,.3gp,.mpg,.mpeg,.mp3,.wav,.m4a,.aac,.ogg,.oga,.opus,.flac,.wma,.aiff,.aif"
            className="hidden"
            onChange={(event) => {
              if (event.target.files.length > 0) void addFiles(event.target.files)
              event.target.value = ''
            }}
          />

          {items.length > 0 && (
            <ul className="mt-8 space-y-2">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-sm border border-line bg-paper-raised px-4 py-3"
                >
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <p className="font-mono text-xs text-ink-faint">
                      {formatBytes(item.size)}
                      {item.status === 'done' && item.resultSize != null && (
                        <> → {formatBytes(item.resultSize)}</>
                      )}
                      {item.status === 'done' && item.resultSize != null && (
                        <span className="text-copper">
                          {' '}
                          ({Math.round((item.resultSize / item.size - 1) * 100)}%)
                        </span>
                      )}
                    </p>
                  </div>

                  {item.status === 'unsupported' ? (
                    <span className="font-mono text-xs text-red-400">
                      no converter for {item.unsupportedExt} yet
                    </span>
                  ) : item.status === 'locked' ? (
                    <>
                      <span className="border border-copper/40 bg-copper-wash px-3 py-1.5 font-mono text-xs uppercase tracking-[0.14em] text-copper">
                        pro
                      </span>
                      <Link
                        to="/pricing"
                        className="rounded-sm border border-line-strong px-3 py-1.5 font-mono text-xs uppercase tracking-[0.14em] transition hover:border-copper hover:text-copper"
                      >
                        Unlock a/v
                      </Link>
                    </>
                  ) : (
                    <>
                      <span aria-hidden="true" className="font-mono text-xs text-ink-faint">
                        {item.ext || '?'} →
                      </span>
                      <select
                        value={item.targetId ?? ''}
                        onChange={(event) => changeTarget(item, event.target.value)}
                        disabled={item.status === 'working'}
                        className="rounded-sm border border-line-strong bg-paper px-2 py-1 font-mono text-xs disabled:opacity-50"
                      >
                        {item.targets.map((target) => (
                          <option key={target.id} value={target.id}>
                            {target.label}
                          </option>
                        ))}
                      </select>
                      {item.target?.lossy && (
                        <select
                          value={item.preset}
                          onChange={(event) =>
                            changePresetForItem(item, event.target.value)
                          }
                          disabled={item.status === 'working'}
                          className="rounded-sm border border-line-strong bg-paper px-2 py-1 font-mono text-xs disabled:opacity-50"
                        >
                          {QUALITY_OPTIONS.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      )}
                      {item.status === 'working' && (
                        <>
                          <span
                            className="size-4 animate-spin rounded-full border-2 border-line-strong border-t-copper"
                            role="status"
                            aria-label="Converting"
                          />
                          {item.family?.id === 'av' && avRatio != null && (
                            <span className="font-mono text-xs text-copper">
                              {Math.min(100, Math.round(avRatio * 100))}%
                            </span>
                          )}
                        </>
                      )}
                      {item.status === 'done' && (
                        <a
                          href={item.resultUrl}
                          download={`${item.base}${item.target.ext}`}
                          className="bg-copper px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-wider text-paper transition hover:bg-ink"
                        >
                          Download
                        </a>
                      )}
                      {item.status === 'error' && (
                        <span className="font-mono text-xs text-red-400">
                          {item.error}
                        </span>
                      )}
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    aria-label={`Remove ${item.name}`}
                    className="ml-auto text-ink-faint transition hover:text-copper"
                  >
                    <svg
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.5}
                      className="size-3.5"
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" d="m3 3 10 10M13 3 3 13" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {doneCount >= 2 && (
            <div className="mt-6 flex items-center justify-between rounded-sm border border-line bg-paper-raised px-4 py-3">
              <span className="font-mono text-xs uppercase tracking-[0.14em] text-ink-faint">
                {doneCount} files ready
              </span>
              <button
                type="button"
                onClick={() => void downloadAll()}
                className="bg-copper px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.14em] text-paper transition hover:bg-ink"
              >
                Download all (.zip)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
