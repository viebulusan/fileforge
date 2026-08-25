// PDF → editable documents, all in the browser. One text extractor, several
// writers: Word (.docx), PowerPoint (.pptx), Excel (.xlsx), plain text and
// Markdown. Text-based PDFs only — scanned pages have nothing to grab.
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from 'docx'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

export const PDF_TARGETS = [
  { id: 'docx', label: 'Word', ext: '.docx' },
  { id: 'pptx', label: 'PowerPoint', ext: '.pptx' },
  { id: 'xlsx', label: 'Excel', ext: '.xlsx' },
  { id: 'txt', label: 'Plain text', ext: '.txt' },
  { id: 'md', label: 'Markdown', ext: '.md' },
]

/** Visual rows per page: [{ size, text }], plus the body-font size. */
async function extractPages(file, onProgress) {
  const data = await file.arrayBuffer()
  const loadingTask = pdfjsLib.getDocument({ data })
  const doc = await loadingTask.promise
  try {
    const pages = []
    let allSizes = []
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      const content = await page.getTextContent()
      const rows = new Map()
      for (const item of content.items) {
        if (!item.str || !item.str.trim()) continue
        const y = Math.round(item.transform[5] / 2) * 2
        const x = item.transform[4]
        const size = Math.hypot(item.transform[2], item.transform[3]) || 10
        if (!rows.has(y)) rows.set(y, { size: 0, parts: [] })
        const row = rows.get(y)
        row.size = Math.max(row.size, size)
        row.parts.push({ x, str: item.str })
      }
      const pageRows = [...rows.values()]
        .map((row) => ({
          size: row.size,
          text: row.parts
            .sort((a, b) => a.x - b.x)
            .map((part) => part.str)
            .join('')
            .replace(/\s+/g, ' ')
            .trim(),
        }))
        .filter((row) => row.text.length > 0)
      pages.push(pageRows)
      allSizes = allSizes.concat(pageRows.map((row) => row.size))
      onProgress?.(p, doc.numPages)
    }
    if (allSizes.length === 0) {
      throw new Error('No selectable text found — this PDF is probably scanned images.')
    }
    allSizes.sort((a, b) => a - b)
    const bodySize = allSizes[Math.floor(allSizes.length / 2)] || 10
    return { pages, bodySize }
  } finally {
    await loadingTask.destroy()
  }
}

const isHeading = (row, bodySize) =>
  row.size / bodySize >= 1.35 && row.text.length <= 90

/* ---------- Word (.docx) ---------- */

async function toDocx(pages, bodySize) {
  const children = []
  for (const rows of pages) {
    let runs = []
    const flush = () => {
      if (runs.length === 0) return
      children.push(new Paragraph({ children: runs, spacing: { after: 160 } }))
      runs = []
    }
    for (const row of rows) {
      if (isHeading(row, bodySize)) {
        flush()
        children.push(
          new Paragraph({
            heading:
              row.size / bodySize >= 1.8 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
            spacing: { before: 240, after: 120 },
            children: [new TextRun({ text: row.text, bold: true })],
          }),
        )
      } else {
        if (runs.length > 0) runs.push(new TextRun({ text: ' ', break: 1 }))
        runs.push(new TextRun({ text: row.text }))
      }
    }
    flush()
  }
  const document = new Document({ sections: [{ children }] })
  return Packer.toBlob(document)
}

/* ---------- PowerPoint (.pptx) ---------- */

async function toPptx(pages, bodySize) {
  const { default: PptxGenJS } = await import('pptxgenjs')
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_16x9'
  pptx.title = 'Converted from PDF'

  for (const rows of pages) {
    const slide = pptx.addSlide()
    const blocks = []
    for (const row of rows) {
      if (isHeading(row, bodySize)) {
        blocks.push({
          text: row.text,
          options: { bold: true, fontSize: row.size / bodySize >= 1.8 ? 24 : 18, breakLine: true, paraSpaceBefore: 8, paraSpaceAfter: 4 },
        })
      } else {
        const bullet = /^\s*[-•*]\s|^\s*\d+[.)]\s/.test(row.text)
        blocks.push({
          text: bullet ? row.text.replace(/^\s*[-•*]\s|^\s*\d+[.)]\s/, '') : row.text,
          options: { bullet: bullet ? { code: '2022' } : false, fontSize: 13, breakLine: true },
        })
      }
    }
    if (blocks.length === 0) blocks.push({ text: '(page with no selectable text)', options: { fontSize: 12, italic: true } })
    slide.addText(blocks, {
      x: 0.6, y: 0.5, w: 8.8, h: 6.9,
      valign: 'top', align: 'left', color: '1a1a17',
    })
  }
  return pptx.write({ outputType: 'blob' })
}

/* ---------- Excel (.xlsx) ---------- */

async function toXlsx(pages, bodySize) {
  const XLSX = await import('xlsx')
  const aoa = [['page', 'type', 'text']]
  pages.forEach((rows, pageIndex) => {
    for (const row of rows) {
      aoa.push([pageIndex + 1, isHeading(row, bodySize) ? 'heading' : 'body', row.text])
    }
  })
  const sheet = XLSX.utils.aoa_to_sheet(aoa)
  sheet['!cols'] = [{ wch: 6 }, { wch: 9 }, { wch: 100 }]
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'PDF text')
  const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  return new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

/* ---------- Plain text / Markdown ---------- */

function toText(pages) {
  return pages
    .map((rows) => rows.map((row) => row.text).join('\n'))
    .join('\n\n— page break —\n\n')
}

function toMarkdown(pages, bodySize) {
  return pages
    .map((rows) =>
      rows
        .map((row) => {
          if (!isHeading(row, bodySize)) return row.text
          const level = row.size / bodySize >= 1.8 ? '##' : '###'
          return `${level} ${row.text}`
        })
        .join('\n\n'),
    )
    .join('\n\n---\n\n')
}

/**
 * Convert a text-based PDF into the chosen editable format.
 * Returns a Blob; onProgress(page, totalPages) during extraction.
 */
export async function pdfToDocument(file, target, onProgress) {
  const { pages, bodySize } = await extractPages(file, onProgress)
  switch (target) {
    case 'docx':
      return toDocx(pages, bodySize)
    case 'pptx':
      return toPptx(pages, bodySize)
    case 'xlsx':
      return toXlsx(pages, bodySize)
    case 'txt':
      return new Blob([toText(pages)], { type: 'text/plain;charset=utf-8' })
    case 'md':
      return new Blob([toMarkdown(pages, bodySize)], { type: 'text/markdown;charset=utf-8' })
    default:
      throw new Error(`Unknown export format: ${target}`)
  }
}
