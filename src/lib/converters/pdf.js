import { PDFDocument, degrees } from 'pdf-lib'

async function loadPdf(file) {
  return PDFDocument.load(await file.arrayBuffer(), {
    ignoreEncryption: true,
  })
}

export async function mergePdfs(files) {
  const out = await PDFDocument.create()
  for (const file of files) {
    const source = await loadPdf(file)
    const pages = await out.copyPages(source, source.getPageIndices())
    pages.forEach((page) => out.addPage(page))
  }
  const bytes = await out.save()
  return new Blob([bytes], { type: 'application/pdf' })
}

export async function extractPdfPages(file, ranges) {
  const source = await loadPdf(file)
  const total = source.getPageCount()
  const wanted = parseRanges(ranges, total)
  if (wanted.length === 0) {
    throw new Error('No pages selected')
  }
  const out = await PDFDocument.create()
  const pages = await out.copyPages(source, wanted)
  pages.forEach((page) => out.addPage(page))
  const bytes = await out.save()
  return { blob: new Blob([bytes], { type: 'application/pdf' }), count: wanted.length }
}

export async function rotatePdf(file, turn) {
  const doc = await loadPdf(file)
  doc.getPages().forEach((page) => {
    const current = page.getRotation().angle
    page.setRotation(degrees((current + turn + 360) % 360))
  })
  const bytes = await doc.save()
  return new Blob([bytes], { type: 'application/pdf' })
}

export function parseRanges(input, total) {
  const indices = []
  const seen = new Set()
  for (const part of input.split(',')) {
    const chunk = part.trim()
    if (!chunk) continue
    const range = chunk.split('-').map((n) => Number.parseInt(n.trim(), 10))
    let start
    let end
    if (range.length === 1 && Number.isInteger(range[0])) {
      start = end = range[0]
    } else if (range.length === 2 && range.every(Number.isInteger)) {
      start = Math.min(range[0], range[1])
      end = Math.max(range[0], range[1])
    } else {
      continue
    }
    for (let page = Math.max(1, start); page <= Math.min(total, end); page++) {
      if (!seen.has(page)) {
        seen.add(page)
        indices.push(page - 1)
      }
    }
  }
  return indices
}
