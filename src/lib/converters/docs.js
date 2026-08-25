import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import * as XLSX from 'xlsx'
import { marked } from 'marked'

export function docsExtOf(name) {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot).toLowerCase()
}

export function docsBaseOf(name) {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? name : name.slice(0, dot)
}

const SPREADSHEET_INPUTS = ['.csv', '.tsv', '.json', '.xlsx', '.xls']
const MARKDOWN_INPUTS = ['.md', '.markdown']

export function acceptsDocs(file) {
  const ext = docsExtOf(file.name)
  return (
    SPREADSHEET_INPUTS.includes(ext) || MARKDOWN_INPUTS.includes(ext)
  )
}

function textTarget(id, label, ext) {
  return { id, label, ext, lossy: false }
}

export async function outputsForDocs(file) {
  const ext = docsExtOf(file.name)
  if (MARKDOWN_INPUTS.includes(ext)) {
    return [
      textTarget('html', 'HTML', '.html'),
      { id: 'pdf', label: 'PDF', ext: '.pdf', lossy: false },
      textTarget('txt', 'Plain text', '.txt'),
    ]
  }
  const outputs = []
  if (ext !== '.json') outputs.push(textTarget('json', 'JSON', '.json'))
  if (ext !== '.csv') outputs.push(textTarget('csv', 'CSV', '.csv'))
  if (ext !== '.xlsx') outputs.push({ id: 'xlsx', label: 'XLSX', ext: '.xlsx', lossy: false })
  return outputs
}

/* ---------- spreadsheet helpers ---------- */

async function readRows(file) {
  const ext = docsExtOf(file.name)
  if (ext === '.json') return jsonToRows(await parseJsonFile(file))
  const text = await file.text()
  const wb = XLSX.read(text, { type: 'string', raw: false })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  if (!sheet) throw new Error('No sheet found in this file')
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false })
}

async function parseJsonFile(file) {
  try {
    return JSON.parse(await file.text())
  } catch (error) {
    throw new Error('Invalid JSON — ' + error.message)
  }
}

function collectKeys(objects) {
  const keys = []
  for (const row of objects) {
    for (const key of Object.keys(row)) {
      if (!keys.includes(key)) keys.push(key)
    }
  }
  return keys
}

function jsonToRows(value) {
  if (Array.isArray(value)) {
    if (value.length === 0) return [['']]
    if (value.every((row) => row && typeof row === 'object' && !Array.isArray(row))) {
      const keys = collectKeys(value)
      return [
        keys,
        ...value.map((row) => keys.map((key) => stringifyCell(row[key]))),
      ]
    }
    return value.map((row) =>
      Array.isArray(row) ? row.map(stringifyCell) : [stringifyCell(row)],
    )
  }
  if (value && typeof value === 'object') {
    return [collectKeys([value]), Object.values(value).map(stringifyCell)]
  }
  return [[String(value)]]
}

function stringifyCell(cell) {
  if (cell == null) return ''
  if (typeof cell === 'object') return JSON.stringify(cell)
  return String(cell)
}

function rowsToObjects(rows) {
  if (rows.length < 2) return []
  const header = rows[0].map((h, i) => (h === '' ? `column_${i + 1}` : String(h)))
  return rows.slice(1).map((row) => {
    const entry = {}
    header.forEach((key, i) => {
      entry[key] = coerceNumber(row[i])
    })
    return entry
  })
}

function coerceNumber(value) {
  if (typeof value !== 'string' || value.trim() === '') return value
  const num = Number(value)
  return Number.isFinite(num) && /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(value.trim())
    ? num
    : value
}

/* ---------- markdown → pdf layout engine ---------- */

const PAGE = { width: 595.28, height: 841.89, margin: 64 }

function wrapText(text, font, size, maxWidth) {
  const words = text.split(/\s+/).filter(Boolean)
  const lines = []
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate
    } else {
      if (line) lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines.length > 0 ? lines : ['']
}

