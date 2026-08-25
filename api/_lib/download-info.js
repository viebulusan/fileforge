// Hosted media info + streaming. Best-effort: platforms actively fight
// server-side downloads, so failures surface as clear errors the UI can show.
// YouTube goes through YouTube.js (innertube), which keeps up with the
// platform's player changes far better than the abandoned ytdl-core.
import { Innertube } from 'youtubei.js'
import { readJsonBody, sendJson } from './pro.js'
import { clientIp, rateLimited } from './ratelimit.js'

const DIRECT_FILE_RE = /\.(mp4|webm|mkv|mov|m4v|mp3|m4a|wav|ogg|flac|aac)(\?|$)/i
const YT_HOST_RE = /(^|\.)youtube\.com$|^youtu\.be$/

function isDirectFile(url) {
  return DIRECT_FILE_RE.test(url)
}

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

// One shared innertube session per client type per serverless instance
// (cheap to reuse, expensive to create: it fetches player config on first
// use). YouTube serves degraded, empty responses to IPs it dislikes — a
// different client (TV/IOS) often gets a full player response where the
// default web client gets nothing.
const CLIENTS = [undefined, 'TV', 'IOS', 'ANDROID']
const ytSessions = new Map()

function innertube(client) {
  const key = client ?? 'default'
  if (!ytSessions.has(key)) {
    ytSessions.set(
      key,
      Innertube.create(client ? { client } : {}).catch((error) => {
        ytSessions.delete(key)
        throw error
      }),
    )
  }
  return ytSessions.get(key)
}

/** Tries every client until one returns a usable player response. */
export async function getUsableInfo(videoId) {
  let lastInfo = null
  let lastError = null
  for (const client of CLIENTS) {
    try {
      const yt = await innertube(client)
      const info = await yt.getInfo(videoId)
      const hasFormats =
        (info?.streaming_data?.adaptive_formats?.length ?? 0) +
          (info?.streaming_data?.formats?.length ?? 0) >
        0
      if (info?.basic_info?.title && hasFormats) return info
      if (!lastInfo && info?.basic_info?.title) lastInfo = info
      lastError = new Error('degraded player response')
    } catch (error) {
      lastError = error
    }
  }
  if (lastInfo) return lastInfo // metadata-only — better than nothing
  throw lastError ?? new Error('could not read that video')
}

function qualityLabel(format) {
  const parts = []
  if (format.height) parts.push(`${format.height}p`)
  if (format.fps && format.fps > 30) parts.push(`${format.fps}fps`)
  return parts.join(' ') || 'auto'
}

function parseDuration(seconds) {
  const n = Number(seconds)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0
}

function bestThumbnail(info) {
  const thumbs = info?.basic_info?.thumbnail?.filter?.((t) => t.url) ?? []
  return thumbs.at(-1)?.url ?? null
}

/** Maps innertube formats onto the quality list the UI renders. */
function qualityList(info) {
  const adaptive = info?.streaming_data?.adaptive_formats ?? []
  const progressive = info?.streaming_data?.formats ?? []
  const qualities = []
  const seen = new Set()

  // Every video format, highest first. Progressive formats (video+audio in
  // one container) download directly; video-only ones get their audio merged
  // in the browser with ffmpeg.wasm, so all heights up to 4K are offered.
  const videoFormats = [...progressive, ...adaptive].filter((f) => f.has_video)
  for (const f of videoFormats.sort((a, b) => (b.height ?? 0) - (a.height ?? 0))) {
    if (!f.height || seen.has(f.height)) continue
    seen.add(f.height)
    const id = f.has_audio ? `p-${f.itag}` : `v-${f.itag}`
    qualities.push({
      id,
      itag: String(f.itag),
      label: qualityLabel(f),
      audio: false,
      videoOnly: !f.has_audio,
      height: f.height,
    })
  }
  for (const f of adaptive
    .filter((f) => f.has_audio && !f.has_video)
    .sort((a, b) => (b.average_bitrate ?? b.bitrate ?? 0) - (a.average_bitrate ?? a.bitrate ?? 0))
    .slice(0, 2)) {
    qualities.push({
      id: `a-${f.itag}`,
      itag: String(f.itag),
      label: `mp3 · ${Math.round((f.average_bitrate ?? f.bitrate ?? 0) / 1000)} kbps`,
      audio: true,
    })
  }
  return qualities
}

