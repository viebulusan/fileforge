import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import express from 'express'
import cors from 'cors'

const PORT = Number(process.env.PORT) || 8787
const HOST = process.env.HOST ?? (process.env.PORT ? '0.0.0.0' : '127.0.0.1')

const VENV = path.join(import.meta.dirname, '.venv', 'bin', 'yt-dlp')
const YTDLP = process.env.YTDLP_BIN || (fs.existsSync(VENV) ? VENV : 'yt-dlp')

const TMP_DIR = path.join(os.tmpdir(), 'fileforge-downloads')
fs.mkdirSync(TMP_DIR, { recursive: true })

const MAX_JOBS = 2
const JOB_TTL_MS = 10 * 60 * 1000

let running = 0
const queue = []

function nextInQueue() {
  if (running >= MAX_JOBS || queue.length === 0) return
  const job = queue.shift()
  job()
}

const NODE_BIN = process.execPath

// Extra args for the YouTube extractor: alternate player clients + a JS runtime
// so yt-dlp can solve web challenges, while the bgutil plugin (auto-loaded from
// the venv) supplies PO tokens from 127.0.0.1:4416. Overridable via YT_CLIENTS.
function youtubeArgs() {
  const clients = process.env.YT_CLIENTS || 'tv,web_safari'
  return [
    '--extractor-args', `youtube:player_client=${clients}`,
    '--js-runtimes', `node:${NODE_BIN}`,
  ]
}

const OPTIONAL_ARGS_RE = /(no such option|unknown option|unrecognized argument|invalid choice)/i
const BOTCHECK_RE = /(sign in to confirm|not a bot)/i

async function runYtDlpSmart(args, onStdout) {
  try {
    return await runYtDlp([...youtubeArgs(), ...args], onStdout)
  } catch (error) {
    if (!OPTIONAL_ARGS_RE.test(error.message)) throw error
    // Older yt-dlp without one of the optional flags — retry bare.
    return runYtDlp(args, onStdout)
  }
}

// Free-tier instances wake cold: the bgutil POT server may need a moment.
async function runYtDlpWithRetry(args, onStdout) {
  try {
    return await runYtDlpSmart(args, onStdout)
  } catch (error) {
    if (!BOTCHECK_RE.test(error.message)) throw error
    await new Promise((r) => setTimeout(r, 2000))
    return runYtDlpSmart(args, onStdout)
  }
}

function ytdlpArgs(args) {
  return [
    '--no-warnings',
    '--no-playlist',
    '--no-progress',
    '--socket-timeout', '20',
    '--retries', '3',
    ...args,
  ]
}

function runYtDlp(args, onStdout) {
  return new Promise((resolve, reject) => {
    const child = spawn(YTDLP, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    if (onStdout) {
      child.stdout.on('data', onStdout)
    } else {
      child.stdout.on('data', (chunk) => {
        out += chunk
        if (out.length > 20 * 1024 * 1024) out = ''
      })
    }
    child.stderr.on('data', (chunk) => {
      err += chunk
      if (err.length > 8000) err = err.slice(-4000)
    })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error('yt-dlp timed out'))
    }, 15 * 60 * 1000)
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(out)
      else reject(new Error(err.trim().split('\n').slice(-3).join(' — ') || `yt-dlp exited ${code}`))
    })
  })
}

function assertHttpUrl(url) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('That does not look like a URL')
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http(s) links are supported')
  }
  return parsed.href
}

const app = express()
app.use(cors({ origin: true }))
app.use(express.json())

app.get('/api/debug-pot', async (_req, res) => {
  const { spawn } = await import('node:child_process')
  const run = (argv) => new Promise((resolve) => {
    const proc = spawn(argv[0], argv.slice(1), { shell: false })
    let out = ''
    proc.stdout.on('data', (d) => { out += d })
    proc.stderr.on('data', (d) => { out += d })
    proc.on('error', (e) => { out += String(e) })
    proc.on('close', () => resolve(out))
  })
  const bgutilPing = await run(['curl', '-s', '-m', '5', 'http://127.0.0.1:4416/ping'])
  const bgutilLog = await run(['tail', '-5', '/tmp/bgutil.log'])
  const combos = [
    ['tv + jsr', [...youtubeArgs(), '--extractor-args', 'youtube:player_client=tv']],
    ['web_safari + jsr', [...youtubeArgs(), '--extractor-args', 'youtube:player_client=web_safari']],
    ['default clients + jsr', [...youtubeArgs()]],
    ['plain (no extras)', []],
  ]
  const results = {}
  for (const [label, args] of combos) {
    const out = await run([YTDLP, '--no-warnings', '--simulate', '--print', '%(title)s', ...args, 'https://youtu.be/O6nXrSheFdc'])
    const ok = /super rich/.test(out)
    results[label] = ok ? 'PASS' : out.split('\n').filter((l) => /ERROR|Sign in|reloaded|not available|challenge/i.test(l)).at(-1)?.slice(0, 100) ?? 'fail'
  }
  res.setHeader('content-type', 'text/plain; charset=utf-8')
  res.end('NODE: ' + NODE_BIN + '\nBGUTIL PING: ' + (bgutilPing || '(empty)').slice(0, 150) + '\nBGUTIL LOG: ' + (bgutilLog || '(empty)').slice(0, 300) + '\n\nCLIENTS:\n' + JSON.stringify(results, null, 1))
})

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ytDlp: YTDLP })
})

