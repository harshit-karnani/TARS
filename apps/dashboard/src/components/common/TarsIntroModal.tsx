import React, { useState, useEffect } from 'react'
import DecryptedText from './DecryptedText'

const PHASE_1_DURATION = 3000 // 3.0 seconds

const INTRO_TEXT = "TARS RUNTIME SECURITY GATEWAY // CONTRACT ENFORCEMENT & SHADOW ML SUBSYSTEMS ARMED"

export const TarsIntroModal: React.FC<{
  isOpen: boolean
  onClose: () => void
}> = ({ isOpen, onClose }) => {
  const [phase, setPhase] = useState<1 | 2>(1)
  const [elapsedSec, setElapsedSec] = useState<string>('0.0')

  const onCloseRef = React.useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!isOpen) return

    setPhase(1)
    setElapsedSec('0.0')
    const startTime = performance.now()

    // Timer interval
    const timerInterval = setInterval(() => {
      const elapsed = (performance.now() - startTime) / 1000
      setElapsedSec(elapsed.toFixed(1))
    }, 80)

    // Transition to Phase 2 at 3 seconds
    const phase2Timeout = setTimeout(() => {
      setPhase(2)
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
      clearInterval(timerInterval)
      clearTimeout(phase2Timeout)
      clearTimeout(completeTimeout)
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center w-screen h-screen overflow-hidden bg-[#05070a]">
      {/* Full-screen LCD Screen */}
      <div className="lcd-display-surface relative w-full h-full flex flex-col items-center justify-center overflow-hidden transition-colors duration-700">
        {/* Scanlines & Diagonal Matrix Texture across entire screen */}
        <div className="scanlines-overlay absolute inset-0 pointer-events-none z-10 opacity-70"></div>
        {/* Vignette and corner shadow */}
        <div className="absolute inset-0 pointer-events-none z-10 shadow-[inset_0_0_120px_rgba(0,0,0,0.35)]"></div>

        {/* Main Stage Container - Centered Full Screen */}
        <div className="relative z-20 flex flex-col items-center justify-center w-full px-6 md:px-16 py-12 text-center">
          {phase === 1 ? (
            <div className="w-full flex flex-col items-center justify-center select-none max-w-4xl">
              <div className="text-[#0d2229] font-mono text-base sm:text-xl md:text-2xl lg:text-3xl leading-relaxed md:leading-loose tracking-wide md:tracking-wider font-semibold drop-shadow-sm whitespace-pre-wrap break-words">
                <DecryptedText
                  text={INTRO_TEXT}
                  speed={40}
                  maxIterations={25}
                  sequential={true}
                  revealDirection="start"
                  animateOn="view"
                  className="text-[#0d2229]"
                  encryptedClassName="text-[#10b981] opacity-75 font-mono"
                  parentClassName="inline-block"
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center w-full select-none transform transition-all duration-300">
              <h1 className="tars-title text-7xl sm:text-8xl md:text-9xl lg:text-[11rem] font-black text-[#0c1e24] tracking-[0.22em] uppercase leading-none drop-shadow-[0_4px_12px_rgba(0,0,0,0.2)]">
                <DecryptedText
                  text="TARS"
                  speed={60}
                  maxIterations={15}
                  sequential={false}
                  animateOn="view"
                  className="text-[#0c1e24]"
                  encryptedClassName="text-[#10b981]"
                />
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
