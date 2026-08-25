// Built-in document → PDF conversion. Runs entirely in the browser on top of
// pdf-lib (+ mammoth for .docx, JSZip for OpenDocument/PPTX). No server, no
// uploads — fidelity is "clean and readable" rather than pixel-perfect.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const PAGE = { width: 595.28, height: 841.89 } // A4
const MARGIN = 56
const CONTENT_WIDTH = PAGE.width - MARGIN * 2

// ---------- text sanitation: standard fonts are WinAnsi-only ----------
const WINANSI_MAP = {
  0x2018: "'", 0x2019: "'", 0x201a: ',', 0x201c: '"', 0x201d: '"',
  0x2013: '-', 0x2014: '-', 0x2026: '...', 0x00a0: ' ', 0x2022: '-',
  0x2192: '->', 0x2190: '<-', 0x2264: '<=', 0x2265: '>=', 0x02bc: "'",
}
function sanitize(text) {
  let out = ''
  for (const ch of String(text ?? '')) {
    const code = ch.codePointAt(0)
    if (code === 10 || code === 13) {
      out += ch
      continue
    }
    if (WINANSI_MAP[code]) {
      out += WINANSI_MAP[code]
      continue
    }
    if (code <= 0xff || (code >= 0x2010 && code <= 0x2027)) {
      out += ch
      continue
    }
    out += ''
  }
  return out
}

// ---------- flowing layout ----------
class PdfWriter {
  constructor(doc, font, boldFont) {
    this.doc = doc
    this.font = font
    this.boldFont = boldFont
    this.page = null
    this.y = 0
    this.#newPage()
  }

  #newPage() {
    this.page = this.doc.addPage([PAGE.width, PAGE.height])
    this.y = PAGE.height - MARGIN
  }

  #ensure(space) {
    if (this.y - space < MARGIN) this.#newPage()
  }

  draw(text, { size = 11, bold = false, gapAfter = 6, indent = 0, color } = {}) {
    const font = bold ? this.boldFont : this.font
    const lineHeight = size * 1.42
    const maxWidth = CONTENT_WIDTH - indent
    const paragraphs = sanitize(text).split(/\n/)
    for (const para of paragraphs) {
      const lines = wrap(para, font, size, maxWidth)
      for (let i = 0; i < lines.length; i += 1) {
        this.#ensure(lineHeight)
        this.page.drawText(lines[i], {
          x: MARGIN + indent,
          y: this.y - size,
          size,
          font,
          ...(color ? { color } : {}),
        })
        this.y -= lineHeight
      }
    }
    this.y -= gapAfter
  }

  rule() {
    this.#ensure(14)
    this.page.drawLine({
      start: { x: MARGIN, y: this.y - 4 },
      end: { x: MARGIN + CONTENT_WIDTH, y: this.y - 4 },
      thickness: 0.75,
      color: rgb(0.72, 0.72, 0.68),
    })
    this.y -= 16
  }

  table(rows, widths) {
    if (!rows.length) return
    const cellPad = 4
    const size = 9
    const lineHeight = size * 1.35
    rows.forEach((row, rowIndex) => {
      const cells = row.map((cell, colIndex) =>
        wrap(sanitize(String(cell ?? '')), rowIndex === 0 ? this.boldFont : this.font, size, Math.max(widths[colIndex] - cellPad * 2, 24)),
      )
      const rowHeight = Math.max(...cells.map((lines) => lines.length)) * lineHeight + cellPad * 2
      this.#ensure(rowHeight)
      let x = MARGIN
      cells.forEach((lines, colIndex) => {
        const colWidth = widths[colIndex]
        this.page.drawRectangle({
          x,
          y: this.y - rowHeight,
          width: colWidth,
          height: rowHeight,
          borderColor: rgb(0.78, 0.78, 0.74),
          borderWidth: 0.5,
        })
        lines.forEach((line, lineIndex) => {
          this.page.drawText(line, {
            x: x + cellPad,
            y: this.y - cellPad - size - lineIndex * lineHeight,
            size,
            font: rowIndex === 0 ? this.boldFont : this.font,
          })
        })
        x += colWidth
      })
      this.y -= rowHeight
    })
    this.y -= 10
  }
}

function wrap(text, font, size, maxWidth) {
  if (!text) return ['']
  const words = text.split(/(\s+)/).filter((w) => w !== '')
  const lines = []
  let current = ''
  for (const word of words) {
    const candidate = current + word
    try {
      if (font.widthOfTextAtSize(candidate.trimEnd(), size) <= maxWidth) {
        current = candidate
        continue
      }
    } catch {
      // unencodable char slipped through — drop it from the candidate
      continue
    }
    if (current.trim()) lines.push(current.trimEnd())
    current = word.trimStart()
    // single word longer than a line: hard-split it
    while (
      (() => {
        try {
          return font.widthOfTextAtSize(current, size) > maxWidth && current.length > 1
        } catch {
          return false
        }
      })()
    ) {
      let cut = current.length - 1
      while (cut > 1) {
        try {
          if (font.widthOfTextAtSize(current.slice(0, cut), size) <= maxWidth) break
        } catch {
          /* skip char */
        }
        cut -= 1
      }
      lines.push(current.slice(0, cut))
      current = current.slice(cut)
    }
  }
  if (current.trim()) lines.push(current.trimEnd())
  return lines.length > 0 ? lines : ['']
}

