import { GIFEncoder, quantize, applyPalette } from 'gifenc'
import UTIF from 'utif'
import ImageTracer from 'imagetracerjs'

// 24-bit BMP (BI_RGB, bottom-up rows padded to 4 bytes).
function encodeBmp(imageData) {
  const { width, height, data } = imageData
  const rowSize = Math.floor((24 * width + 31) / 32) * 4
  const pixelBytes = rowSize * height
  const out = new ArrayBuffer(54 + pixelBytes)
  const view = new DataView(out)
  const bytes = new Uint8Array(out)

  view.setUint8(0, 0x42)
  view.setUint8(1, 0x4d)
  view.setUint32(2, out.byteLength, true)
  view.setUint32(10, 54, true)
  view.setUint32(14, 40, true)
  view.setInt32(18, width, true)
  view.setInt32(22, height, true)
  view.setUint16(26, 1, true)
  view.setUint16(28, 24, true)
  view.setUint32(34, pixelBytes, true)
  view.setInt32(38, 2835, true)
  view.setInt32(42, 2835, true)

  let p = 54
  for (let y = height - 1; y >= 0; y -= 1) {
    let x = 0
    const rowStart = y * width * 4
    for (; x < width; x += 1) {
      const i = rowStart + x * 4
      bytes[p] = data[i + 2]
      bytes[p + 1] = data[i + 1]
      bytes[p + 2] = data[i]
      p += 3
    }
    while (p % 4 !== 0) {
      bytes[p] = 0
      p += 1
    }
    void rowSize
  }
  return out
}

function encodeGif(imageData) {
  const palette = quantize(imageData.data, 256)
  const index = applyPalette(imageData.data, palette)
  const encoder = GIFEncoder()
  encoder.writeFrame(index, imageData.width, imageData.height, { palette })
  encoder.finish()
  return encoder.bytes().slice().buffer
}

function encodeTiff(imageData) {
  return UTIF.encodeImage(imageData.data, imageData.width, imageData.height)
}

function encodeSvg(imageData) {
  const svg = ImageTracer.imagedataToSVG(imageData, {
    numberofcolors: 16,
    ltres: 1,
    qtres: 1,
    pathomit: 8,
    roundcoords: 2,
  })
  return new TextEncoder().encode(svg).buffer
}

// Wrap a PNG payload inside an ICO container (valid modern-icon format).
function encodeIco(pngBuffer, width, height) {
  const size = pngBuffer.byteLength
  const out = new ArrayBuffer(6 + 16 + size)
  const view = new DataView(out)
  const bytes = new Uint8Array(out)
  view.setUint16(0, 0, true)
  view.setUint16(2, 1, true)
  view.setUint16(4, 1, true)
  view.setUint8(6, width >= 256 ? 0 : width)
  view.setUint8(7, height >= 256 ? 0 : height)
  view.setUint8(8, 0)
  view.setUint8(9, 0)
  view.setUint16(10, 1, true)
  view.setUint16(12, 32, true)
  view.setUint32(14, size, true)
  view.setUint32(18, 22, true)
  bytes.set(new Uint8Array(pngBuffer), 22)
  return out
}

async function rasterize(buffer) {
  const bitmap = await createImageBitmap(new Blob([buffer]))
  let canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  let ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  return { canvas, ctx }
}

self.onmessage = async (event) => {
  const { id, buffer, mime, quality, kind } = event.data
  try {
    let out
    let size

    if (kind === 'bmp' || kind === 'gif' || kind === 'tiff' || kind === 'svg') {
      const { canvas, ctx } = await rasterize(buffer)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      out =
        kind === 'bmp'
          ? encodeBmp(imageData)
          : kind === 'gif'
            ? encodeGif(imageData)
            : kind === 'tiff'
              ? encodeTiff(imageData)
              : encodeSvg(imageData)
      size = out.byteLength
    } else if (kind === 'ico') {
      const { canvas } = await rasterize(buffer)
      const scale = Math.min(1, 256 / Math.max(canvas.width, canvas.height))
      let source = canvas
      if (scale < 1) {
        const scaled = new OffscreenCanvas(
          Math.max(1, Math.round(canvas.width * scale)),
          Math.max(1, Math.round(canvas.height * scale)),
        )
        scaled.getContext('2d').drawImage(canvas, 0, 0, scaled.width, scaled.height)
        source = scaled
      }
      const pngBlob = await source.convertToBlob({ type: 'image/png' })
      out = encodeIco(await pngBlob.arrayBuffer(), source.width, source.height)
      size = out.byteLength
    } else {
      const bitmap = await createImageBitmap(new Blob([buffer]))
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
      const ctx = canvas.getContext('2d')
      if (mime === 'image/jpeg') {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }
      ctx.drawImage(bitmap, 0, 0)
      bitmap.close()

      const blob = await canvas.convertToBlob({ type: mime, quality })
      out = await blob.arrayBuffer()
      size = out.byteLength
    }

    self.postMessage({ id, ok: true, buffer: out, size }, [out])
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : 'Conversion failed',
    })
  }
}
