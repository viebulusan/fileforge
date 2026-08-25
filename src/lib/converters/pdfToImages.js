import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

export async function pdfToPngs(file, scale = 2) {
  const data = await file.arrayBuffer()
  const loadingTask = pdfjsLib.getDocument({ data })
  const doc = await loadingTask.promise
  const pages = []
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      await page.render({
        canvas,
        canvasContext: canvas.getContext('2d'),
        viewport,
      }).promise
      const blob = await new Promise((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Render failed'))),
          'image/png',
        ),
      )
      pages.push({ name: `page-${String(i).padStart(2, '0')}.png`, blob })
    }
  } finally {
    await loadingTask.destroy()
  }
  return pages
}

export async function getPdfPageCount(file) {
  const data = await file.arrayBuffer()
  const loadingTask = pdfjsLib.getDocument({ data })
  const doc = await loadingTask.promise
  const count = doc.numPages
  await loadingTask.destroy()
  return count
}
