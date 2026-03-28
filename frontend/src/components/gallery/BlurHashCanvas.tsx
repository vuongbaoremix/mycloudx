import { useEffect, useRef } from 'react'
import { decode } from 'blurhash'

interface BlurHashCanvasProps {
  hash: string
  width?: number
  height?: number
  className?: string
}

export default function BlurHashCanvas({ hash, width = 32, height = 32, className }: BlurHashCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    try {
      const pixels = decode(hash, width, height)
      const imageData = ctx.createImageData(width, height)
      imageData.data.set(pixels)
      ctx.putImageData(imageData, 0, 0)
    } catch {
      // Invalid hash, silently ignore
    }
  }, [hash, width, height])

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={className}
      style={{ imageRendering: 'auto' }}
    />
  )
}
