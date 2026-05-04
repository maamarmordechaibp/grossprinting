'use client'

import { calcImpositionLayout } from '@/lib/pricing'

interface Props {
  sheetW: number
  sheetH: number
  itemW: number
  itemH: number
  /** Max pixel width of the SVG */
  maxWidth?: number
}

/**
 * Visual layout preview: shows how finished pieces are arranged on a press sheet.
 * Auto-detects optimal orientation (rotated vs normal) and draws a true-to-scale diagram.
 */
export function ImpositionPreview({ sheetW, sheetH, itemW, itemH, maxWidth = 280 }: Props) {
  if (sheetW <= 0 || sheetH <= 0 || itemW <= 0 || itemH <= 0) return null

  const layout = calcImpositionLayout(sheetW, sheetH, itemW, itemH)
  const { rotated, across, down, total, pieceW, pieceH, marginX, marginY, wastePct } = layout

  // Scale to fit maxWidth or maxHeight
  const ratio = sheetW / sheetH
  const svgW = ratio >= 1 ? maxWidth : Math.round(maxWidth * ratio * 0.8)
  const svgH = svgW / ratio
  const scale = svgW / sheetW

  const pieces: { x: number; y: number }[] = []
  for (let r = 0; r < down; r++) {
    for (let c = 0; c < across; c++) {
      pieces.push({
        x: (marginX + c * pieceW) * scale,
        y: (marginY + r * pieceH) * scale,
      })
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-foreground">
            {across} across × {down} down
          </span>
          <span className="px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold">
            {total} per sheet
          </span>
          {rotated && (
            <span className="px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
              rotated 90°
            </span>
          )}
        </div>
        <span className="text-muted-foreground">
          {wastePct}% waste
        </span>
      </div>

      <div className="rounded-lg border bg-muted/30 p-3 flex items-center justify-center">
        <svg
          width={svgW}
          height={svgH}
          viewBox={`0 0 ${svgW} ${svgH}`}
          className="drop-shadow-sm"
        >
          {/* Sheet */}
          <rect
            x={0.5}
            y={0.5}
            width={svgW - 1}
            height={svgH - 1}
            fill="white"
            stroke="#94a3b8"
            strokeWidth={1}
          />
          {/* Pieces */}
          {pieces.map((p, i) => (
            <g key={i}>
              <rect
                x={p.x}
                y={p.y}
                width={pieceW * scale}
                height={pieceH * scale}
                fill="#6366f1"
                fillOpacity={0.15}
                stroke="#6366f1"
                strokeWidth={0.8}
              />
              {/* Centered number */}
              {pieceW * scale > 16 && pieceH * scale > 12 && (
                <text
                  x={p.x + (pieceW * scale) / 2}
                  y={p.y + (pieceH * scale) / 2 + 3}
                  textAnchor="middle"
                  fontSize={Math.min(10, pieceW * scale * 0.25)}
                  fill="#4338ca"
                  fontWeight={600}
                >
                  {i + 1}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>

      <p className="text-[11px] text-muted-foreground text-center">
        {sheetW}" × {sheetH}" sheet · piece {itemW}" × {itemH}"
        {rotated && ' (placed sideways for best fit)'}
      </p>
    </div>
  )
}
