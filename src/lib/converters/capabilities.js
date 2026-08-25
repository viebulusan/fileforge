async function supports(mime) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 2
  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, mime, 0.8),
  )
  return blob !== null && blob.type === mime
}

let cached = null

export async function detectImageEncoders() {
  if (cached) return cached
  const [webp, avif] = await Promise.all([
    supports('image/webp'),
    supports('image/avif'),
  ])
  cached = { png: true, jpeg: true, webp, avif }
  return cached
}
