import { detectImageEncoders } from './capabilities.js'

let worker = null
let nextId = 1
const pending = new Map()

function getWorker() {
  if (!worker) {
    worker = new Worker(
      new URL('../../workers/image.worker.js', import.meta.url),
      { type: 'module' },
    )
    worker.onmessage = (event) => {
      const { id, ok, buffer, mime, error } = event.data
      const job = pending.get(id)
      if (!job) return
      pending.delete(id)
      if (ok) {
        job.resolve(new Blob([buffer], { type: mime }))
      } else {
        job.reject(new Error(error))
      }
    }
  }
  return worker
}

async function runInWorker(file, target, quality) {
  const buffer = await file.arrayBuffer()
  return new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    getWorker().postMessage(
      {
        id,
        buffer,
        mime: target.mime,
        quality: target.lossy ? quality : undefined,
        kind: target.id,
      },
      [buffer],
    )
  })
}

async function loadViaImageElement(file) {
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    await new Promise((resolve, reject) => {
      image.onload = resolve
      image.onerror = () => reject(new Error('Could not read this SVG'))
      image.src = url
    })
    const width = image.naturalWidth || 1024
    const height = image.naturalHeight || 1024
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d')?.drawImage(image, 0, 0, width, height)
    return canvas
  } finally {
    URL.revokeObjectURL(url)
  }
}

function canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Encoding failed'))),
      mime,
      quality,
    ),
  )
}

async function decodeHeic(file, targetMime, quality) {
  const { default: heic2any } = await import('heic2any')
  const result = await heic2any({ blob: file, toType: targetMime, quality })
  return Array.isArray(result) ? result[0] : result
}

export function extOf(name) {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot).toLowerCase()
}

export function baseOf(name) {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? name : name.slice(0, dot)
}

const TARGETS = [
  { id: 'png', label: 'PNG', ext: '.png', mime: 'image/png', lossy: false },
  { id: 'jpeg', label: 'JPG', ext: '.jpg', mime: 'image/jpeg', lossy: true },
  { id: 'webp', label: 'WebP', ext: '.webp', mime: 'image/webp', lossy: true, optional: true },
  { id: 'avif', label: 'AVIF', ext: '.avif', mime: 'image/avif', lossy: true, optional: true },
  { id: 'gif', label: 'GIF', ext: '.gif', mime: 'image/gif', lossy: false },
  { id: 'bmp', label: 'BMP', ext: '.bmp', mime: 'image/bmp', lossy: false },
  { id: 'tiff', label: 'TIFF', ext: '.tiff', mime: 'image/tiff', lossy: false },
  { id: 'ico', label: 'ICO · icon', ext: '.ico', mime: 'image/x-icon', lossy: false },
  {
    id: 'svg',
    label: 'SVG · vector trace',
    ext: '.svg',
    mime: 'image/svg+xml',
    lossy: true,
  },
]

const INPUT_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.jfif',
  '.webp',
  '.avif',
  '.bmp',
  '.gif',
  '.svg',
  '.heic',
  '.heif',
]

const SVG_INPUTS = ['.svg']
const HEIC_INPUTS = ['.heic', '.heif']

const QUALITY_PRESETS = { high: 0.92, balanced: 0.82, compact: 0.68 }

export async function outputsFor(file) {
  const encoders = await detectImageEncoders()
  return TARGETS.filter((t) => !t.optional || encoders[t.id]).filter(
    (t) => t.ext !== extOf(file.name),
  )
}

export function acceptsImage(file) {
  return INPUT_EXTENSIONS.includes(extOf(file.name))
}

export async function convertImage(file, target, preset = 'balanced') {
  const quality =
    QUALITY_PRESETS[preset] ?? QUALITY_PRESETS.balanced
  const ext = extOf(file.name)

  if (SVG_INPUTS.includes(ext)) {
    // Rasterise once to PNG, then let the worker encode any target
    // (including vector tracing) from those pixels.
    const canvas = await loadViaImageElement(file)
    const intermediate = await canvasToBlob(canvas, 'image/png')
    return runInWorker(intermediate, { ...target, lossy: false }, undefined)
  }

  if (HEIC_INPUTS.includes(ext)) {
    if (target.id === 'jpeg') {
      return decodeHeic(file, target.mime, quality)
    }
    const intermediate = await decodeHeic(file, 'image/png', 1)
    return runInWorker(intermediate, { ...target, mime: 'image/png', lossy: false }, 1)
  }

  return runInWorker(file, target, quality)
}
