const COMPRESS_ABOVE_BYTES = 2_500_000
const TARGET_BYTES = 3_500_000
const MAX_DIMENSION = 1600
const MAX_QUALITY = 0.82
const FALLBACK_DIMENSION = 1200
const FALLBACK_QUALITY = 0.65

interface LoadedImage {
  image: HTMLImageElement
  cleanup: () => void
}

function loadImage(file: File): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    const cleanup = () => URL.revokeObjectURL(url)

    image.onload = () => resolve({ image, cleanup })
    image.onerror = () => {
      cleanup()
      reject(new Error('Could not read that image.'))
    }
    image.src = url
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
}

async function drawScaled(
  image: HTMLImageElement,
  maxDimension: number,
  quality: number,
): Promise<Blob | null> {
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight))
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) return null

  // JPEG has no alpha channel; paint white so transparent PNGs don't go black.
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.drawImage(image, 0, 0, width, height)

  return canvasToBlob(canvas, quality)
}

/**
 * Keep phone photos under Vercel's ~4.5 MB function request limit.
 * Small images are passed through untouched; larger ones are resized and
 * re-encoded as JPEG before hitting the API.
 */
export async function prepareProofPhoto(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.size <= COMPRESS_ABOVE_BYTES) return file

  let loaded: LoadedImage | null = null
  try {
    loaded = await loadImage(file)
    let blob = await drawScaled(loaded.image, MAX_DIMENSION, MAX_QUALITY)
    if (!blob) return file

    if (blob.size > TARGET_BYTES) {
      const smaller = await drawScaled(loaded.image, FALLBACK_DIMENSION, FALLBACK_QUALITY)
      if (smaller && smaller.size < blob.size) blob = smaller
    }

    if (blob.size >= file.size && file.size <= TARGET_BYTES) return file
    return new File([blob], 'proof.jpg', { type: 'image/jpeg', lastModified: Date.now() })
  } catch {
    // If the browser cannot decode it, let the backend reject the original.
    return file
  } finally {
    loaded?.cleanup()
  }
}
