// ─── Shared types ────────────────────────────────────────────────────────────

export interface PaperStock {
  id: string
  name: string
  width_in: number
  height_in: number
  bw_price: number
  color_price: number
  duplex_surcharge: number
  stock_qty: number
  low_stock_threshold: number
  is_active: boolean
}

export interface PricingTier {
  id: string
  paper_stock_id: string
  min_qty: number
  max_qty: number | null
  discount_percent: number
}

export interface ProductPreset {
  id: string
  name: string
  finished_width_in: number
  finished_height_in: number
  description: string | null
  default_paper_stock_id: string | null
  is_active: boolean
}

export interface FinishingOption {
  id: string
  name: string
  price_per_sheet: number
  price_per_piece: number
  flat_price: number
  description: string | null
  is_active: boolean
}

// ─── Imposition ──────────────────────────────────────────────────────────────
// Returns the maximum number of finished pieces that fit on one press sheet,
// trying both normal and rotated orientations.
export function calcItemsPerSheet(
  sheetW: number,
  sheetH: number,
  itemW: number,
  itemH: number,
): number {
  const normal  = Math.floor(sheetW / itemW) * Math.floor(sheetH / itemH)
  const rotated = Math.floor(sheetW / itemH) * Math.floor(sheetH / itemW)
  return Math.max(normal, rotated, 1)
}

// Returns the dominant layout string e.g. "4 across × 2 down (normal)"
export function impositionLabel(
  sheetW: number,
  sheetH: number,
  itemW: number,
  itemH: number,
): string {
  const acrossN  = Math.floor(sheetW / itemW)
  const downN    = Math.floor(sheetH / itemH)
  const totalN   = acrossN * downN

  const acrossR  = Math.floor(sheetW / itemH)
  const downR    = Math.floor(sheetH / itemW)
  const totalR   = acrossR * downR

  if (totalR > totalN) {
    return `${acrossR} × ${downR} rotated (${totalR}/sheet)`
  }
  return `${acrossN} × ${downN} (${totalN}/sheet)`
}

// Returns full imposition geometry for visual layout preview
export interface ImpositionLayout {
  rotated: boolean
  across: number          // pieces per row
  down: number            // pieces per column
  total: number           // total pieces per sheet
  pieceW: number          // effective piece width on sheet
  pieceH: number          // effective piece height on sheet
  sheetW: number
  sheetH: number
  marginX: number         // empty space on each side
  marginY: number
  wastePct: number        // % of sheet area wasted
}

export function calcImpositionLayout(
  sheetW: number,
  sheetH: number,
  itemW: number,
  itemH: number,
): ImpositionLayout {
  const acrossN = Math.floor(sheetW / itemW)
  const downN   = Math.floor(sheetH / itemH)
  const totalN  = acrossN * downN

  const acrossR = Math.floor(sheetW / itemH)
  const downR   = Math.floor(sheetH / itemW)
  const totalR  = acrossR * downR

  const rotated = totalR > totalN
  const across  = rotated ? acrossR : acrossN
  const down    = rotated ? downR   : downN
  const total   = rotated ? totalR  : totalN
  const pieceW  = rotated ? itemH   : itemW
  const pieceH  = rotated ? itemW   : itemH

  const usedW   = across * pieceW
  const usedH   = down   * pieceH
  const marginX = (sheetW - usedW) / 2
  const marginY = (sheetH - usedH) / 2
  const sheetA  = sheetW * sheetH
  const usedA   = total * pieceW * pieceH
  const wastePct = sheetA > 0 ? Math.round((1 - usedA / sheetA) * 100) : 0

  return { rotated, across, down, total, pieceW, pieceH, sheetW, sheetH, marginX, marginY, wastePct }
}

// ─── Quote calculator ────────────────────────────────────────────────────────

export interface CalcParams {
  paperStock: PaperStock
  tiers: PricingTier[]
  quantity: number          // finished pieces
  isColor: boolean
  isDuplex: boolean
  itemsPerSheet: number     // from calcItemsPerSheet()
  selectedFinishings: Array<{ option: FinishingOption; included: boolean }>
}

export interface CalcResult {
  sheetsNeeded: number
  itemsPerSheet: number
  impressions: number
  pricePerImpression: number
  paperCostRaw: number      // before tier discount
  tierApplied: PricingTier | null
  paperCostAfterTier: number
  duplexCost: number
  finishingBreakdown: Array<{ name: string; cost: number }>
  finishingTotal: number
  subtotal: number
  isLowStock: boolean
}

export function calcQuote(p: CalcParams): CalcResult {
  const sheetsNeeded = Math.ceil(p.quantity / p.itemsPerSheet)
  // Each side of a sheet is one impression
  const impressions  = p.isDuplex ? sheetsNeeded * 2 : sheetsNeeded
  const pricePerImpression = p.isColor ? p.paperStock.color_price : p.paperStock.bw_price
  const paperCostRaw = impressions * pricePerImpression

  // Best matching tier (highest min_qty that still fits)
  const sortedTiers = [...p.tiers]
    .filter(t => t.min_qty <= p.quantity && (t.max_qty === null || p.quantity <= t.max_qty))
    .sort((a, b) => b.min_qty - a.min_qty)
  const tierApplied = sortedTiers[0] ?? null
  const discount = tierApplied ? tierApplied.discount_percent / 100 : 0
  const paperCostAfterTier = paperCostRaw * (1 - discount)

  // Duplex surcharge (per physical sheet)
  const duplexCost = p.isDuplex ? sheetsNeeded * p.paperStock.duplex_surcharge : 0

  // Finishing
  const finishingBreakdown: Array<{ name: string; cost: number }> = []
  let finishingTotal = 0
  for (const { option, included } of p.selectedFinishings) {
    if (!included) continue
    const cost =
      option.flat_price +
      option.price_per_sheet * sheetsNeeded +
      option.price_per_piece * p.quantity
    finishingBreakdown.push({ name: option.name, cost })
    finishingTotal += cost
  }

  const subtotal = paperCostAfterTier + duplexCost + finishingTotal

  return {
    sheetsNeeded,
    itemsPerSheet: p.itemsPerSheet,
    impressions,
    pricePerImpression,
    paperCostRaw,
    tierApplied,
    paperCostAfterTier,
    duplexCost,
    finishingBreakdown,
    finishingTotal,
    subtotal,
    isLowStock: p.paperStock.stock_qty < p.paperStock.low_stock_threshold,
  }
}