// ---------- format readers ----------
async function readTextual(file) {
  const raw = await file.text()
  return raw.replace(/\r\n?/g, '\n')
}

function stripRtf(rtf) {
  return rtf
    .replace(/\\'([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\{\\\*?[^{}]*\}/g, '')
    .replace(/\\par[d]?\b/g, '\n')
    .replace(/\\line\b/g, '\n')
    .replace(/\\tab\b/g, '\t')
    .replace(/\\[a-z]+-?\d* ?/gi, '')
    .replace(/[{}]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function xmlText(node) {
  return (node?.textContent ?? '').replace(/\s+/g, ' ').trim()
}

async function readOpenDocument(file) {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const content = await zip.file('content.xml')?.async('string')
  if (!content) throw new Error('That file does not look like a valid OpenDocument.')
  const doc = new DOMParser().parseFromString(content, 'application/xml')
  const blocks = []
  for (const node of doc.querySelectorAll('text\\:h, text\\:p')) {
    const tag = node.nodeName.toLowerCase()
    const value = node.textContent?.replace(/\s+/g, ' ').trim()
    if (value) blocks.push({ text: value, heading: tag.endsWith(':h'), level: Number(node.getAttribute('text:outline-level') ?? 1) })
  }
  // spreadsheets: fall back to tables
  if (blocks.length === 0) {
    const rows = []
    doc.querySelectorAll('table\\:table-row').forEach((rowNode) => {
      const cells = Array.from(rowNode.getElementsByTagName('*'))
        .filter((el) => el.nodeName.toLowerCase().endsWith('table-cell'))
        .map(xmlText)
      if (cells.some(Boolean)) rows.push(cells)
    })
    return { kind: 'table', rows }
  }
  return { kind: 'blocks', blocks }
}

async function readPptx(file) {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const slideNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const num = (s) => Number(s.match(/slide(\d+)\.xml/)?.[1] ?? 0)
      return num(a) - num(b)
    })
  if (slideNames.length === 0) throw new Error('No slides found in that presentation.')
  const slides = []
  for (const name of slideNames) {
    const xml = await zip.file(name).async('string')
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    const runs = Array.from(doc.getElementsByTagName('a:t')).map((node) => node.textContent ?? '')
    slides.push(runs.filter((line) => line.trim()))
  }
  return slides
}

async function readSpreadsheet(file) {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  const sheets = workbook.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, blankrows: false, raw: false }).map(
      (row) => row.map((cell) => String(cell ?? '')),
    ),
  })).filter((sheet) => sheet.rows.length > 0)
  return sheets
}

async function readDocx(file) {
  const mammoth = await import('mammoth/mammoth.browser.js')
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.convertToHtml({ arrayBuffer })
  const dom = new DOMParser().parseFromString(result.value, 'text/html')
  return dom.body
}

// ---------- renderers ----------
const HEADING_SIZES = [22, 17, 14, 12.5]

function renderBlocks(writer, blocks) {
  for (const block of blocks) {
    if (block.heading) {
      writer.draw(block.text, {
        size: HEADING_SIZES[Math.min(Math.max(block.level ?? 1, 1), 4) - 1],
        bold: true,
        gapAfter: 8,
      })
    } else {
      writer.draw(block.text)
    }
  }
}

function renderDocxDom(writer, body) {
  const walk = (node) => {
    for (const child of node.childNodes) {
      if (!(child instanceof Element)) {
        continue
      }
      const tag = child.tagName.toLowerCase()
      if (/^h[1-4]$/.test(tag)) {
        writer.draw(child.textContent ?? '', {
          size: HEADING_SIZES[Number(tag[1]) - 1],
          bold: true,
          gapAfter: 8,
        })
      } else if (tag === 'p') {
        const img = child.querySelector('img')
        if (img && !(child.textContent ?? '').trim()) {
          writer.draw('[image omitted]', { size: 9, color: rgb(0.55, 0.55, 0.52) })
        } else if ((child.textContent ?? '').trim()) {
          writer.draw(flattenStyled(child))
        }
      } else if (tag === 'ul' || tag === 'ol') {
        let index = 1
        for (const li of child.children) {
          if (li.tagName.toLowerCase() !== 'li') continue
          writer.draw(`${tag === 'ol' ? `${index}.` : '-'}  ${flattenStyled(li)}`, { indent: 18, gapAfter: 2 })
          index += 1
        }
        writer.y -= 4
      } else if (tag === 'table') {
        const rows = Array.from(child.querySelectorAll('tr')).map((tr) =>
          Array.from(tr.children).map((cell) => flattenStyled(cell)),
        )
        writer.table(rows, evenWidths(rows, writer))
      } else if (tag === 'br') {
        writer.draw('', { gapAfter: 2 })
      } else {
        walk(child)
      }
    }
  }
  walk(body)
}

