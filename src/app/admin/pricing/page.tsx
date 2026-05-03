'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import {
  Plus, Pencil, Trash2, Save, X, Loader2, AlertTriangle,
  Package, Layers, Scissors, ChevronDown, ChevronUp,
} from 'lucide-react'
import type { PaperStock, PricingTier, ProductPreset, FinishingOption } from '@/lib/pricing'

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | string) { return Number(n).toFixed(4) }

function PriceInput({ label, value, onChange, step = '0.0001', min = '0' }: {
  label: string; value: string; onChange: (v: string) => void; step?: string; min?: string
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
        <Input type="number" min={min} step={step} value={value} onChange={e => onChange(e.target.value)} className="pl-6 h-8 text-sm" />
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAPER STOCKS TAB
// ═══════════════════════════════════════════════════════════════════════════════

type StockForm = {
  name: string; width_in: string; height_in: string
  bw_price: string; color_price: string; duplex_surcharge: string
  stock_qty: string; low_stock_threshold: string
}

const BLANK_STOCK: StockForm = {
  name: '', width_in: '', height_in: '', bw_price: '0.0400',
  color_price: '0.1200', duplex_surcharge: '0.0200',
  stock_qty: '0', low_stock_threshold: '100',
}

function PaperStocksTab() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any
  const [stocks, setStocks]     = useState<PaperStock[]>([])
  const [tiers, setTiers]       = useState<PricingTier[]>([])
  const [loading, setLoading]   = useState(true)
  const [adding, setAdding]     = useState(false)
  const [editId, setEditId]     = useState<string | null>(null)
  const [form, setForm]         = useState<StockForm>(BLANK_STOCK)
  const [saving, setSaving]     = useState(false)
  const [openTiers, setOpenTiers] = useState<string | null>(null)
  // tier add form
  const [tierForm, setTierForm] = useState({ min_qty: '', max_qty: '', discount_percent: '' })
  const [tierSaving, setTierSaving] = useState(false)

  const load = useCallback(async () => {
    const [s, t] = await Promise.all([
      supabase.from('paper_stocks').select('*').order('name'),
      supabase.from('pricing_tiers').select('*').order('min_qty'),
    ])
    setStocks((s.data ?? []) as PaperStock[])
    setTiers((t.data ?? []) as PricingTier[])
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  function startAdd() { setForm(BLANK_STOCK); setAdding(true); setEditId(null) }
  function startEdit(s: PaperStock) {
    setForm({
      name: s.name, width_in: String(s.width_in), height_in: String(s.height_in),
      bw_price: fmt(s.bw_price), color_price: fmt(s.color_price),
      duplex_surcharge: fmt(s.duplex_surcharge),
      stock_qty: String(s.stock_qty), low_stock_threshold: String(s.low_stock_threshold),
    })
    setEditId(s.id); setAdding(false)
  }
  function cancelForm() { setAdding(false); setEditId(null) }

  async function saveStock() {
    if (!form.name || !form.width_in || !form.height_in) { toast.error('Name and dimensions required'); return }
    setSaving(true)
    const payload = {
      name: form.name,
      width_in: parseFloat(form.width_in),
      height_in: parseFloat(form.height_in),
      bw_price: parseFloat(form.bw_price) || 0,
      color_price: parseFloat(form.color_price) || 0,
      duplex_surcharge: parseFloat(form.duplex_surcharge) || 0,
      stock_qty: parseInt(form.stock_qty) || 0,
      low_stock_threshold: parseInt(form.low_stock_threshold) || 100,
    }
    const { error } = editId
      ? await supabase.from('paper_stocks').update(payload).eq('id', editId)
      : await supabase.from('paper_stocks').insert(payload)
    if (error) { toast.error(error.message) } else { toast.success('Saved'); cancelForm(); load() }
    setSaving(false)
  }

  async function toggleActive(s: PaperStock) {
    await supabase.from('paper_stocks').update({ is_active: !s.is_active }).eq('id', s.id)
    load()
  }

  async function updateQty(id: string, qty: string) {
    const n = parseInt(qty)
    if (isNaN(n)) return
    await supabase.from('paper_stocks').update({ stock_qty: n }).eq('id', id)
    load()
  }

  async function addTier(stockId: string) {
    const min = parseInt(tierForm.min_qty)
    const max = tierForm.max_qty ? parseInt(tierForm.max_qty) : null
    const disc = parseFloat(tierForm.discount_percent)
    if (isNaN(min) || isNaN(disc)) { toast.error('Fill in min qty and discount'); return }
    setTierSaving(true)
    const { error } = await supabase.from('pricing_tiers').insert({
      paper_stock_id: stockId, min_qty: min, max_qty: max, discount_percent: disc,
    })
    if (error) toast.error(error.message); else { toast.success('Tier added'); setTierForm({ min_qty: '', max_qty: '', discount_percent: '' }); load() }
    setTierSaving(false)
  }

  async function deleteTier(id: string) {
    await supabase.from('pricing_tiers').delete().eq('id', id)
    load()
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{stocks.length} paper stocks configured</p>
        {!adding && !editId && (
          <Button size="sm" onClick={startAdd} className="gap-1.5"><Plus className="h-3.5 w-3.5" />Add Paper Stock</Button>
        )}
      </div>

      {/* Add / Edit form */}
      {(adding || editId) && (
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <CardTitle className="text-sm">{editId ? 'Edit Paper Stock' : 'New Paper Stock'}</CardTitle>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={cancelForm}><X className="h-3.5 w-3.5" /></Button>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div>
              <Label className="text-xs">Name *</Label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder='e.g. "Gloss Cover 80lb 11×17"' className="h-8 text-sm mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Width (in) *</Label><Input type="number" min="0" step="0.125" value={form.width_in} onChange={e => setForm(p => ({ ...p, width_in: e.target.value }))} className="h-8 text-sm mt-1" /></div>
              <div><Label className="text-xs">Height (in) *</Label><Input type="number" min="0" step="0.125" value={form.height_in} onChange={e => setForm(p => ({ ...p, height_in: e.target.value }))} className="h-8 text-sm mt-1" /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <PriceInput label="B&W / impression" value={form.bw_price} onChange={v => setForm(p => ({ ...p, bw_price: v }))} />
              <PriceInput label="Color / impression" value={form.color_price} onChange={v => setForm(p => ({ ...p, color_price: v }))} />
              <PriceInput label="Duplex surcharge / sheet" value={form.duplex_surcharge} onChange={v => setForm(p => ({ ...p, duplex_surcharge: v }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Sheets on hand</Label><Input type="number" min="0" value={form.stock_qty} onChange={e => setForm(p => ({ ...p, stock_qty: e.target.value }))} className="h-8 text-sm mt-1" /></div>
              <div><Label className="text-xs">Low-stock alert below</Label><Input type="number" min="0" value={form.low_stock_threshold} onChange={e => setForm(p => ({ ...p, low_stock_threshold: e.target.value }))} className="h-8 text-sm mt-1" /></div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={saveStock} disabled={saving} className="gap-1.5"><Save className="h-3.5 w-3.5" />{saving ? 'Saving…' : 'Save'}</Button>
              <Button size="sm" variant="outline" onClick={cancelForm}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stock list */}
      <div className="space-y-3">
        {stocks.map(s => {
          const stockTiers = tiers.filter(t => t.paper_stock_id === s.id)
          const isLow = s.stock_qty < s.low_stock_threshold
          return (
            <Card key={s.id} className={isLow ? 'border-amber-300 bg-amber-50/50' : ''}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{s.name}</span>
                      <span className="text-xs text-muted-foreground">{s.width_in}" × {s.height_in}"</span>
                      {!s.is_active && <Badge variant="outline" className="text-xs text-muted-foreground">Inactive</Badge>}
                      {isLow && (
                        <Badge variant="outline" className="text-xs text-amber-700 border-amber-400 bg-amber-50 gap-1">
                          <AlertTriangle className="h-3 w-3" />Low stock: {s.stock_qty} sheets
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-4 mt-2 text-xs text-muted-foreground">
                      <span>B&W <strong className="text-foreground">${Number(s.bw_price).toFixed(4)}</strong>/impression</span>
                      <span>Color <strong className="text-foreground">${Number(s.color_price).toFixed(4)}</strong>/impression</span>
                      <span>Duplex +<strong className="text-foreground">${Number(s.duplex_surcharge).toFixed(4)}</strong>/sheet</span>
                      <span>Stock: <strong className="text-foreground">{s.stock_qty}</strong> sheets (alert at {s.low_stock_threshold})</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <div className="flex items-center gap-1 mr-2">
                      <Label className="text-xs text-muted-foreground">Qty:</Label>
                      <Input
                        type="number" min="0" defaultValue={s.stock_qty}
                        onBlur={e => updateQty(s.id, e.target.value)}
                        className="h-7 w-20 text-xs"
                      />
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(s)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleActive(s)}>
                      {s.is_active ? <X className="h-3.5 w-3.5 text-muted-foreground" /> : <Plus className="h-3.5 w-3.5 text-green-600" />}
                    </Button>
                  </div>
                </div>

                {/* Volume tiers */}
                <div className="mt-3">
                  <button
                    onClick={() => setOpenTiers(openTiers === s.id ? null : s.id)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {openTiers === s.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    Volume tiers ({stockTiers.length})
                  </button>

                  {openTiers === s.id && (
                    <div className="mt-2 pl-3 border-l-2 border-muted space-y-2">
                      {stockTiers.length === 0 && (
                        <p className="text-xs text-muted-foreground">No tiers — flat pricing applies.</p>
                      )}
                      {stockTiers.map(t => (
                        <div key={t.id} className="flex items-center gap-3 text-xs">
                          <span className="font-medium">
                            {t.min_qty}{t.max_qty ? `–${t.max_qty}` : '+'} pcs
                          </span>
                          <span className="text-emerald-700 font-semibold">{t.discount_percent}% off</span>
                          <Button variant="ghost" size="icon" className="h-5 w-5 ml-auto" onClick={() => deleteTier(t.id)}>
                            <Trash2 className="h-3 w-3 text-red-500" />
                          </Button>
                        </div>
                      ))}
                      {/* Add tier */}
                      <div className="flex items-end gap-2 pt-1 flex-wrap">
                        <div className="space-y-1">
                          <Label className="text-xs">Min qty</Label>
                          <Input type="number" min="1" placeholder="e.g. 100" value={tierForm.min_qty} onChange={e => setTierForm(p => ({ ...p, min_qty: e.target.value }))} className="h-7 w-24 text-xs" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Max qty (blank=∞)</Label>
                          <Input type="number" min="1" placeholder="e.g. 499" value={tierForm.max_qty} onChange={e => setTierForm(p => ({ ...p, max_qty: e.target.value }))} className="h-7 w-24 text-xs" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Discount %</Label>
                          <Input type="number" min="0" max="100" step="0.5" placeholder="10" value={tierForm.discount_percent} onChange={e => setTierForm(p => ({ ...p, discount_percent: e.target.value }))} className="h-7 w-20 text-xs" />
                        </div>
                        <Button size="sm" className="h-7 gap-1 text-xs" onClick={() => addTier(s.id)} disabled={tierSaving}>
                          <Plus className="h-3 w-3" />Add
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRODUCT PRESETS TAB
// ═══════════════════════════════════════════════════════════════════════════════

type PresetForm = {
  name: string; finished_width_in: string; finished_height_in: string
  description: string; default_paper_stock_id: string
}

const BLANK_PRESET: PresetForm = {
  name: '', finished_width_in: '', finished_height_in: '', description: '', default_paper_stock_id: '',
}

function ProductPresetsTab() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any
  const [presets, setPresets]   = useState<ProductPreset[]>([])
  const [stocks, setStocks]     = useState<PaperStock[]>([])
  const [loading, setLoading]   = useState(true)
  const [adding, setAdding]     = useState(false)
  const [editId, setEditId]     = useState<string | null>(null)
  const [form, setForm]         = useState<PresetForm>(BLANK_PRESET)
  const [saving, setSaving]     = useState(false)

  const load = useCallback(async () => {
    const [p, s] = await Promise.all([
      supabase.from('product_presets').select('*').order('name'),
      supabase.from('paper_stocks').select('id,name').eq('is_active', true).order('name'),
    ])
    setPresets((p.data ?? []) as ProductPreset[])
    setStocks((s.data ?? []) as PaperStock[])
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  function startAdd() { setForm(BLANK_PRESET); setAdding(true); setEditId(null) }
  function startEdit(p: ProductPreset) {
    setForm({
      name: p.name, finished_width_in: String(p.finished_width_in),
      finished_height_in: String(p.finished_height_in),
      description: p.description ?? '', default_paper_stock_id: p.default_paper_stock_id ?? '',
    })
    setEditId(p.id); setAdding(false)
  }
  function cancelForm() { setAdding(false); setEditId(null) }

  async function save() {
    if (!form.name || !form.finished_width_in || !form.finished_height_in) {
      toast.error('Name and dimensions required'); return
    }
    setSaving(true)
    const payload = {
      name: form.name,
      finished_width_in: parseFloat(form.finished_width_in),
      finished_height_in: parseFloat(form.finished_height_in),
      description: form.description || null,
      default_paper_stock_id: form.default_paper_stock_id || null,
    }
    const { error } = editId
      ? await supabase.from('product_presets').update(payload).eq('id', editId)
      : await supabase.from('product_presets').insert(payload)
    if (error) toast.error(error.message); else { toast.success('Saved'); cancelForm(); load() }
    setSaving(false)
  }

  async function toggleActive(p: ProductPreset) {
    await supabase.from('product_presets').update({ is_active: !p.is_active }).eq('id', p.id)
    load()
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{presets.length} product presets</p>
        {!adding && !editId && (
          <Button size="sm" onClick={startAdd} className="gap-1.5"><Plus className="h-3.5 w-3.5" />Add Preset</Button>
        )}
      </div>

      {(adding || editId) && (
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <CardTitle className="text-sm">{editId ? 'Edit Preset' : 'New Product Preset'}</CardTitle>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={cancelForm}><X className="h-3.5 w-3.5" /></Button>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div>
              <Label className="text-xs">Name *</Label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder='e.g. "Business Card"' className="h-8 text-sm mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Finished width (in) *</Label><Input type="number" min="0" step="0.125" value={form.finished_width_in} onChange={e => setForm(p => ({ ...p, finished_width_in: e.target.value }))} className="h-8 text-sm mt-1" /></div>
              <div><Label className="text-xs">Finished height (in) *</Label><Input type="number" min="0" step="0.125" value={form.finished_height_in} onChange={e => setForm(p => ({ ...p, finished_height_in: e.target.value }))} className="h-8 text-sm mt-1" /></div>
            </div>
            <div>
              <Label className="text-xs">Default paper stock</Label>
              <select
                value={form.default_paper_stock_id}
                onChange={e => setForm(p => ({ ...p, default_paper_stock_id: e.target.value }))}
                className="mt-1 w-full h-8 text-sm border rounded-md px-2 bg-background"
              >
                <option value="">— none —</option>
                {stocks.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Optional description" className="h-8 text-sm mt-1" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={save} disabled={saving} className="gap-1.5"><Save className="h-3.5 w-3.5" />{saving ? 'Saving…' : 'Save'}</Button>
              <Button size="sm" variant="outline" onClick={cancelForm}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="divide-y border rounded-xl overflow-hidden">
        {presets.map(p => {
          const defaultStock = stocks.find(s => s.id === p.default_paper_stock_id)
          return (
            <div key={p.id} className="flex items-center justify-between px-4 py-3 bg-card hover:bg-muted/30">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{p.name}</span>
                  {!p.is_active && <Badge variant="outline" className="text-xs text-muted-foreground">Inactive</Badge>}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {p.finished_width_in}" × {p.finished_height_in}"
                  {defaultStock ? ` · Default: ${defaultStock.name}` : ''}
                  {p.description ? ` · ${p.description}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleActive(p)}>
                  {p.is_active ? <X className="h-3.5 w-3.5 text-muted-foreground" /> : <Plus className="h-3.5 w-3.5 text-green-600" />}
                </Button>
              </div>
            </div>
          )
        })}
        {presets.length === 0 && (
          <div className="text-center py-8 text-sm text-muted-foreground">No presets yet.</div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// FINISHING OPTIONS TAB
// ═══════════════════════════════════════════════════════════════════════════════

type FinishForm = {
  name: string; price_per_sheet: string; price_per_piece: string
  flat_price: string; description: string
}
const BLANK_FINISH: FinishForm = {
  name: '', price_per_sheet: '0', price_per_piece: '0', flat_price: '0', description: '',
}

function FinishingOptionsTab() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any
  const [options, setOptions]   = useState<FinishingOption[]>([])
  const [loading, setLoading]   = useState(true)
  const [adding, setAdding]     = useState(false)
  const [editId, setEditId]     = useState<string | null>(null)
  const [form, setForm]         = useState<FinishForm>(BLANK_FINISH)
  const [saving, setSaving]     = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.from('finishing_options').select('*').order('name')
    setOptions((data ?? []) as FinishingOption[])
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  function startAdd() { setForm(BLANK_FINISH); setAdding(true); setEditId(null) }
  function startEdit(o: FinishingOption) {
    setForm({
      name: o.name, price_per_sheet: fmt(o.price_per_sheet),
      price_per_piece: fmt(o.price_per_piece), flat_price: fmt(o.flat_price),
      description: o.description ?? '',
    })
    setEditId(o.id); setAdding(false)
  }
  function cancelForm() { setAdding(false); setEditId(null) }

  async function save() {
    if (!form.name) { toast.error('Name required'); return }
    setSaving(true)
    const payload = {
      name: form.name,
      price_per_sheet: parseFloat(form.price_per_sheet) || 0,
      price_per_piece: parseFloat(form.price_per_piece) || 0,
      flat_price: parseFloat(form.flat_price) || 0,
      description: form.description || null,
    }
    const { error } = editId
      ? await supabase.from('finishing_options').update(payload).eq('id', editId)
      : await supabase.from('finishing_options').insert(payload)
    if (error) toast.error(error.message); else { toast.success('Saved'); cancelForm(); load() }
    setSaving(false)
  }

  async function toggleActive(o: FinishingOption) {
    await supabase.from('finishing_options').update({ is_active: !o.is_active }).eq('id', o.id)
    load()
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{options.length} finishing options</p>
        {!adding && !editId && (
          <Button size="sm" onClick={startAdd} className="gap-1.5"><Plus className="h-3.5 w-3.5" />Add Finishing</Button>
        )}
      </div>

      {(adding || editId) && (
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <CardTitle className="text-sm">{editId ? 'Edit Finishing' : 'New Finishing Option'}</CardTitle>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={cancelForm}><X className="h-3.5 w-3.5" /></Button>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div>
              <Label className="text-xs">Name *</Label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder='e.g. "Lamination (gloss)"' className="h-8 text-sm mt-1" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <PriceInput label="Setup / flat fee" value={form.flat_price} onChange={v => setForm(p => ({ ...p, flat_price: v }))} />
              <PriceInput label="Per press sheet" value={form.price_per_sheet} onChange={v => setForm(p => ({ ...p, price_per_sheet: v }))} />
              <PriceInput label="Per finished piece" value={form.price_per_piece} onChange={v => setForm(p => ({ ...p, price_per_piece: v }))} />
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Optional" className="h-8 text-sm mt-1" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={save} disabled={saving} className="gap-1.5"><Save className="h-3.5 w-3.5" />{saving ? 'Saving…' : 'Save'}</Button>
              <Button size="sm" variant="outline" onClick={cancelForm}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="divide-y border rounded-xl overflow-hidden">
        {options.map(o => (
          <div key={o.id} className="flex items-center justify-between px-4 py-3 bg-card hover:bg-muted/30">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{o.name}</span>
                {!o.is_active && <Badge variant="outline" className="text-xs text-muted-foreground">Inactive</Badge>}
              </div>
              <div className="flex gap-4 text-xs text-muted-foreground mt-0.5">
                {Number(o.flat_price) > 0 && <span>Setup <strong className="text-foreground">${Number(o.flat_price).toFixed(2)}</strong></span>}
                {Number(o.price_per_sheet) > 0 && <span>Per sheet <strong className="text-foreground">${Number(o.price_per_sheet).toFixed(4)}</strong></span>}
                {Number(o.price_per_piece) > 0 && <span>Per piece <strong className="text-foreground">${Number(o.price_per_piece).toFixed(4)}</strong></span>}
                {o.description && <span className="text-muted-foreground/70">{o.description}</span>}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(o)}><Pencil className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleActive(o)}>
                {o.is_active ? <X className="h-3.5 w-3.5 text-muted-foreground" /> : <Plus className="h-3.5 w-3.5 text-green-600" />}
              </Button>
            </div>
          </div>
        ))}
        {options.length === 0 && (
          <div className="text-center py-8 text-sm text-muted-foreground">No finishing options yet.</div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export default function AdminPricingPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Pricing Configuration</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Set paper costs, volume tiers, product templates, and finishing charges.
          These are used to auto-calculate estimates on orders.
        </p>
      </div>

      <Tabs defaultValue="paper">
        <TabsList className="w-full">
          <TabsTrigger value="paper" className="flex-1 gap-2"><Package className="h-4 w-4" />Paper Stocks</TabsTrigger>
          <TabsTrigger value="presets" className="flex-1 gap-2"><Layers className="h-4 w-4" />Product Presets</TabsTrigger>
          <TabsTrigger value="finishing" className="flex-1 gap-2"><Scissors className="h-4 w-4" />Finishings</TabsTrigger>
        </TabsList>
        <Separator className="mt-0" />
        <TabsContent value="paper"    className="mt-4"><PaperStocksTab /></TabsContent>
        <TabsContent value="presets"  className="mt-4"><ProductPresetsTab /></TabsContent>
        <TabsContent value="finishing" className="mt-4"><FinishingOptionsTab /></TabsContent>
      </Tabs>
    </div>
  )
}
