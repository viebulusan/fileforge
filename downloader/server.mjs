import { spawn } from 'node:child_process'
import dns from 'node:dns/promises'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import os from 'node:os'
import express from 'express'
import cors from 'cors'

const PORT = Number(process.env.PORT) || 8787
const HOST = process.env.HOST ?? (process.env.PORT ? '0.0.0.0' : '127.0.0.1')

// ---- access control -------------------------------------------------------
// The hosted site calls this service straight from the browser, so the
// allowlist is what keeps strangers from borrowing our yt-dlp instance.
const ALLOWED_ORIGINS = new Set(
  [
    'https://fileforge-tawny.vercel.app',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    ...(process.env.EXTRA_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  ],
)

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for']
  if (typeof fwd === 'string' && fwd.trim()) return fwd.split(',')[0].trim()
  return req.socket?.remoteAddress || 'unknown'
}

// Small sliding-window limiter — enough to keep one IP from hogging jobs.
const WINDOW_MS = 60_000
const hitsByIp = new Map()
function rateLimited(req, max) {
  const now = Date.now()
  if (hitsByIp.size > 4000) hitsByIp.clear()
  const ip = clientIp(req)
  const recent = (hitsByIp.get(ip) ?? []).filter((t) => now - t < WINDOW_MS)
  if (recent.length >= max) {
    hitsByIp.set(ip, recent)
    return true
  }
  recent.push(now)
  hitsByIp.set(ip, recent)
  return false
}

// ---- SSRF guard -----------------------------------------------------------
// yt-dlp will happily fetch whatever it is told to. Never let a submitted URL
// name a loopback / private / link-local target.
function isPrivateIpv4(ip) {
  const [a, b] = ip.split('.').map(Number)
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  )
}
function isPrivateIp(ip) {
  if (net.isIP(ip) === 4) return isPrivateIpv4(ip)
  const lower = String(ip).toLowerCase()
  return (
    lower === '::' || lower === '::1' ||
    /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower) || /^ff/.test(lower) ||
    (() => { const m = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); return m ? isPrivateIpv4(m[1]) : false })()
  )
}
async function assertPublicUrl(rawUrl) {
  let url
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error('Invalid link.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http(s) links are supported.')
  }
  const host = url.hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '')
  if (!host || host === '*' || /(^|\.)(localhost|local|internal|intranet|lan)$/.test(host)) {
    throw new Error('That link points somewhere we are not allowed to go.')
  }
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error('That link points at a private network.')
    return url
  }
  try {
    const addrs = await dns.lookup(host, { all: true, verbatim: true })
    if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) {
      throw new Error('That link points at a private network.')
    }
  } catch (error) {
    if (error.message?.includes('private network')) throw error
    throw new Error('That link could not be resolved.')
  }
  return url
}

const VENV = path.join(import.meta.dirname, '.venv', 'bin', 'yt-dlp')
const YTDLP = process.env.YTDLP_BIN || (fs.existsSync(VENV) ? VENV : 'yt-dlp')

const TMP_DIR = path.join(os.tmpdir(), 'fileforge-downloads')
fs.mkdirSync(TMP_DIR, { recursive: true })

// Optional: paste a YouTube cookies.txt into the YT_COOKIES env var and every
// yt-dlp call will use it. This is the reliable fix when YouTube blocks
// datacenter IPs ("Sign in to confirm you're not a bot").
const COOKIES_FILE = process.env.YT_COOKIES
  ? path.join(os.tmpdir(), 'ff-youtube-cookies.txt')
  : null
if (COOKIES_FILE) {
  fs.writeFileSync(COOKIES_FILE, process.env.YT_COOKIES.replace(/\\n/g, '\n'))
}

function ytdlpArgs(args) {
  return [
    '--no-warnings',
    '--no-playlist',
    '--no-progress',
    '--socket-timeout', '20',
    '--retries', '3',
    ...(COOKIES_FILE ? ['--cookies', COOKIES_FILE] : []),
    ...args,
  ]
}

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

const app = express()
app.set('trust proxy', true)
app.use(
  cors({
    origin(origin, cb) {
      // Allow same-origin/no-origin tools (health checks) + the allowlist.
      if (!origin || ALLOWED_ORIGINS.has(origin)) return cb(null, true)
      cb(null, false)
    },
  }),
)
app.use(express.json({ limit: '16kb' }))

