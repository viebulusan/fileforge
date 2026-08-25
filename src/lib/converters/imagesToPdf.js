import { PDFDocument } from 'pdf-lib'
import { convertImage, outputsFor as imageOutputs } from './images.js'

const PNG_TARGET = { id: 'png', mime: 'image/png', lossy: false }

async function toPng(file) {
  const targets = await imageOutputs(file)
  const pngAllowed = targets.some((t) => t.id === 'png')
  if (file.type === 'image/png' || file.type === 'image/jpeg') return file
  if (pngAllowed) {
    return convertImage(file, PNG_TARGET, 'balanced')
  }
  const fallback = targets[0]
  if (!fallback) throw new Error('Unsupported image')
  return convertImage(file, fallback, 'balanced')
}

export async function imagesToPdf(files, { fitA4 = true } = {}) {
  const doc = await PDFDocument.create()
  for (const file of files) {
    const png = await toPng(file)
    const bytes = await png.arrayBuffer()
    let embedded
    if (png.type === 'image/jpeg') {
      embedded = await doc.embedJpg(bytes)
    } else {
      try {
        embedded = await doc.embedPng(bytes)
      } catch {
        embedded = await doc.embedJpg(bytes)
      }
    }
    if (fitA4) {
      const page = doc.addPage([595.28, 841.89])
      const margin = 24
      const maxW = page.getWidth() - margin * 2
      const maxH = page.getHeight() - margin * 2
      const scale = Math.min(maxW / embedded.width, maxH / embedded.height)
      const w = embedded.width * scale
      const h = embedded.height * scale
      page.drawImage(embedded, {
        x: (page.getWidth() - w) / 2,
        y: (page.getHeight() - h) / 2,
        width: w,
        height: h,
      })
    } else {
      const page = doc.addPage([embedded.width, embedded.height])
      page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height })
    }
  }
  const out = await doc.save()
  return new Blob([out], { type: 'application/pdf' })
}
