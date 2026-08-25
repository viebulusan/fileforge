const VIDEO_EXTS = [
  '.mp4', '.m4v', '.webm', '.mkv', '.mov', '.avi', '.wmv', '.flv',
  '.ts', '.ogv', '.3gp', '.mpg', '.mpeg',
]
const AUDIO_EXTS = [
  '.mp3', '.wav', '.m4a', '.aac', '.ogg', '.oga', '.opus', '.flac',
  '.wma', '.aiff', '.aif',
]

export function extOfAv(name) {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot).toLowerCase()
}

export function baseOfAv(name) {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? name : name.slice(0, dot)
}

export function acceptsAv(file) {
  const ext = extOfAv(file.name)
  return VIDEO_EXTS.includes(ext) || AUDIO_EXTS.includes(ext)
}

function isVideo(file) {
  return VIDEO_EXTS.includes(extOfAv(file.name))
}

// In-browser wasm encoding holds the file + the output in a ~2 GB heap, so
// real-world ceiling is well under the theoretical limit. Fail early with an
// honest message instead of an OOM crash halfway through.
const MAX_ENCODE_BYTES = 800 * 1024 * 1024

/** Peeks into an MP4/MOV container for the video codec FourCC (hvc1, avc1…).
 *  Scans the head and tail of the file — moov sits at either end. Returns
 *  null when nothing recognisable is found (webm, unknown, …). */
export async function detectVideoCodec(file) {
  const headSize = Math.min(file.size, 2 * 1024 * 1024)
  const tailSize = Math.min(file.size, 1024 * 1024)
  const buffers = [new Uint8Array(await file.slice(0, headSize).arrayBuffer())]
  if (file.size > headSize) {
    buffers.push(new Uint8Array(await file.slice(file.size - tailSize).arrayBuffer()))
  }
  const codecs = {
    hvc1: 'HEVC / H.265',
    hev1: 'HEVC / H.265',
    av01: 'AV1',
    avc1: 'H.264',
    vp09: 'VP9',
    vp08: 'VP8',
    mp4v: 'MPEG-4 Part 2',
  }
  const found = new Set()
  for (const bytes of buffers) {
    // FourCCs sit inside 4-byte length-prefixed boxes; scan every offset.
    for (let i = 4; i < bytes.length - 4; i += 1) {
      const tag = String.fromCharCode(bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3])
      if (codecs[tag]) found.add(tag)
    }
  }
  // Prefer the first match by decode-difficulty order.
  for (const tag of ['hvc1', 'hev1', 'av01', 'avc1', 'vp09', 'vp08', 'mp4v']) {
    if (found.has(tag)) return { fourcc: tag, name: codecs[tag] }
  }
  return null
}

export function outputsForAv(file) {
  const lossy = true
  if (isVideo(file)) {
    return [
      { id: 'mp4', label: 'MP4 · H.264', ext: '.mp4', lossy },
      { id: 'webm', label: 'WebM', ext: '.webm', lossy },
      { id: 'mkv', label: 'MKV', ext: '.mkv', lossy },
      { id: 'gif', label: 'Animated GIF', ext: '.gif', lossy },
      { id: 'strip-audio', label: 'Audio only (.mp3)', ext: '.mp3', lossy },
    ]
  }
  return [
    { id: 'mp3', label: 'MP3', ext: '.mp3', lossy },
    { id: 'wav', label: 'WAV', ext: '.wav', lossy: false },
    { id: 'm4a', label: 'M4A · AAC', ext: '.m4a', lossy },
    { id: 'ogg', label: 'OGG · Vorbis', ext: '.ogg', lossy },
    { id: 'flac', label: 'FLAC', ext: '.flac', lossy: false },
  ]
}

/* ---------- ffmpeg.wasm singleton ---------- */

import coreJsUrl from '@ffmpeg/core?url'
import coreWasmUrl from '@ffmpeg/core/wasm?url'

let ffmpegPromise = null
let lastLogLines = []

export async function getFFmpeg(onLog) {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const [{ FFmpeg }] = await Promise.all([
        import('@ffmpeg/ffmpeg'),
      ])
      const instance = new FFmpeg()
      if (onLog) instance.on('log', onLog)
      instance.on('log', ({ message }) => {
        lastLogLines.push(message)
        if (lastLogLines.length > 12) lastLogLines.shift()
      })
      instance.on('progress', ({ progress }) => {
        if (Number.isFinite(progress)) {
          window.dispatchEvent(
            new CustomEvent('ff-av-progress', { detail: { ratio: progress } }),
          )
        }
      })
      await instance.load({
        coreURL: coreJsUrl,
        wasmURL: coreWasmUrl,
      })
      return instance
    })().catch((error) => {
      ffmpegPromise = null
      throw error
    })
  }
  return ffmpegPromise
}

function crfFor(preset, map) {
  return map[preset] ?? map.balanced
}