export async function downloadInfo(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed.' })
  }
  if (rateLimited(`dl-info:${clientIp(req)}`, 12)) {
    return sendJson(res, 429, { error: 'Too many lookups — wait a moment.' })
  }

  let rawUrl = ''
  if (req.method === 'POST') {
    const body = await readJsonBody(req, 8_000)
    rawUrl = typeof body?.url === 'string' ? body.url.trim() : ''
  } else {
    rawUrl = new URL(req.url, 'http://x').searchParams.get('url')?.trim() ?? ''
  }
  if (!rawUrl) return sendJson(res, 400, { error: 'Paste a link first.' })

  let url
  try {
    url = new URL(rawUrl)
    if (!/^https?:$/.test(url.protocol)) throw new Error('protocol')
  } catch {
    return sendJson(res, 400, { error: 'That does not look like a valid link.' })
  }

  // Direct file links always work — plain pass-through metadata.
  if (isDirectFile(url.pathname)) {
    const name = decodeURIComponent(url.pathname.split('/').pop() ?? 'file')
    return sendJson(res, 200, {
      title: name.replace(DIRECT_FILE_RE, ''),
      uploader: url.hostname,
      extractor: 'direct link',
      duration: 0,
      thumbnail: null,
      hasAudio: true,
      direct: true,
      qualities: [{ id: 'direct', label: 'original file', audio: false }],
    })
  }

  const host = url.hostname.replace(/^www\./, '')
  if (!YT_HOST_RE.test(host)) {
    return sendJson(res, 422, {
      error:
        'Hosted downloads cover YouTube and direct file links. For Facebook, Instagram and other sites run the desktop companion and connect below.',
      kind: 'unsupported',
    })
  }

  const videoId = videoIdOf(url)
  if (!videoId) {
    return sendJson(res, 422, { error: 'That link does not contain a YouTube video ID.' })
  }

  try {
    const info = await getUsableInfo(videoId)
    const details = info?.basic_info ?? {}
    const qualities = qualityList(info)
    // Best audio-only itag — the client pairs it with a video-only stream
    // when merging high qualities in the browser.
    const bestAudio = (info?.streaming_data?.adaptive_formats ?? [])
      .filter((f) => f.has_audio && !f.has_video)
      .sort((a, b) => (b.average_bitrate ?? b.bitrate ?? 0) - (a.average_bitrate ?? a.bitrate ?? 0))[0]
    sendJson(res, 200, {
      title: details.title ?? 'media',
      uploader: details.author ?? null,
      extractor: 'youtube',
      duration: parseDuration(details.duration),
      thumbnail: bestThumbnail(info),
      hasAudio: true,
      audioItag: bestAudio ? String(bestAudio.itag) : null,
      qualities:
        qualities.length > 0
          ? qualities
          : [{ id: 'a-auto', label: 'audio', audio: true }],
    })
  } catch (error) {
    console.error('[download/info]', error?.message?.slice(0, 200))
    // Metadata fallback: YouTube's keyless oEmbed endpoint almost always
    // answers even when the player API is refused — the user still sees the
    // title + thumbnail instead of a dead end.
    try {
      const oembed = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`,
        { signal: AbortSignal.timeout(10_000) },
      )
      if (oembed.ok) {
        const meta = await oembed.json()
        return sendJson(res, 200, {
          title: meta.title ?? 'media',
          uploader: meta.author_name ?? null,
          extractor: 'youtube',
          duration: 0,
          thumbnail: meta.thumbnail_url ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          hasAudio: true,
          audioItag: null,
          qualities: [{ id: 'a-auto', label: 'audio · auto', audio: true }],
          metadataOnly: true,
        })
      }
    } catch {
      /* fall through to the error */
    }
    sendJson(res, 502, {
      error:
        'Could not read that YouTube link — the platform is refusing this server right now. Expand "run the desktop companion" below to download through your own connection instead.',
      kind: 'blocked',
    })
  }
}
