import React, { useState, useEffect } from 'react'

const PHASE_1_DURATION = 3000 // 3.0 seconds
const CORRUPT_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789.:;=+-*&%$#@!/?|<>~^'

const REFERENCE_SKELETON = [
  "Lorem ipsum dolor sit amet c::se.t:..; ..::is",
  "icing elit. Similique ....:tu. dig.::..::. po",
  "rro eius quam dolore...: et enim v:.: et nobis",
  "maxime."
]

export const TarsIntroModal: React.FC<{
  isOpen: boolean
  onClose: () => void
}> = ({ isOpen, onClose }) => {
  const [phase, setPhase] = useState<1 | 2>(1)
  const [elapsedSec, setElapsedSec] = useState<string>('0.0')
  const [scrambleText, setScrambleText] = useState<string>('')
  const [flicker, setFlicker] = useState<boolean>(false)

  const onCloseRef = React.useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!isOpen) return

    setPhase(1)
    setElapsedSec('0.0')
    const startTime = performance.now()

    // Scramble interval
    const scrambleInterval = setInterval(() => {
      const elapsed = performance.now() - startTime
      if (elapsed < PHASE_1_DURATION) {
        const intensity = 0.35 + Math.sin(elapsed * 0.01) * 0.25
        const lines = REFERENCE_SKELETON.map(line => {
          return line.split('').map(char => {
            if (char === ' ') return ' '
            if (Math.random() < intensity) {
              return CORRUPT_CHARS[Math.floor(Math.random() * CORRUPT_CHARS.length)]
            }
            return char
          }).join('')
        })
        setScrambleText(lines.join('\n'))
        setFlicker(Math.random() > 0.88)
      }
    }, 55)

    // Timer interval
    const timerInterval = setInterval(() => {
      const elapsed = (performance.now() - startTime) / 1000
      setElapsedSec(elapsed.toFixed(1))
    }, 80)

    // Transition to Phase 2 at 3 seconds
    const phase2Timeout = setTimeout(() => {
      clearInterval(scrambleInterval)
      setPhase(2)
      setFlicker(false)
    }, PHASE_1_DURATION)

    // Complete sequence at 5.0 seconds and auto-proceed into dashboard
    const completeTimeout = setTimeout(() => {
      clearInterval(timerInterval)
      setElapsedSec('5.0')
      setTimeout(() => {
        onCloseRef.current()
      }, 700)
    }, 5000)

    return () => {
      clearInterval(scrambleInterval)
      clearInterval(timerInterval)
      clearTimeout(phase2Timeout)
      clearTimeout(completeTimeout)
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center w-screen h-screen overflow-hidden bg-[#05070a]">
      {/* Full-screen LCD Screen */}
      <div
        className={`lcd-display-surface relative w-full h-full flex flex-col items-center justify-center overflow-hidden transition-colors duration-700 ${
          flicker ? 'flicker' : ''
        }`}
      >
        {/* Scanlines & Diagonal Matrix Texture across entire screen */}
        <div className="scanlines-overlay absolute inset-0 pointer-events-none z-10 opacity-70"></div>
        {/* Vignette and corner shadow */}
        <div className="absolute inset-0 pointer-events-none z-10 shadow-[inset_0_0_120px_rgba(0,0,0,0.35)]"></div>

        {/* Main Stage Container - Centered Full Screen */}
        <div className="relative z-20 flex flex-col items-center justify-center w-full px-6 md:px-16 py-12 text-center">
          {phase === 1 ? (
            <div className="w-full flex flex-col items-center justify-center select-none max-w-4xl">
              <pre className="text-[#0d2229] font-mono text-base sm:text-xl md:text-2xl lg:text-3xl leading-relaxed md:leading-loose tracking-wide md:tracking-wider font-semibold drop-shadow-sm whitespace-pre-wrap break-words">
                {scrambleText || 'INITIALIZING MATRIX DECRYPTION...'}
              </pre>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center w-full select-none transform transition-all duration-300">
              <h1 className="tars-title text-7xl sm:text-8xl md:text-9xl lg:text-[11rem] font-black text-[#0c1e24] tracking-[0.22em] uppercase leading-none drop-shadow-[0_4px_12px_rgba(0,0,0,0.2)]">
                TARS
              </h1>
              <div className="mt-8 flex items-center space-x-3 text-[#0c1e24]/85 text-sm md:text-base font-bold tracking-[0.25em] uppercase font-mono">
                <span className="inline-block w-3 h-3 rounded-full bg-[#0c1e24] animate-ping"></span>
                <span>SYSTEM ACTIVE // CORE VERIFIED</span>
              </div>
            </div>
          )}
        </div>

        {/* Full-screen Time / Status tracker bar in footer */}
        <div className="absolute bottom-6 left-8 right-8 z-20 flex justify-between items-center text-xs md:text-sm font-mono text-[#0c1e24]/70 tracking-widest uppercase font-semibold">
          <span>
            {phase === 1
              ? `PHASE 1: DECRYPTING [${elapsedSec}s]`
              : `PHASE 2: VERIFIED [${elapsedSec}s]`}
          </span>
          <span>SEC_PROTOCOL_v4.2 // RUNTIME_GATEWAY</span>
        </div>

        {/* Dismiss / Skip button in top corner */}
        <button
          onClick={onClose}
          className="absolute top-6 right-8 bg-[#0a1318]/90 hover:bg-[#12222a] text-[#dfe7e2] hover:text-white border border-[#10b981]/40 text-xs md:text-sm font-mono px-4 py-2 rounded-full transition-all z-40 cursor-pointer shadow-xl tracking-wider"
        >
          ✕ Enter Console [Skip]
        </button>
      </div>
    </div>
  )
}