function audioBitrateFor(preset, map) {
  return map[preset] ?? map.balanced
}

const MP4_CRF = { high: '20', balanced: '24', compact: '29' }
const WEBM_CRF = { high: '31', balanced: '34', compact: '38' }
const MP3_KBPS = { high: '320k', balanced: '192k', compact: '128k' }
const AAC_KBPS = { high: '256k', balanced: '160k', compact: '112k' }
const OGG_Q = { high: '8', balanced: '5', compact: '3' }

function argsFor(target, preset, inputName, outputName) {
  switch (target.id) {
    case 'mp4':
      return [
        '-i', inputName,
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', crfFor(preset, MP4_CRF),
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', audioBitrateFor(preset, AAC_KBPS),
        '-movflags', '+faststart',
        outputName,
      ]
    case 'webm':
      return [
        '-i', inputName,
        '-c:v', 'libvpx', '-crf', crfFor(preset, WEBM_CRF), '-b:v', '0',
        '-c:a', 'libopus', '-b:a', audioBitrateFor(preset, AAC_KBPS),
        outputName,
      ]
    case 'mkv':
      return [
        '-i', inputName,
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', crfFor(preset, MP4_CRF),
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', audioBitrateFor(preset, AAC_KBPS),
        outputName,
      ]
    case 'gif':
      return [
        '-i', inputName,
        '-vf', 'fps=12,scale=480:-2:flags=lanczos',
        '-loop', '0',
        outputName,
      ]
    case 'strip-audio':
    case 'mp3':
      return ['-i', inputName, '-vn', '-c:a', 'libmp3lame', '-b:a', crfFor(preset, MP3_KBPS), outputName]
    case 'wav':
      return ['-i', inputName, '-vn', '-c:a', 'pcm_s16le', outputName]
    case 'm4a':
      return ['-i', inputName, '-vn', '-c:a', 'aac', '-b:a', crfFor(preset, AAC_KBPS), outputName]
    case 'ogg':
      return ['-i', inputName, '-vn', '-c:a', 'libvorbis', '-q:a', crfFor(preset, OGG_Q), outputName]
    case 'flac':
      return ['-i', inputName, '-vn', '-c:a', 'flac', outputName]
    default:
      throw new Error(`Unsupported target ${target.id}`)
  }
}

export async function convertAv(file, target, preset) {
  const ffmpeg = await getFFmpeg()
  const safeIn = `in${extOfAv(file.name)}`
  const safeOut = `out${target.ext}`
  if (isVideo(file) && file.size > MAX_ENCODE_BYTES) {
    throw new Error(
      `Videos over ${Math.round(MAX_ENCODE_BYTES / 1024 / 1024)} MB can't be re-encoded inside the browser (the encoder holds the file and the result in memory). Trim the clip, or use the Download tab's merge for YouTube videos.`,
    )
  }
  // Detect HEVC/AV1 up front — the wasm encoder can't decode them, and a
  // precise message beats a generic failure after minutes of work.
  let codec = null
  if (isVideo(file) && ['.mp4', '.mov', '.m4v'].includes(extOfAv(file.name))) {
    try {
      codec = await detectVideoCodec(file)
    } catch {
      /* sniffing is best-effort */
    }
    if (codec && (codec.fourcc === 'hvc1' || codec.fourcc === 'hev1')) {
      throw new Error(
        'This video is HEVC (H.265) — usually iPhone/Android camera footage. The in-browser encoder can\'t decode HEVC. Re-encode it to H.264 first (e.g. phone export setting "Most Compatible"), then convert here.',
      )
    }
    if (codec && codec.fourcc === 'av01') {
      throw new Error(
        'This video is AV1 — the in-browser encoder can\'t decode AV1 yet. Re-encode it to H.264 MP4 first, then convert here.',
      )
    }
  }
  try {
    await ffmpeg.writeFile(safeIn, new Uint8Array(await file.arrayBuffer()))
    let code
    try {
      code = await ffmpeg.exec(argsFor(target, preset ?? 'balanced', safeIn, safeOut))
    } catch (execError) {
      // ffmpeg.wasm sometimes rejects with non-Error values (worker death,
      // OOM aborts). Normalise so the UI always has something honest to show.
      const raw = typeof execError === 'string' ? execError : execError?.message ?? ''
      if (/memory|abort|allocat|out of/i.test(raw)) {
        throw new Error(
          'This file ran out of the browser encoder\'s memory — trim it, pick the compact preset, or use a smaller file.',
        )
      }
      throw new Error(
        raw
          ? `The encoder could not process this file (${raw.slice(0, 120)}).`
          : 'The in-browser encoder crashed on this file — try another format or a smaller clip.',
      )
    }
    if (code !== 0) {
      if (code === 1 && isVideo(file)) {
        const hint = codec ? ` Detected codec: ${codec.name}.` : ''
        throw new Error(
          `This video's codec isn't supported by the in-browser encoder.${hint} Common with HEVC/iPhone footage — re-encode the source to H.264 MP4 first.`,
        )
      }
      throw new Error(`Encoder exited with code ${code} — this file may use an unsupported codec.`)
    }
    const data = await ffmpeg.readFile(safeOut)
    if (!data || data.length === 0) {
      throw new Error('The encoder produced no output for this file.')
    }
    const type =
      target.ext === '.mp4'
        ? 'video/mp4'
        : target.ext === '.webm'
          ? 'video/webm'
          : target.ext === '.mkv'
            ? 'video/x-matroska'
            : target.ext === '.gif'
              ? 'image/gif'
              : target.ext === '.wav'
                ? 'audio/wav'
                : target.ext === '.ogg'
                  ? 'audio/ogg'
                  : target.ext === '.m4a'
                    ? 'audio/mp4'
                    : target.ext === '.flac'
                      ? 'audio/flac'
                      : 'audio/mpeg'
    return new Blob([data.buffer], { type })
  } catch (error) {
    if (error instanceof Error) throw error
    const raw = typeof error === 'string' ? error : ''
    if (/memory|abort|allocat/i.test(raw)) {
      throw new Error(
        'This file is too large for in-browser encoding — try a shorter or smaller one.',
      )
    }
    throw new Error(
      raw
        ? `Conversion failed: ${raw.slice(0, 140)}`
        : 'Conversion failed — the encoder could not handle this file.',
    )
  } finally {
    await ffmpeg.deleteFile(safeIn).catch(() => {})
    await ffmpeg.deleteFile(safeOut).catch(() => {})
  }
}