app.post('/api/info', async (req, res) => {
  try {
    const url = assertHttpUrl(String(req.body?.url ?? ''))
    const raw = await runYtDlpWithRetry(ytdlpArgs(['-J', url]))
    const info = JSON.parse(raw)

    const heights = new Set()
    for (const f of info.formats ?? []) {
      if (f.height && f.vcodec && f.vcodec !== 'none') heights.add(f.height)
    }
    const ladder = [...heights].sort((a, b) => b - a).slice(0, 6)

    res.json({
      id: info.id,
      title: info.title,
      uploader: info.uploader ?? info.channel,
      duration: info.duration,
      thumbnail: info.thumbnail,
      extractor: info.extractor_key ?? info.extractor,
      qualities: ladder.map((height) => ({
        id: String(height),
        label:
          height >= 2160 ? `${height}p · 4K`
          : height >= 1440 ? `${height}p · 2K`
          : `${height}p`,
      })),
      hasAudio: (info.formats ?? []).some((f) => f.acodec && f.acodec !== 'none'),
    })
  } catch (error) {
    res.status(422).json({ error: error.message })
  }
})

app.post('/api/download', async (req, res) => {
  let url
  let quality
  let audioOnly = false
  try {
    url = assertHttpUrl(String(req.body?.url ?? ''))
    quality = req.body?.quality ? parseInt(req.body.quality, 10) : null
    audioOnly = req.body?.audioOnly === true
  } catch (error) {
    return res.status(422).json({ error: error.message })
  }

  if (running >= MAX_JOBS) {
    return res.status(429).json({ error: `Server busy — ${running} downloads already in progress. Try again shortly.` })
  }

  const jobDir = path.join(TMP_DIR, `ff-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  fs.mkdirSync(jobDir, { recursive: true })

  const args = ['-P', jobDir, '-o', '%(title).180B.%(ext)s']
  if (audioOnly) {
    args.push('-x', '--audio-format', 'mp3', '--audio-quality', '0')
  } else {
    args.push(
      '-f',
      quality
        ? `bv*[height<=${quality}]+ba/b[height<=${quality}]/bv*+ba/b`
        : 'bv*+ba/b',
      '--merge-output-format', 'mp4',
    )
  }
  args.push('--print', 'after_move:filepath')

  running += 1
  try {
    let filePath = null
    await runYtDlpWithRetry(ytdlpArgs([...args, url]), (chunk) => {
      const lines = chunk.toString().split('\n')
      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed && fs.existsSync(trimmed)) filePath = trimmed
      }
    })

    if (!filePath || !fs.existsSync(filePath)) {
      const candidates = fs.readdirSync(jobDir)
      if (candidates.length === 0) throw new Error('Download produced no file')
      filePath = path.join(jobDir, candidates[0])
    }

    const fileName = path.basename(filePath)

    res.setHeader('Content-Type', audioOnly ? 'audio/mpeg' : 'video/mp4')
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`)
    res.setHeader('X-Download-Name', encodeURIComponent(fileName))

    const stream = fs.createReadStream(filePath)
    stream.pipe(res)
    const cleanup = () => fs.rmSync(jobDir, { recursive: true, force: true })
    stream.on('close', cleanup)
    res.on('close', cleanup)
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ error: error.message })
    } else {
      res.end()
    }
    fs.rmSync(jobDir, { recursive: true, force: true })
  } finally {
    running -= 1
    nextInQueue()
  }
})

setInterval(() => {
  fs.readdirSync(TMP_DIR).forEach((f) => {
    const full = path.join(TMP_DIR, f)
    fs.stat(full, (err, stats) => {
      if (!err && Date.now() - stats.mtimeMs > JOB_TTL_MS) {
        fs.unlink(full, () => {})
      }
    })
  })
}, 60 * 1000).unref()

app.listen(PORT, HOST, () => {
  console.log(`FileForge downloader ready on http://${HOST}:${PORT} (yt-dlp: ${YTDLP})`)
})