// Enforce the allowlist on every state-changing route: browsers always send
// Origin on cross-origin requests, so anything else is a non-browser client
// (curl, scripts) — those still pass but hit the per-IP rate limiter.
app.use((req, res, next) => {
  const origin = req.headers.origin
  if (req.method !== 'GET' && origin && !ALLOWED_ORIGINS.has(origin)) {
    return res.status(403).json({ error: 'Origin not allowed.' })
  }
  if (rateLimited(req, req.method === 'GET' ? 60 : req.path === '/api/download' ? 6 : 20)) {
    return res.status(429).json({ error: 'Too many requests — wait a minute.' })
  }
  next()
})

app.get('/api/debug-pot', async (req, res) => {
  const { spawn } = await import('node:child_process')
  const run = (argv) => new Promise((resolve) => {
    const proc = spawn(argv[0], argv.slice(1), { shell: false })
    let out = ''
    proc.stdout.on('data', (d) => { out += d })
    proc.stderr.on('data', (d) => { out += d })
    proc.on('error', (e) => { out += String(e) })
    proc.on('close', () => resolve(out))
  })
  let target
  try {
    target = await assertPublicUrl(String(req.query.url ?? 'https://youtu.be/O6nXrSheFdc'))
  } catch (error) {
    return res.status(400).json({ error: error.message })
  }
  const bgutilPing = await run(['curl', '-s', '-m', '5', 'http://127.0.0.1:4416/ping'])
  const clientSets = String(req.query.clients ?? 'default')
    .split(',').map((s) => s.trim()).filter(Boolean)
  const results = {}
  for (const set of clientSets) {
    const args = set === 'default'
      ? [...youtubeArgs()]
      : [...youtubeArgs(), '--extractor-args', `youtube:player_client=${set}`]
    const out = await run([YTDLP, '--no-warnings', '--simulate', '--print', '%(title)s', ...args, target.href])
    const ok = !/ERROR|Sign in/.test(out) && out.trim().length > 0
    results[set] = ok
      ? 'PASS: ' + out.trim().split('\n')[0].slice(0, 80)
      : out.split('\n').filter((l) => /ERROR|Sign in|reloaded|not available|challenge/i.test(l)).at(-1)?.slice(0, 110) ?? 'fail'
  }
  res.setHeader('content-type', 'text/plain; charset=utf-8')
  res.end('NODE: ' + NODE_BIN + '\nBGUTIL PING: ' + (bgutilPing || '(empty)').slice(0, 150) + '\n\nCLIENTS:\n' + JSON.stringify(results, null, 1))
})

app.get('/api/debug-verbose', async (_req, res) => {
  const url = 'https://youtu.be/O6nXrSheFdc'
  const out = await new Promise((resolve) => {
    const proc = spawn(YTDLP, ['-v', '--no-warnings', '--simulate', '--print', '%(title)s', ...youtubeArgs(), url], {})
    let all = ''
    proc.stdout.on('data', (d) => { all += d })
    proc.stderr.on('data', (d) => { all += d })
    proc.on('error', (e) => { all += String(e) })
    proc.on('close', () => resolve(all))
  })
  const keep = /pot|PO Token|token|player_client|player client|challenge|nsig|Signature|Sign in|not a bot|ERROR|Loading extractor|plugin|bgutil/i
  const lines = out.split('\n').filter((l) => keep.test(l))
  res.setHeader('content-type', 'text/plain; charset=utf-8')
  res.end('YTDLP VERSION:\n' + (out.match(/\[debug\] Command-line config.*|\[debug\] yt-dlp version[^\n]*/)?.[0] ?? '') + '\n\n' + lines.slice(0, 100).join('\n'))
})

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ytDlp: YTDLP })
})

app.post('/api/info', async (req, res) => {
  try {
    let url
    try {
      url = await assertPublicUrl(String(req.body?.url ?? '').trim())
    } catch (error) {
      return res.status(400).json({ error: error.message })
    }
    const raw = await runYtDlpWithRetry(ytdlpArgs(['-J', url.href]))
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
    url = await assertPublicUrl(String(req.body?.url ?? '').trim())
    quality = req.body?.quality ? parseInt(req.body.quality, 10) : null
    audioOnly = req.body?.audioOnly === true
  } catch (error) {
    return res.status(400).json({ error: error.message })
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
    await runYtDlpWithRetry(ytdlpArgs([...args, url.href]), (chunk) => {
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