/* ---------- download helpers: merge video+audio, audio → mp3 ---------- */

/** Stream-copy merge (no re-encode — fast). Container follows the video:
 *  mp4 for AVC, webm for VP9/VP8. Falls back to webm if mp4 copy fails. */
export async function mergeVideoAudio(videoBlob, audioBlob, { container = 'mp4' } = {}) {
  const ffmpeg = await getFFmpeg()
  const videoExt = container === 'webm' ? '.webm' : '.mp4'
  const audioExt = container === 'webm' ? '.weba' : '.m4a'
  const outName = `merged.${container}`
  await ffmpeg.writeFile(`dl-video${videoExt}`, new Uint8Array(await videoBlob.arrayBuffer()))
  await ffmpeg.writeFile(`dl-audio${audioExt}`, new Uint8Array(await audioBlob.arrayBuffer()))
  try {
    const run = (output) =>
      ffmpeg.exec([
        '-i', `dl-video${videoExt}`,
        '-i', `dl-audio${audioExt}`,
        '-c', 'copy',
        '-map', '0:v:0',
        '-map', '1:a:0?',
        '-movflags', '+faststart',
        output,
      ])
    let code = await run(outName)
    if (code !== 0 && container === 'mp4') {
      // mp4 copy rejected the codecs — remux into webm instead.
      code = await ffmpeg.exec([
        '-i', `dl-video${videoExt}`,
        '-i', `dl-audio${audioExt}`,
        '-c', 'copy',
        '-map', '0:v:0',
        '-map', '1:a:0?',
        'merged.webm',
      ])
      if (code === 0) {
        const data = await ffmpeg.readFile('merged.webm')
        return new Blob([data.buffer], { type: 'video/webm' })
      }
      throw new Error('The video and audio streams could not be merged — try the 360p option.')
    }
    if (code !== 0) throw new Error(`Merge failed (exit ${code}).`)
    const data = await ffmpeg.readFile(outName)
    return new Blob([data.buffer], { type: container === 'webm' ? 'video/webm' : 'video/mp4' })
  } finally {
    for (const name of [`dl-video${videoExt}`, `dl-audio${audioExt}`, 'merged.mp4', 'merged.webm']) {
      await ffmpeg.deleteFile(name).catch(() => {})
    }
  }
}

/** Transcode a downloaded audio stream (opus/m4a) to a real MP3. */
export async function audioToMp3(audioBlob) {
  const ffmpeg = await getFFmpeg()
  const inName = `dl-audio${audioBlob.type?.includes('webm') ? '.weba' : '.m4a'}`
  await ffmpeg.writeFile(inName, new Uint8Array(await audioBlob.arrayBuffer()))
  try {
    const code = await ffmpeg.exec(['-i', inName, '-vn', '-c:a', 'libmp3lame', '-b:a', '192k', 'dl-out.mp3'])
    if (code !== 0) throw new Error(`audio conversion failed (${code})`)
    const data = await ffmpeg.readFile('dl-out.mp3')
    return new Blob([data.buffer], { type: 'audio/mpeg' })
  } finally {
    await ffmpeg.deleteFile(inName).catch(() => {})
    await ffmpeg.deleteFile('dl-out.mp3').catch(() => {})
  }
}
