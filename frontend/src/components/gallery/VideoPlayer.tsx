import React, { useRef, useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  FastForward,
  Rewind
} from 'lucide-react'

interface VideoPlayerProps {
  src: string
  poster?: string
  className?: string
}

function formatTime(seconds: number) {
  if (isNaN(seconds)) return '00:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

export default function VideoPlayer({ src, poster, className = '' }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isMuted, setIsMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)

  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const resetControlsTimeout = useCallback(() => {
    setShowControls(true)
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current)
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000)
    }
  }, [isPlaying])

  useEffect(() => {
    resetControlsTimeout()
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current)
    }
  }, [resetControlsTimeout])

  const togglePlay = (e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (videoRef.current) {
      if (isPlaying) videoRef.current.pause()
      else videoRef.current.play()
    }
  }

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (videoRef.current) {
      videoRef.current.muted = !isMuted
      setIsMuted(!isMuted)
    }
  }

  const toggleFullscreen = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!containerRef.current) return

    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen().catch(err => console.error(err))
    } else {
      await document.exitFullscreen()
    }
  }

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const handleTimeUpdate = () => {
    if (!videoRef.current) return
    setCurrentTime(videoRef.current.currentTime)
    if (videoRef.current.duration) {
      setProgress((videoRef.current.currentTime / videoRef.current.duration) * 100)
    }
  }

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration)
      // Attempt auto-play with mute if needed
      videoRef.current.play().catch(() => {
        // Autoplay blocked
        setIsPlaying(false)
      })
    }
  }

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation()
    if (!videoRef.current) return
    const rect = e.currentTarget.getBoundingClientRect()
    const pos = (e.clientX - rect.left) / rect.width
    videoRef.current.currentTime = pos * videoRef.current.duration
  }

  const skipRelative = (seconds: number, e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (videoRef.current) {
      videoRef.current.currentTime += seconds
      resetControlsTimeout()
    }
  }

  return (
    <div
      ref={containerRef}
      className={`relative group flex items-center justify-center overflow-hidden rounded-xl bg-black ${className}`}
      onMouseMove={resetControlsTimeout}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      onClick={togglePlay}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        className="w-full h-full object-contain"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onClick={(e) => { e.stopPropagation(); togglePlay(); }}
        playsInline
      />

      {/* Center Play Button Overlay */}
      <AnimatePresence>
        {!isPlaying && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.2 }}
            className="absolute rounded-full p-5 bg-black/40 backdrop-blur-md text-white shadow-2xl border border-white/10 hover:bg-black/60 hover:scale-105 transition-all z-10"
            onClick={togglePlay}
          >
            <Play size={40} className="ml-2" fill="currentColor" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Controls Bar */}
      <AnimatePresence>
        {showControls && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-0 left-0 right-0 px-4 md:px-6 py-4 md:pb-6 pt-12 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex flex-col gap-2 z-20"
            onClick={(e) => e.stopPropagation()} // Prevent click-through to toggle play
          >
            {/* Progress Bar */}
            <div
              className="w-full h-1.5 md:h-2 bg-white/20 rounded-full cursor-pointer overflow-hidden group/bar"
              onClick={handleSeek}
              onMouseMove={(e) => {
                e.stopPropagation();
                // Custom hover logic could go here
              }}
            >
              <div
                className="h-full bg-primary relative transition-all ease-linear"
                style={{ width: `${progress}%` }}
              >
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-md opacity-0 group-hover/bar:tracking-wider delay-75 group-hover/bar:opacity-100 transition-opacity"></div>
              </div>
            </div>

            <div className="flex items-center justify-between text-white/90 mt-2">
              <div className="flex items-center gap-2 md:gap-4">
                <button
                  onClick={togglePlay}
                  className="p-1.5 md:p-2 rounded-full hover:bg-white/10 transition-colors"
                  title={isPlaying ? "Tạm dừng" : "Phát"}
                >
                  {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                </button>
                
                <div className="flex items-center gap-1 md:gap-2">
                  <button 
                    onClick={(e) => skipRelative(-10, e)}
                    className="p-1 md:p-1.5 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-colors"
                    title="Tua lại 10s"
                  >
                    <Rewind size={18} />
                  </button>
                  <button 
                    onClick={(e) => skipRelative(10, e)}
                    className="p-1 md:p-1.5 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-colors"
                    title="Tiến 10s"
                  >
                    <FastForward size={18} />
                  </button>
                </div>

                <div className="flex items-center gap-1.5 md:gap-3 group/volume relative">
                  <button
                    onClick={toggleMute}
                    className="p-1 md:p-1.5 rounded-full hover:bg-white/10 transition-colors"
                    title={isMuted ? "Bật âm" : "Tắt âm"}
                  >
                    {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                  </button>
                  {/* Optional Volume Slider could go here, visible on hover group/volume */}
                </div>
                
                <span className="text-xs md:text-sm font-medium font-body opacity-80 tracking-wide select-none">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={toggleFullscreen}
                  className="p-1.5 md:p-2 rounded-full hover:bg-white/10 transition-colors ml-auto"
                  title={isFullscreen ? "Thu nhỏ" : "Phóng to"}
                >
                  {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
