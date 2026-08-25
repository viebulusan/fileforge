// Shared YouTube session management. YouTube serves "degraded" player
// responses (no stream URLs) to datacenter IPs it distrusts — different
// innertube clients (TV, iOS, Android…) hit different backend paths, so we
// rotate until one returns a full player response.
import { Innertube } from 'youtubei.js'

// undefined = library default (WEB). Each entry is a separate session.
const CLIENTS = [undefined, 'TV', 'IOS', 'ANDROID', 'MWEB']

const sessions = new Map()

export function innertube(client) {
  const key = client ?? 'default'
  if (!sessions.has(key)) {
    sessions.set(
      key,
      Innertube.create(client ? { client } : {}).catch((error) => {
        sessions.delete(key)
        throw error
      }),
    )
  }
  return sessions.get(key)
}

export function videoIdOf(url) {
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

/** getInfo across clients until one returns usable streaming data.
 *  Returns { info, client } — the client must be reused for the download. */
export async function getInfoWithStreams(videoId) {
  let lastError = null
  for (const client of CLIENTS) {
    try {
      const yt = await innertube(client)
      const info = await yt.getInfo(videoId)
      const hasStreams =
        (info?.streaming_data?.adaptive_formats?.length ?? 0) > 0 ||
        (info?.streaming_data?.formats?.length ?? 0) > 0
      if (hasStreams) return { info, client }
      lastError = new Error('degraded player response')
    } catch (error) {
      lastError = error
    }
  }
  throw lastError ?? new Error('no client returned streaming data')
}

/** Download using the client that previously returned streaming data. */
export async function downloadWith(client, videoId, options) {
  const yt = await innertube(client)
  return yt.download(videoId, options)
}