function flattenStyled(node) {
  const pieces = []
  const push = (text, style) => {
    if (!text) return
    const last = pieces.at(-1)
    if (last && last.style === style) last.text += text
    else pieces.push({ text, style })
  }
  const visit = (node, style) => {
    if (node.nodeType === Node.TEXT_NODE) {
      push(node.textContent ?? '', style)
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const tag = node.tagName.toLowerCase()
    const next =
      style +
      (tag === 'strong' || tag === 'b' ? 'b' : '') +
      (tag === 'em' || tag === 'i' ? 'i' : '')
    for (const child of node.childNodes) visit(child, next)
  }
  visit(node, '')
  // Styled spans collapse to plain text in the layout engine; bold runs inside
  // headings already render via the heading path.
  return pieces.map((piece) => piece.text).join('').replace(/\s+/g, ' ').trim()
}

function evenWidths(rows, writer) {
  const columns = rows.reduce((max, row) => Math.max(max, row.length), 1)
  void writer
  return Array.from({ length: columns }, () => CONTENT_WIDTH / columns)
}

function csvSplit(line, delimiter) {
  const out = []
  let current = ''
  let quoted = false
  for (const ch of line) {
    if (ch === '"') quoted = !quoted
    else if (ch === delimiter && !quoted) {
      out.push(current)
      current = ''
    } else current += ch
  }
  out.push(current)
  return out
}

export async function convertToPdf(file) {
  const doc = await PDFDocument.create()
  doc.setTitle(file.name.replace(/\.[^.]+$/, ''))
  doc.setProducer('FileForge')
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold)
  const writer = new PdfWriter(doc, font, boldFont)

  const ext = (file.name.match(/\.([^.]+)$/)?.[1] ?? '').toLowerCase()

  if (ext === 'txt' || ext === 'md' || ext === 'rtf') {
    let text = await readTextual(file)
    if (ext === 'rtf') text = stripRtf(text)
    if (ext === 'md') {
      for (const line of text.split('\n')) {
        const heading = line.match(/^(#{1,4})\s+(.*)/)
        if (heading) {
          writer.draw(heading[2], { size: HEADING_SIZES[heading[1].length - 1], bold: true, gapAfter: 8 })
        } else if (/^\s*[-*]\s+/.test(line)) {
          writer.draw(`-  ${line.replace(/^\s*[-*]\s+/, '')}`, { indent: 18, gapAfter: 2 })
        } else if (line.trim() === '') {
          writer.y -= 8
        } else {
          writer.draw(line)
        }
      }
    } else {
      writer.draw(text, { size: ext === 'txt' ? 11 : 10.5 })
    }
  } else if (ext === 'docx') {
    renderDocxDom(writer, await readDocx(file))
  } else if (ext === 'csv' || ext === 'tsv') {
    const text = await readTextual(file)
    const rows = text.split('\n').filter((line) => line.trim()).map((line) =>
      csvSplit(line, ext === 'tsv' ? '\t' : ','),
    )
    writer.table(rows, evenWidths(rows))
  } else if (ext === 'xlsx' || ext === 'xls' || ext === 'ods') {
    if (ext === 'ods') {
      const parsed = await readOpenDocument(file)
      if (parsed.kind === 'table') writer.table(parsed.rows, evenWidths(parsed.rows))
      else renderBlocks(writer, parsed.blocks)
    } else {
      for (const sheet of await readSpreadsheet(file)) {
        writer.draw(sheet.name, { size: 15, bold: true, gapAfter: 10 })
        const capped = sheet.rows.slice(0, 400)
        writer.table(capped, evenWidths(capped))
      }
    }
  } else if (ext === 'odt') {
    renderBlocks(writer, (await readOpenDocument(file)).blocks ?? [])
  } else if (ext === 'odp') {
    throw new Error('.odp is not supported by the built-in engine yet — use the desktop companion.')
  } else if (ext === 'ppt' || ext === 'pptx') {
    if (ext === 'pptx') {
      renderSlides(writer, await readPptx(file))
    } else {
      throw new Error('.ppt needs the desktop companion — save as .pptx first.')
    }
  } else {
    throw new Error(`Unsupported document type: .${ext}`)
  }

  const bytes = await doc.save()
  return new Blob([bytes], { type: 'application/pdf' })
}

function renderSlides(writer, slides) {
  slides.forEach((runs, index) => {
    if (index > 0) {
      writer.rule()
    }
    const [title, ...rest] = runs
    if (title) writer.draw(title, { size: 20, bold: true, gapAfter: 12 })
    for (const line of rest) writer.draw(line, { gapAfter: 4 })
    writer.y -= 14
  })
}
