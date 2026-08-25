// Download a video-only stream + an audio stream and mux them into a single
// file with ffmpeg.wasm (-c copy — no re-encode, so it is fast). Used by the
// Download tab for high-quality options where the server can only provide
// separate video and audio streams. Also transcodes audio-only downloads to
// real MP3.
import { getFFmpeg } from './av.js'

async function streamToBlobs(jobs, onStage) {
  const results = []
  for (const job of jobs) {
    onStage?.(job.stage, 0)
    const res = await fetch(job.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(job.body),
    })
    if (!res.ok) {
      let message = `Request failed (${res.status})`
      try {
        const data = await res.json()
        if (data?.error) message = data.error
      } catch {}
      throw new Error(message)
    }
    const total = Number(res.headers.get('content-length')) || 0
    const reader = res.body.getReader()
    const chunks = []
    let received = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      received += value.length
      if (total > 0) onStage?.(job.stage, received / total)
    }
    results.push(new Blob(chunks, { type: job.type }))
  }
  return results
}

/** Mux with -c copy. Tries the preferred container, falls back to webm when
 *  the codecs (VP9/Opus) don't fit mp4. */
async function muxStreams(videoBlob, audioBlob, container, onStage) {
  const ffmpeg = await getFFmpeg()
  const videoName = container === 'webm' ? 'dl-video.webm' : 'dl-video.mp4'
  const audioName = container === 'webm' ? 'dl-audio.weba' : 'dl-audio.m4a'
  const outputName = `dl-merged.${container}`
  await ffmpeg.writeFile(videoName, new Uint8Array(await videoBlob.arrayBuffer()))
  await ffmpeg.writeFile(audioName, new Uint8Array(await audioBlob.arrayBuffer()))
  onStage?.('merging', 0)
  try {
    const copyArgs = (output) => [
      '-i', videoName,
      '-i', audioName,
      '-c', 'copy',
      '-map', '0:v:0',
      '-map', '1:a:0?',
      ...(output.endsWith('.mp4') ? ['-movflags', '+faststart'] : []),
      output,
    ]
    let code = await ffmpeg.exec(copyArgs(outputName))
    if (code !== 0 && container === 'mp4') {
      // mp4 copy rejected the codecs (VP9/Opus) — remux into webm instead.
      code = await ffmpeg.exec(copyArgs('dl-merged.webm'))
      if (code !== 0) {
        throw new Error('Merging failed — try a lower quality or the 360p option.')
      }
      const data = await ffmpeg.readFile('dl-merged.webm')
      return new Blob([data.buffer], { type: 'video/webm' })
    }
    if (code !== 0) throw new Error(`Merging failed (exit ${code}).`)
    const data = await ffmpeg.readFile(outputName)
    return new Blob([data.buffer], {
      type: container === 'webm' ? 'video/webm' : 'video/mp4',
    })
  } catch (error) {
    // ffmpeg.wasm sometimes rejects with non-Error values
    if (error instanceof Error) throw error
    throw new Error('Merging failed — try a lower quality or the 360p option.')
  } finally {
    for (const name of [videoName, audioName, 'dl-merged.mp4', 'dl-merged.webm']) {
      await ffmpeg.deleteFile(name).catch(() => {})
    }
  }
}

/**
 * Fetches the video and audio streams and merges them.
 * @param {Array} parts [{ url, body, type, stage }] — exactly two entries:
 *        [video, audio].
 * @param {string} container 'mp4' | 'webm' — follows the video codec.
 * @returns {Blob} the merged file
 */
export async function downloadAndMux(parts, onStage, container = 'mp4') {
  const [videoBlob, audioBlob] = await streamToBlobs(parts, onStage)
  return muxStreams(videoBlob, audioBlob, container, onStage)
}

/** Fetch one audio stream and transcode it to a real MP3 (192 kbps). */
export async function downloadAsMp3(part, onStage) {
  const [audioBlob] = await streamToBlobs([part], onStage)
  onStage?.('converting', 0)
  const ffmpeg = await getFFmpeg()
  const inName = part.type?.includes('webm') ? 'dl-audio.weba' : 'dl-audio.m4a'
  await ffmpeg.writeFile(inName, new Uint8Array(await audioBlob.arrayBuffer()))
  try {
    const code = await ffmpeg.exec([
      '-i', inName,
      '-vn',
      '-c:a', 'libmp3lame',
      '-b:a', '192k',
      'dl-out.mp3',
    ])
    if (code !== 0) {
      // Codec missing or stream odd — hand back the original audio instead.
      return audioBlob
    }
    const data = await ffmpeg.readFile('dl-out.mp3')
    return new Blob([data.buffer], { type: 'audio/mpeg' })
  } catch {
    return audioBlob
  } finally {
    await ffmpeg.deleteFile(inName).catch(() => {})
    await ffmpeg.deleteFile('dl-out.mp3').catch(() => {})
  }
}
