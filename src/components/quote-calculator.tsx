'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Loader2, AlertTriangle, Calculator, CheckCircle2 } from 'lucide-react'
import {
  calcItemsPerSheet, calcQuote, impositionLabel,
  type PaperStock, type PricingTier, type ProductPreset, type FinishingOption, type CalcResult,
} from '@/lib/pricing'
import { ImpositionPreview } from '@/components/imposition-preview'

interface Props {
  /** Called when the user clicks "Use These Prices" — passes subtotal, tax placeholder, and total */
  onApply: (subtotal: number, tax: number, total: number, notes: string) => void
  /** Optional list of order items to pre-fill quantity from */
  orderTotalAmount?: number
}

export function QuoteCalculator({ onApply, orderTotalAmount }: Props) {
  const supabase = createClient()

  const [stocks, setStocks]       = useState<PaperStock[]>([])
  const [tiers, setTiers]         = useState<PricingTier[]>([])
  const [presets, setPresets]     = useState<ProductPreset[]>([])
  const [finishings, setFinishings] = useState<FinishingOption[]>([])
  const [loading, setLoading]     = useState(true)

  // Calculator inputs
  const [presetId, setPresetId]   = useState('')
  const [stockId, setStockId]     = useState('')
  const [qty, setQty]             = useState(String(Math.round(orderTotalAmount ?? 100)))
  const [isColor, setIsColor]     = useState(true)
  const [isDuplex, setIsDuplex]   = useState(false)
  const [customW, setCustomW]     = useState('')
  const [customH, setCustomH]     = useState('')
  const [selectedFinishings, setSelectedFinishings] = useState<Record<string, boolean>>({})
  const [taxPct, setTaxPct]       = useState('0')

  const [result, setResult]       = useState<CalcResult | null>(null)

  const load = useCallback(async () => {
    const [s, t, p, f] = await Promise.all([
      supabase.from('paper_stocks').select('*').eq('is_active', true).order('name'),
      supabase.from('pricing_tiers').select('*').order('min_qty'),
      supabase.from('product_presets').select('*').eq('is_active', true).order('name'),
      supabase.from('finishing_options').select('*').eq('is_active', true).order('name'),
    ])
    const stockList = (s.data ?? []) as PaperStock[]
    const presetList = (p.data ?? []) as ProductPreset[]
    setStocks(stockList)
    setTiers((t.data ?? []) as PricingTier[])
    setPresets(presetList)
    setFinishings((f.data ?? []) as FinishingOption[])
    // Auto-select first stock
    if (stockList.length > 0) setStockId(stockList[0].id)
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  // When preset changes, auto-select its default paper stock
  useEffect(() => {
    if (!presetId) return
    const preset = presets.find(p => p.id === presetId)
    if (preset?.default_paper_stock_id) setStockId(preset.default_paper_stock_id)
  }, [presetId, presets])

  function calculate() {
    const stock = stocks.find(s => s.id === stockId)
    if (!stock) { toast.error('Select a paper stock'); return }

    const quantity = parseInt(qty)
    if (!quantity || quantity < 1) { toast.error('Enter a valid quantity'); return }

    // Item dimensions
    let itemW = 0, itemH = 0
    if (presetId) {
      const preset = presets.find(p => p.id === presetId)
      if (preset) { itemW = preset.finished_width_in; itemH = preset.finished_height_in }
    } else {
      itemW = parseFloat(customW); itemH = parseFloat(customH)
    }
    if (!itemW || !itemH) { toast.error('Select a preset or enter custom dimensions'); return }

    const itemsPerSheet = calcItemsPerSheet(stock.width_in, stock.height_in, itemW, itemH)
    const stockTiers = tiers.filter(t => t.paper_stock_id === stockId)

    const r = calcQuote({
      paperStock: stock,
      tiers: stockTiers,
      quantity,
      isColor,
      isDuplex,
      itemsPerSheet,
      selectedFinishings: finishings.map(f => ({ option: f, included: selectedFinishings[f.id] ?? false })),
    })
    setResult(r)
  }

  function applyToQuote() {
    if (!result) return
    const taxAmt = result.subtotal * (parseFloat(taxPct) / 100 || 0)
    const total  = result.subtotal + taxAmt

    const stock = stocks.find(s => s.id === stockId)
    const preset = presets.find(p => p.id === presetId)
    const lines: string[] = []
    lines.push(`Qty: ${qty} | ${preset?.name ?? `${customW}"×${customH}"`}`)
    lines.push(`Paper: ${stock?.name ?? ''} (${isColor ? 'Color' : 'B&W'}${isDuplex ? ', duplex' : ''})`)
    lines.push(`Layout: ${result.itemsPerSheet}/sheet → ${result.sheetsNeeded} sheets`)
    if (result.tierApplied) lines.push(`Volume discount: ${result.tierApplied.discount_percent}%`)
    if (result.finishingBreakdown.length > 0) {
      lines.push('Finishings: ' + result.finishingBreakdown.map(f => `${f.name} $${f.cost.toFixed(2)}`).join(', '))
    }

    onApply(result.subtotal, taxAmt, total, lines.join('\n'))
    toast.success('Prices applied to quote form')
  }

  if (loading) return (
    <div className="flex justify-center py-8">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  )

  const selectedStock = stocks.find(s => s.id === stockId)
  const selectedPreset = presets.find(p => p.id === presetId)

  return (
    <div className="space-y-5">
      {/* Product */}
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Product / Size</Label>
          <select
            value={presetId}
            onChange={e => setPresetId(e.target.value)}
            className="w-full h-9 text-sm border rounded-md px-3 bg-background"
          >
            <option value="">— Custom size —</option>
            {presets.map(p => (
              <option key={p.id} value={p.id}>{p.name} ({p.finished_width_in}" × {p.finished_height_in}")</option>
            ))}
          </select>
        </div>

        {!presetId && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Finished width (in)</Label>
              <Input type="number" min="0" step="0.125" value={customW} onChange={e => setCustomW(e.target.value)} className="h-8 text-sm" placeholder="e.g. 2" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Finished height (in)</Label>
              <Input type="number" min="0" step="0.125" value={customH} onChange={e => setCustomH(e.target.value)} className="h-8 text-sm" placeholder="e.g. 3.5" />
            </div>
          </div>
        )}
      </div>

      <Separator />

      {/* Paper stock */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Paper Stock</Label>
        <select
          value={stockId}
          onChange={e => setStockId(e.target.value)}
          className="w-full h-9 text-sm border rounded-md px-3 bg-background"
        >
          <option value="">— Select paper —</option>
          {stocks.map(s => (
            <option key={s.id} value={s.id}>
              {s.name} — {s.width_in}" × {s.height_in}"
              {s.stock_qty < s.low_stock_threshold ? ` ⚠ Low (${s.stock_qty} left)` : ''}
            </option>
          ))}
        </select>

        {selectedStock && selectedStock.stock_qty < selectedStock.low_stock_threshold && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span><strong>Low stock:</strong> only {selectedStock.stock_qty} sheets on hand (threshold: {selectedStock.low_stock_threshold}). Reorder before confirming.</span>
          </div>
        )}

        {selectedStock && (
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground pl-1">
            <span>B&W: <strong className="text-foreground">${Number(selectedStock.bw_price).toFixed(4)}</strong>/impression</span>
            <span>Color: <strong className="text-foreground">${Number(selectedStock.color_price).toFixed(4)}</strong>/impression</span>
            {Number(selectedStock.duplex_surcharge) > 0 && (
              <span>Duplex: +<strong className="text-foreground">${Number(selectedStock.duplex_surcharge).toFixed(4)}</strong>/sheet</span>
            )}
          </div>
        )}
      </div>

      <Separator />

      {/* Print options */}
      <div className="space-y-3">
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Print Options</Label>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Quantity</Label>
            <Input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Color mode</Label>
            <div className="flex gap-1 mt-1">
              <Button size="sm" variant={isColor ? 'default' : 'outline'} className="flex-1 h-8 text-xs" onClick={() => setIsColor(true)}>Color</Button>
              <Button size="sm" variant={!isColor ? 'default' : 'outline'} className="flex-1 h-8 text-xs" onClick={() => setIsColor(false)}>B&W</Button>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Sides</Label>
            <div className="flex gap-1 mt-1">
              <Button size="sm" variant={!isDuplex ? 'default' : 'outline'} className="flex-1 h-8 text-xs" onClick={() => setIsDuplex(false)}>1-sided</Button>
              <Button size="sm" variant={isDuplex ? 'default' : 'outline'} className="flex-1 h-8 text-xs" onClick={() => setIsDuplex(true)}>2-sided</Button>
            </div>
          </div>
        </div>
      </div>

      {/* Imposition preview */}
      {selectedStock && (selectedPreset || (parseFloat(customW) > 0 && parseFloat(customH) > 0)) && (
        <div className="rounded-lg border bg-card px-3 py-3 space-y-2">
          <ImpositionPreview
            sheetW={selectedStock.width_in}
            sheetH={selectedStock.height_in}
            itemW={selectedPreset ? selectedPreset.finished_width_in : parseFloat(customW)}
            itemH={selectedPreset ? selectedPreset.finished_height_in : parseFloat(customH)}
          />
          <p className="text-[11px] text-muted-foreground text-center">
            {impositionLabel(
              selectedStock.width_in, selectedStock.height_in,
              selectedPreset ? selectedPreset.finished_width_in : parseFloat(customW),
              selectedPreset ? selectedPreset.finished_height_in : parseFloat(customH),
            )}
          </p>
        </div>
      )}

      <Separator />

      {/* Finishing */}
      {finishings.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Finishing Options</Label>
          <div className="space-y-1.5">
            {finishings.map(f => (
              <label key={f.id} className="flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer hover:bg-muted/30 transition-colors">
                <input
                  type="checkbox"
                  checked={selectedFinishings[f.id] ?? false}
                  onChange={e => setSelectedFinishings(prev => ({ ...prev, [f.id]: e.target.checked }))}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <span className="text-sm font-medium">{f.name}</span>
                  <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                    {Number(f.flat_price) > 0    && <span>Setup ${Number(f.flat_price).toFixed(2)}</span>}
                    {Number(f.price_per_sheet) > 0 && <span>+${Number(f.price_per_sheet).toFixed(4)}/sheet</span>}
                    {Number(f.price_per_piece) > 0 && <span>+${Number(f.price_per_piece).toFixed(4)}/piece</span>}
                    {f.description && <span className="text-muted-foreground/60">{f.description}</span>}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      <Button onClick={calculate} className="w-full gap-2">
        <Calculator className="h-4 w-4" /> Calculate Estimate
      </Button>

      {/* Result */}
      {result && (
        <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4 space-y-3">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <CheckCircle2 className="h-4 w-4 text-primary" /> Estimate Breakdown
          </div>

          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Layout</span>
              <span>{result.itemsPerSheet}/sheet → <strong className="text-foreground">{result.sheetsNeeded} sheets</strong></span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Impressions</span>
              <span>{result.impressions} × ${Number(result.pricePerImpression).toFixed(4)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Paper cost</span>
              <span>${result.paperCostRaw.toFixed(2)}</span>
            </div>
            {result.tierApplied && (
              <div className="flex justify-between text-emerald-700">
                <span>Volume discount ({result.tierApplied.discount_percent}%)</span>
                <span>−${(result.paperCostRaw - result.paperCostAfterTier).toFixed(2)}</span>
              </div>
            )}
            {result.duplexCost > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Duplex surcharge</span>
                <span>${result.duplexCost.toFixed(2)}</span>
              </div>
            )}
            {result.finishingBreakdown.map(f => (
              <div key={f.name} className="flex justify-between text-muted-foreground">
                <span>{f.name}</span>
                <span>${f.cost.toFixed(2)}</span>
              </div>
            ))}
          </div>

          <Separator />

          <div className="flex justify-between font-bold text-base">
            <span>Subtotal</span>
            <span>${result.subtotal.toFixed(2)}</span>
          </div>

          {result.isLowStock && (
            <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Paper stock is low — confirm availability before creating quote.
            </div>
          )}

          <div className="flex items-center gap-2">
            <Label className="text-xs whitespace-nowrap">Tax %</Label>
            <Input type="number" min="0" max="100" step="0.5" value={taxPct} onChange={e => setTaxPct(e.target.value)} className="h-7 w-20 text-xs" />
            <span className="text-xs text-muted-foreground">
              = ${(result.subtotal * (parseFloat(taxPct) / 100 || 0)).toFixed(2)}
            </span>
          </div>

          <Button onClick={applyToQuote} className="w-full gap-2" variant="default">
            Use These Prices →
          </Button>
        </div>
      )}
    </div>
  )
}
