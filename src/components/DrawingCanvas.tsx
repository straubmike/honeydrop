import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { useCompactViewport } from '../useCompactViewport'
import {
  DRAW_ASPECT,
  DRAW_COLORS,
  STROKE_WIDTH,
  type DrawingData,
  type DrawingPoint,
  type DrawingStroke,
} from '../drawing'

interface DrawingCanvasProps {
  initial?: DrawingData | null
  onClose: () => void
  onSave: (data: DrawingData) => void
}

function pointFromEvent(canvas: HTMLCanvasElement, event: ReactPointerEvent<HTMLCanvasElement>): DrawingPoint {
  const rect = canvas.getBoundingClientRect()
  const width = rect.width || 1
  const height = rect.height || 1
  return {
    x: Math.min(1, Math.max(0, (event.clientX - rect.left) / width)),
    y: Math.min(1, Math.max(0, (event.clientY - rect.top) / height)),
  }
}

function paint(canvas: HTMLCanvasElement, background: string, strokes: DrawingStroke[]) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = window.devicePixelRatio || 1
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  if (!width || !height) return
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = background
  ctx.fillRect(0, 0, width, height)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const stroke of strokes) {
    if (!stroke.points.length) continue
    ctx.strokeStyle = stroke.color
    ctx.lineWidth = stroke.width * Math.min(width, height)
    ctx.beginPath()
    ctx.moveTo(stroke.points[0].x * width, stroke.points[0].y * height)
    for (const point of stroke.points.slice(1)) {
      ctx.lineTo(point.x * width, point.y * height)
    }
    if (stroke.points.length === 1) {
      ctx.lineTo(stroke.points[0].x * width + 0.01, stroke.points[0].y * height)
    }
    ctx.stroke()
  }
}

export function DrawingPreview({ data }: { data: DrawingData }) {
  // Match the phone drawing stage (portrait). Normalized strokes were captured on that
  // aspect, so a matching viewBox keeps circles round and short marks (dot eyes) visible.
  const vbW = 100
  const vbH = vbW / DRAW_ASPECT
  const strokeScale = Math.min(vbW, vbH)

  return (
    <svg
      className="item__drawing"
      viewBox={`0 0 ${vbW} ${vbH}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <rect width={vbW} height={vbH} fill={data.background} />
      {data.strokes.map((stroke, index) => {
        if (!stroke.points.length) return null
        const width = stroke.width * strokeScale
        if (stroke.points.length === 1) {
          const point = stroke.points[0]
          return (
            <circle
              key={index}
              cx={point.x * vbW}
              cy={point.y * vbH}
              r={width / 2}
              fill={stroke.color}
            />
          )
        }
        return (
          <polyline
            key={index}
            points={stroke.points.map((point) => `${point.x * vbW},${point.y * vbH}`).join(' ')}
            fill="none"
            stroke={stroke.color}
            strokeWidth={width}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )
      })}
    </svg>
  )
}

export function DrawingCanvas({ initial, onClose, onSave }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const currentRef = useRef<DrawingStroke | null>(null)
  const compact = useCompactViewport()
  const [bgIndex, setBgIndex] = useState(() => {
    if (!initial) return 0
    const index = DRAW_COLORS.indexOf(initial.background as (typeof DRAW_COLORS)[number])
    return index >= 0 ? index : 0
  })
  const [locked, setLocked] = useState(Boolean(initial))
  const [lockedBg, setLockedBg] = useState(initial?.background ?? DRAW_COLORS[0])
  const [color, setColor] = useState(initial?.strokes.at(-1)?.color ?? DRAW_COLORS[0])
  const [strokes, setStrokes] = useState<DrawingStroke[]>(initial?.strokes ?? [])
  const [live, setLive] = useState<DrawingStroke | null>(null)

  const background = locked ? lockedBg : DRAW_COLORS[bgIndex]

  useEffect(() => {
    document.body.classList.add('draw-open')
    return () => document.body.classList.remove('draw-open')
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    const canvas = canvasRef.current
    const stage = stageRef.current
    if (!canvas || !stage) return
    const redraw = () => paint(canvas, background, live ? [...strokes, live] : strokes)
    redraw()
    const observer = new ResizeObserver(redraw)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [background, live, strokes])

  const cycleBackground = () => {
    if (locked) return
    setBgIndex((index) => (index + 1) % DRAW_COLORS.length)
  }

  const pickColor = (next: string) => {
    if (!locked) {
      setLocked(true)
      setLockedBg(DRAW_COLORS[bgIndex])
    }
    setColor(next)
  }

  const beginStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!locked || event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const stroke: DrawingStroke = {
      color,
      width: STROKE_WIDTH,
      points: [pointFromEvent(event.currentTarget, event)],
    }
    currentRef.current = stroke
    setLive(stroke)
  }

  const moveStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const current = currentRef.current
    if (!current) return
    current.points.push(pointFromEvent(event.currentTarget, event))
    setLive({ ...current, points: [...current.points] })
  }

  const endStroke = () => {
    const current = currentRef.current
    currentRef.current = null
    setLive(null)
    if (!current?.points.length) return
    setStrokes((prev) => [...prev, current])
  }

  const undo = () => {
    setStrokes((prev) => prev.slice(0, -1))
  }

  const save = () => {
    if (!locked) return
    onSave({ background, strokes })
  }

  return createPortal(
    <div className={compact ? 'draw-overlay draw-overlay--full' : 'draw-overlay'} role="presentation">
      <div className="draw-phone" role="dialog" aria-label="Drawing">
        <div className="draw-phone__bar">
          <button type="button" className="draw-icon-btn" onClick={onClose} aria-label="Close drawing">
            ×
          </button>
          <div className="draw-phone__actions">
            <button
              type="button"
              className="draw-icon-btn"
              onClick={undo}
              disabled={!strokes.length}
              aria-label="Undo last stroke"
            >
              ↺
            </button>
            <button
              type="button"
              className="draw-icon-btn draw-icon-btn--ok"
              onClick={save}
              disabled={!locked}
              aria-label="Post drawing"
            >
              ✓
            </button>
          </div>
        </div>

        <div className="draw-stage" ref={stageRef}>
          <canvas
            ref={canvasRef}
            onPointerDown={beginStroke}
            onPointerMove={moveStroke}
            onPointerUp={endStroke}
            onPointerCancel={endStroke}
          />
          {!locked ? (
            <button
              type="button"
              className={background === '#fffaf2' ? 'draw-hint draw-hint--on-light' : 'draw-hint'}
              onClick={cycleBackground}
            >
              tap for background color
            </button>
          ) : null}
        </div>

        <div className="draw-palette" role="group" aria-label="Colors">
          {DRAW_COLORS.map((swatch) => (
            <button
              key={swatch}
              type="button"
              className={locked && color === swatch ? 'draw-swatch draw-swatch--on' : 'draw-swatch'}
              style={{ background: swatch }}
              aria-label={`Use ${swatch}`}
              onClick={() => pickColor(swatch)}
            />
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}
