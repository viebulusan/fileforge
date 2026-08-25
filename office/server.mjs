import { spawn } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'

const PORT = Number(process.env.PORT) || 8789
const HOST = process.env.HOST || '127.0.0.1'
const SOFFICE = process.env.SOFFICE_BIN || 'soffice'

const TMP_DIR = path.join(os.tmpdir(), 'fileforge-office')
fs.mkdirSync(TMP_DIR, { recursive: true })

const MAX_BODY = 200 * 1024 * 1024
const CONVERT_TIMEOUT_MS = 90_000
const MAX_JOBS = 2

let running = 0
const queue = []

function nextInQueue() {
  if (running >= MAX_JOBS || queue.length === 0) return
  running += 1
  const job = queue.shift()
  job().finally(() => {
    running -= 1
    nextInQueue()
  })
}

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Filename')
  res.setHeader('Access-Control-Max-Age', '86400')
}

function sendJson(res, status, payload) {
  setCORS(res)
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(payload))
}

function runSoffice(inputPath, outDir, profileDir) {
  return new Promise((resolve, reject) => {
    const args = [
      '--headless',
      '--norestore',
      '--nolockcheck',
      '--nodefault',
      `-env:UserInstallation=file://${profileDir}`,
      '--convert-to',
      'pdf',
      '--outdir',
      outDir,
      inputPath,
    ]
    const child = spawn(SOFFICE, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    child.stderr.on('data', (c) => {
      err += c
      if (err.length > 4000) err = err.slice(-2000)
    })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error('LibreOffice conversion timed out'))
    }, CONVERT_TIMEOUT_MS)
    child.on('error', (e) => {
      clearTimeout(timer)
      reject(e)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(`soffice exited ${code}${err ? `: ${err.trim()}` : ''}`))
    })
  })
}

async function convertToPdf(bodyBuffer, filename) {
  const safeName = path.basename(filename || 'document') || 'document'
  if (!/\.[a-z0-9]{2,5}$/i.test(safeName)) {
    throw new Error('Filename must keep its extension (e.g. report.docx)')
  }
  const jobId = crypto.randomUUID()
  const jobDir = path.join(TMP_DIR, jobId)
  const profileDir = path.join(jobDir, 'profile')
  await fsp.mkdir(profileDir, { recursive: true })
  const inputPath = path.join(jobDir, safeName)

  let result
  try {
    await fsp.writeFile(inputPath, bodyBuffer)
    await runSoffice(inputPath, jobDir, profileDir)
    const expected = path.join(jobDir, `${path.basename(safeName, path.extname(safeName))}.pdf`)
    const pdf = await fsp.readFile(expected)
    result = { buffer: pdf }
  } finally {
    fsp.rm(jobDir, { recursive: true, force: true }).catch(() => {})
  }
  return result.buffer
}

let sofficeAvailable = null
async function checkSoffice() {
  if (sofficeAvailable !== null) return sofficeAvailable
  sofficeAvailable = await new Promise((resolve) => {
    const child = spawn(SOFFICE, ['--version'], { stdio: 'ignore' })
    child.on('error', () => resolve(false))
    child.on('close', (code) => resolve(code === 0))
  })
  return sofficeAvailable
}

// --- originality phrase check (used by the writing tools page) ---

let searchInflight = 0
const searchQueue = []

async function searchPhrase(phrase) {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(`"${phrase}"`)}&count=10`
  const res = await fetch(url, {
    headers: {
      'user-agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      'accept-language': 'en-US,en;q=0.9',
      accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`search failed (${res.status})`)
  const html = await res.text()

  // Organic results live in <li class="b_algo"> blocks. Bing loosely falls
  // back to fuzzy matches for rare phrases, so a hit only counts when the
  // exact phrase appears inside a result block — not just anywhere on the page.
  const blocks = html.match(/<li class="b_algo"[\s\S]*?<\/li>/g) ?? []
  const needle = phrase
    .toLowerCase()
    .replace(/["“”']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  let hits = 0
  for (const block of blocks) {
    const text = block.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').toLowerCase()
    if (text.includes(needle)) hits += 1
  }
  if (blocks.length === 0 && /captcha|challenge|verify/i.test(html)) {
    throw new Error('search engine served a bot challenge')
  }
  return hits
}

function queuedSearch(phrase) {
  return new Promise((resolve, reject) => {
    const task = async () => {
      try {
        resolve(await searchPhrase(phrase))
      } catch (error) {
        reject(error)
      } finally {
        searchInflight -= 1
        if (searchQueue.length > 0) searchQueue.shift()()
      }
    }
    if (searchInflight >= 2) searchQueue.push(task)
    else {
      searchInflight += 1
      task()
    }
  })
}

// --- http plumbing ---

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        req.destroy()
        reject(new Error('Payload too large'))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)

  if (req.method === 'OPTIONS') {
    setCORS(res)
    res.writeHead(204)
    res.end()
    return
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJson(res, 200, { ok: true, soffice: await checkSoffice() })
  }

  if (req.method === 'GET' && url.pathname === '/check') {
    const phrase = (url.searchParams.get('q') ?? '').trim()
    if (!phrase || phrase.length < 8) {
      return sendJson(res, 400, { error: 'Provide a q= phrase of at least 8 characters.' })
    }
    try {
      const hits = await queuedSearch(phrase)
      return sendJson(res, 200, { phrase, hits })
    } catch (error) {
      console.error('check failed:', error.message)
      return sendJson(res, 502, { error: 'Web check failed — no internet or blocked.' })
    }
  }

  if (req.method === 'POST' && url.pathname === '/convert') {
    if (!(await checkSoffice())) {
      return sendJson(res, 503, { error: 'LibreOffice is not available on this machine.' })
    }
    const filename = decodeURIComponent(req.headers['x-filename'] ?? '')
    try {
      const body = await readBody(req, MAX_BODY)
      if (body.length === 0) return sendJson(res, 400, { error: 'Empty upload.' })

      const task = async () => {
        try {
          const pdf = await convertToPdf(body, filename)
          setCORS(res)
          res.writeHead(200, {
            'Content-Type': 'application/pdf',
            'Content-Length': pdf.length,
            'X-Output-Name': encodeURIComponent(
              `${path.basename(filename, path.extname(filename))}.pdf`,
            ),
          })
          res.end(pdf)
        } catch (error) {
          console.error('convert failed:', error.message)
          sendJson(res, 500, { error: error.message || 'Conversion failed.' })
        }
      }

      if (running >= MAX_JOBS) queue.push(task)
      else {
        running += 1
        task().finally(() => {
          running -= 1
          nextInQueue()
        })
      }
    } catch (error) {
      return sendJson(res, error.message === 'Payload too large' ? 413 : 500, {
        error: error.message,
      })
    }
    return
  }

  return sendJson(res, 404, { error: 'Not found' })
})

server.listen(PORT, HOST, () => {
  console.log(`FileForge office service on http://${HOST}:${PORT}`)
})
