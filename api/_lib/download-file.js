// Streams the chosen media through to the browser. YouTube via YouTube.js
// (innertube), direct file links via plain pass-through. Requires a signed-in
// allowance. YouTube.js deciphers the stream server-side and hands us a
// readable Web Stream.
import { readJsonBody, sameOrigin, sendJson, sessionUser } from './pro.js'
import { clientIp, rateLimited } from './ratelimit.js'
import { TESTING_UNLOCK_ALL, consumeToolUse, refundToolUse } from './usage.js'
import { getUsableInfo } from './download-info.js'

const DIRECT_FILE_RE = /\.(mp4|webm|mkv|mov|m4v|mp3|m4a|wav|ogg|flac|aac)(\?|$)/i
const YT_HOST_RE = /(^|\.)youtube\.com$|^youtu\.be$/

function videoIdOf(url) {
  // Every YouTube URL shape: youtu.be/ID, ?v=ID, /shorts/ID, /embed/ID,
  // /live/ID, /v/ID — mobile shares mostly use shorts or youtu.be.
  if (url.hostname === 'youtu.be') {
    return url.pathname.slice(1).split('/')[0] ?? ''
  }
  const v = url.searchParams.get('v')
  if (v) return v
  const match = url.pathname.match(/\/(shorts|embed|live|v)\/([\w-]{5,})/)
  return match?.[2] ?? ''
}

function sanitizeName(name) {
  return name.replace(/[^\w .-]+/g, '_').slice(0, 120) || 'download'
}

function mimeOf(format, fallback) {
  const raw = String(format?.mime_type ?? '')
  const base = raw.split(';')[0].trim()
  return base || fallback
}

async function youtubeStream(url, { quality, audioOnly, partVideo }) {
  const info = await getUsableInfo(videoIdOf(url))
  const adaptive = info?.streaming_data?.adaptive_formats ?? []
  const progressive = info?.streaming_data?.formats ?? []

  let format = null
  let mime = audioOnly ? 'audio/mpeg' : 'video/mp4'

  if (partVideo) {
    // Raw video-only stream for a client-side merge — no transcoding.
    const itag = Number(String(quality).replace(/^v-/, ''))
    format = [...adaptive, ...progressive].find((f) => f.itag === itag && f.has_video)
    if (!format) throw new Error('That quality is no longer available — fetch the link again.')
    mime = mimeOf(format, 'video/mp4')
  } else if (audioOnly) {
    const itag = Number(String(quality).replace(/^a-/, ''))
    format =
      [...adaptive, ...progressive].find((f) => f.itag === itag && f.has_audio && !f.has_video) ??
      null
    if (format) {
      mime = mimeOf(format, 'audio/mp4')
    } else if (!quality || quality === 'a-auto') {
      format = { has_audio: true }
      mime = 'audio/mpeg'
    } else {
      throw new Error('That audio quality is no longer available — fetch the link again.')
    }
  } else if (typeof quality === 'string' && quality.startsWith('p-')) {
    // Progressive format: video+audio in one container.
    const itag = Number(quality.slice(2))
    format = progressive.find((f) => f.itag === itag)
    if (format) mime = mimeOf(format, 'video/mp4')
  }

  let stream
  if (format) {
    stream = await info.download(format)
  } else if (audioOnly) {
    stream = await info.download({ type: 'audio', quality: 'best', format: 'mp4' })
  } else {
    stream = await info.download({ type: 'video+audio', quality: 'best', format: 'mp4' })
  }

  const details = info.basic_info ?? {}
  return { stream, title: details.title ?? 'youtube', duration: Number(details.duration ?? 0), mime }
}