function stripInline(markdown) {
  return markdown
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/`([^`]*)`/g, '$1')
}

export async function markdownToPdf(file) {
  const source = await file.text()
  const doc = await PDFDocument.create()
  const body = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique)
  const mono = await doc.embedFont(StandardFonts.Courier)

  const ink = rgb(0.043, 0.039, 0.035)
  const faint = rgb(0.42, 0.41, 0.38)
  const accent = rgb(0.55, 0.6, 0.08)
  const contentWidth = PAGE.width - PAGE.margin * 2

  let page = doc.addPage([PAGE.width, PAGE.height])
  let y = PAGE.height - PAGE.margin

  function newPage() {
    page = doc.addPage([PAGE.width, PAGE.height])
    y = PAGE.height - PAGE.margin
  }

  function ensureSpace(height) {
    if (y - height < PAGE.margin) newPage()
  }

  function drawLines(lines, font, size, color, lineHeight) {
    for (const line of lines) {
      ensureSpace(lineHeight)
      page.drawText(line, { x: PAGE.margin, y: y - size, size, font, color })
      y -= lineHeight
    }
  }

  function drawRule() {
    ensureSpace(18)
    page.drawLine({
      start: { x: PAGE.margin, y: y - 8 },
      end: { x: PAGE.width - PAGE.margin, y: y - 8 },
      thickness: 0.75,
      color: faint,
    })
    y -= 20
  }

  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    if (line.trim() === '') {
      y -= 6
      i += 1
      continue
    }

    if (/^```/.test(line)) {
      i += 1
      const codeLines = []
      while (i < lines.length && !/^```/.test(lines[i])) {
        codeLines.push(lines[i])
        i += 1
      }
      i += 1
      ensureSpace(14)
      y -= 4
      for (const codeLine of codeLines) {
        const fits = mono.widthOfTextAtSize(codeLine, 9.5) <= contentWidth - 16
        const text = fits ? codeLine : codeLine.slice(0, 120)
        ensureSpace(15)
        page.drawRectangle({
          x: PAGE.margin,
          y: y - 11.5,
          width: contentWidth,
          height: 15,
          color: rgb(0.96, 0.96, 0.94),
        })
        page.drawText(text, {
          x: PAGE.margin + 8,
          y: y - 7,
          size: 9.5,
          font: mono,
          color: ink,
        })
        y -= 15
      }
      y -= 4
      continue
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      const level = heading[1].length
      const sizes = { 1: 26, 2: 19, 3: 15, 4: 13, 5: 12, 6: 11 }
      const size = sizes[level]
      const text = stripInline(heading[2])
      ensureSpace(size * 2)
      y -= level <= 2 ? 10 : 6
      drawLines(wrapText(text, bold, size, contentWidth), bold, size, ink, size * 1.25)
      if (level === 1) {
        ensureSpace(8)
        page.drawLine({
          start: { x: PAGE.margin, y: y - 2 },
          end: { x: PAGE.width - PAGE.margin, y: y - 2 },
          thickness: 1,
          color: accent,
        })
        y -= 10
      }
      y -= 4
      i += 1
      continue
    }

    if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      drawRule()
      i += 1
      continue
    }

    const quote = /^>\s?(.*)$/.exec(line)
    if (quote) {
      const wrapped = wrapText(stripInline(quote[1]), italic, 11, contentWidth - 20)
      for (const text of wrapped) {
        ensureSpace(17)
        page.drawRectangle({
          x: PAGE.margin,
          y: y - 13,
          width: 3,
          height: 16,
          color: accent,
        })
        page.drawText(text, {
          x: PAGE.margin + 14,
          y: y - 9,
          size: 11,
          font: italic,
          color: faint,
        })
        y -= 17
      }
      y -= 4
      i += 1
      continue
    }

    const bullet = /^\s*[-*+]\s+(.*)$/.test(line)
    const numbered = /^\s*\d+[.)]\s+(.*)$/.test(line)
    if (bullet || numbered) {
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) {
        const match = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i])
        const marker = /^\d/.test(match[1]) ? `${match[1].replace(/[.)]/, '')}.` : '•'
        const wrapped = wrapText(stripInline(match[2]), body, 11, contentWidth - 22)
        ensureSpace(16)
        page.drawText(marker, {
          x: PAGE.margin + 4,
          y: y - 9.5,
          size: 11,
          font: body,
          color: accent,
        })
        wrapped.forEach((text, index) => {
          ensureSpace(16)
          page.drawText(text, {
            x: PAGE.margin + 22,
            y: y - 9.5,
            size: 11,
            font: body,
            color: ink,
          })
          if (index < wrapped.length - 1) y -= 16
        })
        y -= 16
        i += 1
      }
      y -= 4
      continue
    }

    const paragraphLines = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^#{1,6}\s/.test(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !/^\s*([-*+]|\d+[.)])\s+/.test(lines[i]) &&
      !/^>/.test(lines[i]) &&
      !/^(-{3,}|\*{3,})\s*$/.test(lines[i])
    ) {
      paragraphLines.push(lines[i])
      i += 1
    }
    const wrapped = wrapText(stripInline(paragraphLines.join(' ')), body, 11, contentWidth)
    drawLines(wrapped, body, 11, ink, 16)
    y -= 4
  }

  const bytes = await doc.save()
  return new Blob([bytes], { type: 'application/pdf' })
}

/* ---------- markdown → html / txt ---------- */

const HTML_SHELL_STYLES = `
  :root { color-scheme: light; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: "Space Grotesk", system-ui, sans-serif;
    background: #fafaf7;
    color: #1c1b18;
    line-height: 1.65;
    padding: 72px 24px;
  }
  main {
    max-width: 720px;
    margin-inline: auto;
  }
  h1, h2, h3, h4, h5, h6 { line-height: 1.15; letter-spacing: -0.02em; margin: 1.6em 0 0.5em; }
  h1 { font-size: 2.4rem; border-bottom: 2px solid #d9ff3d; padding-bottom: 0.35em; }
  h2 { font-size: 1.7rem; }
  h3 { font-size: 1.3rem; }
  p, ul, ol, blockquote, pre, table { margin: 0.9em 0; }
  ul, ol { padding-left: 1.5em; }
  li { margin: 0.3em 0; }
  a { color: inherit; text-decoration-color: #b8cc2e; text-underline-offset: 3px; }
  code {
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 0.88em;
    background: #efefe9;
    border: 1px solid #dedcd2;
    padding: 0.1em 0.35em;
    border-radius: 3px;
  }
  pre {
    background: #14140f;
    color: #f0efe8;
    padding: 18px 20px;
    overflow-x: auto;
    border-radius: 4px;
  }
  pre code { background: transparent; border: none; color: inherit; padding: 0; font-size: 0.85rem; }
  blockquote {
    border-left: 3px solid #b8cc2e;
    padding: 0.2em 0 0.2em 1.1em;
    color: #6b6a60;
    font-style: italic;
  }
  hr { border: none; border-top: 1px solid #dedcd2; margin: 2em 0; }
  table { border-collapse: collapse; width: 100%; font-size: 0.92rem; }
  th, td { border: 1px solid #dedcd2; padding: 0.45em 0.7em; text-align: left; }
  th { background: #efefe9; font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.08em; }
  img { max-width: 100%; border-radius: 4px; }
`

export async function markdownToHtml(file) {
  const source = await file.text()
  const body = await marked.parse(source, { async: false })
  const firstHeading = /^#{1,6}\s+(.+)$/m.exec(source)
  const title = firstHeading ? firstHeading[1].trim() : 'Document'
  return new Blob(
    [
      `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8" />\n<meta name="viewport" content="width=device-width, initial-scale=1" />\n<title>${escapeHtml(title)}</title>\n<link rel="preconnect" href="https://fonts.googleapis.com" />\n<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />\n<style>${HTML_SHELL_STYLES}</style>\n</head>\n<body>\n<main>\n${body}\n</main>\n</body>\n</html>\n`,
    ],
    { type: 'text/html;charset=utf-8' },
  )
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function markdownToTxt(file) {
  const source = await file.text()
  const plain = source
    .replace(/^```[\s\S]*?```$/gm, (block) =>
      block.split('\n').slice(1, -1).join('\n'),
    )
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^(\s*)[-*+]\s+/gm, '$1- ')
    .replace(/^>\s?/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/!?\[([^\]]*)\]\(([^)]*)\)/g, '$1 ($2)')
    .replace(/^\s*([-*_]\s*){3,}$/gm, '---')
    .replace(/\n{3,}/g, '\n\n')
  return new Blob([plain], { type: 'text/plain;charset=utf-8' })
}

/* ---------- dispatch ---------- */

function jsonBlob(value) {
  return new Blob([JSON.stringify(value, null, 2) + '\n'], {
    type: 'application/json',
  })
}

function csvFromRows(rows) {
  const sheet = XLSX.utils.aoa_to_sheet(rows)
  const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false })
  return new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
}

function xlsxFromRows(rows) {
  const sheet = XLSX.utils.aoa_to_sheet(rows)
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, 'Sheet1')
  const buffer = XLSX.write(book, { bookType: 'xlsx', type: 'array' })
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

export async function convertDocs(file, target) {
  const ext = docsExtOf(file.name)

  if (MARKDOWN_INPUTS.includes(ext)) {
    if (target.id === 'html') return markdownToHtml(file)
    if (target.id === 'pdf') return markdownToPdf(file)
    if (target.id === 'txt') return markdownToTxt(file)
    throw new Error(`Unsupported target ${target.id}`)
  }

  const rows = await readRows(file)
  switch (target.id) {
    case 'json':
      return jsonBlob(rowsToObjects(rows))
    case 'csv':
      return csvFromRows(rows)
    case 'xlsx':
      return xlsxFromRows(rows)
    default:
      throw new Error(`Unsupported target ${target.id}`)
  }
}