export async function downloadFile(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed.' })
  }
  if (!sameOrigin(req)) {
    return sendJson(res, 403, { error: 'Cross-site requests are not allowed.' })
  }
  if (rateLimited(`dl-file:${clientIp(req)}`, 8)) {
    return sendJson(res, 429, { error: 'Too many downloads — wait a moment.' })
  }

  const user = await sessionUser(req)
  if (!user) return sendJson(res, 401, { error: 'Sign in to download.' })

  const body = await readJsonBody(req, 8_000)
  let url
  try {
    url = new URL(typeof body?.url === 'string' ? body.url.trim() : '')
    if (!/^https?:$/.test(url.protocol)) throw new Error()
  } catch {
    return sendJson(res, 400, { error: 'Invalid link.' })
  }

  const audioOnly = body?.audioOnly === true
  const quality = typeof body?.quality === 'string' ? body.quality : ''

  // Direct file: pure pass-through. Fetch first so a dead link never burns
  // one of the free downloads.
  if (DIRECT_FILE_RE.test(url.pathname)) {
    const upstream = await fetch(url, { signal: AbortSignal.timeout(55_000) })
    if (!upstream.ok || !upstream.body) {
      return sendJson(res, 502, { error: `Could not fetch that link (${upstream.status}).` })
    }
    if (!TESTING_UNLOCK_ALL) {
      const consumed = await consumeToolUse(user, 'download')
      if (!consumed.ok) {
        return sendJson(res, 402, {
          error: `You've used your ${consumed.limit} free downloads — upgrade to Pro for unlimited.`,
          limit: consumed.limit,
        })
      }
    }
    const name = sanitizeName(decodeURIComponent(url.pathname.split('/').pop() ?? 'file'))
    res.statusCode = 200
    res.setHeader('content-type', upstream.headers.get('content-type') ?? 'application/octet-stream')
    const length = upstream.headers.get('content-length')
    if (length) res.setHeader('content-length', length)
    res.setHeader('x-download-name', encodeURIComponent(name))
    const reader = upstream.body.getReader()
    req.on('close', () => reader.cancel().catch(() => {}))
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        res.write(Buffer.from(value))
      }
      res.end()
    } catch {
      res.destroy()
    }
    return
  }

  if (!YT_HOST_RE.test(url.hostname.replace(/^www\./, ''))) {
    return sendJson(res, 422, { error: 'Only YouTube and direct links are supported hosted.' })
  }

  // Part mode: the browser fetches the video-only and audio streams
  // separately and merges them locally with ffmpeg.wasm. Parts never consume
  // the allowance — the client records ONE use after the merge succeeds.
  const part = body?.part === 'video' || body?.part === 'audio' ? body.part : null
  let consumed = { ok: true, unlimited: true }
  if (!part && !TESTING_UNLOCK_ALL) {
    // Consume the allowance up front; refund if the stream dies before any
    // byte reaches the browser, so failed attempts stay free.
    consumed = await consumeToolUse(user, 'download')
    if (!consumed.ok) {
      return sendJson(res, 402, {
        error: `You've used your ${consumed.limit} free downloads — upgrade to Pro for unlimited.`,
        used: consumed.used,
        limit: consumed.limit,
      })
    }
  }

  let wrote = false
  try {
    const { stream, title, mime } = await youtubeStream(url, {
      quality,
      audioOnly: part ? part === 'audio' : audioOnly,
      partVideo: part === 'video',
    })
    const name =
      sanitizeName(title) +
      (part
        ? part === 'audio'
          ? `.audio.${mime.includes('webm') ? 'webm' : 'm4a'}`
          : `.video.${mime.includes('webm') ? 'webm' : 'mp4'}`
        : audioOnly
          ? '.mp3'
          : '.mp4')

    res.statusCode = 200
    res.setHeader('content-type', mime)
    res.setHeader('x-download-name', encodeURIComponent(name))

    // youtubei.js hands back a Node Readable; feature-detect for the Web
    // variant so both shapes work.
    if (typeof stream.getReader === 'function') {
      const reader = stream.getReader()
      req.on('close', () => reader.cancel().catch(() => {}))
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        wrote = true
        res.write(Buffer.from(value))
      }
      res.end()
    } else {
      stream.on('data', () => {
        wrote = true
      })
      req.on('close', () => stream.destroy())
      stream.on('error', (streamError) => {
        console.error('[download/file] stream:', streamError?.message?.slice(0, 160))
        if (!wrote && !consumed.unlimited) void refundToolUse(user, 'download')
        if (!res.headersSent) {
          sendJson(res, 502, {
            error:
              'The platform blocked this download — try again shortly, or use the desktop companion, which downloads through your own connection.',
          })
        } else {
          res.destroy()
        }
      })
      stream.pipe(res)
    }
  } catch (error) {
    console.error('[download/file]', error?.message?.slice(0, 200))
    if (!wrote && !consumed.unlimited) void refundToolUse(user, 'download')
    if (!res.headersSent) {
      sendJson(res, 502, {
        error:
          'The platform blocked this download — try again shortly, or use the desktop companion, which downloads through your own connection.',
      })
    } else {
      res.destroy()
    }
  }
}
