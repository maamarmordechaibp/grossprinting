'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { Truck, Plus, Loader2, Save, X, Package } from 'lucide-react'
import { format } from 'date-fns'

type PaperStock = { id: string; name: string; width_in: number; height_in: number; stock_qty: number }
type Receipt = {
  id: string
  paper_stock_id: string
  vendor: string | null
  qty_received: number
  unit_cost: number | null
  invoice_ref: string | null
  notes: string | null
  received_at: string
  paper_stocks: { name: string } | null
}

export default function PaperReceivingPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any
  const [stocks, setStocks] = useState<PaperStock[]>([])
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    paper_stock_id: '',
    vendor: '',
    qty_received: '',
    unit_cost: '',
    invoice_ref: '',
    notes: '',
  })

  const load = useCallback(async () => {
    const [s, r] = await Promise.all([
      supabase.from('paper_stocks').select('id, name, width_in, height_in, stock_qty').order('name'),
      supabase.from('paper_receipts').select('*, paper_stocks(name)').order('received_at', { ascending: false }).limit(100),
    ])
    setStocks((s.data ?? []) as PaperStock[])
    setReceipts((r.data ?? []) as Receipt[])
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  async function save() {
    if (!form.paper_stock_id || !form.qty_received) {
      toast.error('Stock and quantity required')
      return
    }
    setSaving(true)
    const { error } = await supabase.from('paper_receipts').insert({
      paper_stock_id: form.paper_stock_id,
      vendor: form.vendor || null,
      qty_received: parseInt(form.qty_received, 10),
      unit_cost: form.unit_cost ? parseFloat(form.unit_cost) : null,
      invoice_ref: form.invoice_ref || null,
      notes: form.notes || null,
    })
    setSaving(false)
    if (error) {
      toast.error(error.message)
    } else {
      toast.success('Receipt logged · stock updated')
      setForm({ paper_stock_id: '', vendor: '', qty_received: '', unit_cost: '', invoice_ref: '', notes: '' })
      setAdding(false)
      load()
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  const totalReceived = receipts.reduce((s, r) => s + r.qty_received, 0)
  const totalSpent = receipts.reduce((s, r) => s + (Number(r.unit_cost ?? 0) * r.qty_received), 0)

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Truck className="h-5 w-5" />
          <h1 className="text-2xl font-bold">Paper Receiving</h1>
        </div>
        {!adding && (
          <Button onClick={() => setAdding(true)} size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" /> Log Receipt
          </Button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">Receipts (last 100)</p>
          <p className="text-2xl font-bold">{receipts.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">Sheets received</p>
          <p className="text-2xl font-bold">{totalReceived.toLocaleString()}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">Total spend</p>
          <p className="text-2xl font-bold">${totalSpent.toFixed(2)}</p>
        </CardContent></Card>
      </div>

      {adding && (
        <Card className="border-indigo-200">
          <CardHeader className="pb-3"><CardTitle className="text-base">New Receipt</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Paper stock *</Label>
                <Select value={form.paper_stock_id} onValueChange={(v) => setForm({ ...form, paper_stock_id: v ?? '' })}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select stock..." /></SelectTrigger>
                  <SelectContent>
                    {stocks.map(s => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} ({s.width_in}×{s.height_in}) — {s.stock_qty} on hand
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Vendor</Label>
                <Input value={form.vendor} onChange={e => setForm({ ...form, vendor: e.target.value })} placeholder="Veritiv, Lindenmeyr..." className="h-9 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Quantity (sheets) *</Label>
                <Input type="number" min="1" value={form.qty_received} onChange={e => setForm({ ...form, qty_received: e.target.value })} className="h-9 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Unit cost ($)</Label>
                <Input type="number" step="0.0001" min="0" value={form.unit_cost} onChange={e => setForm({ ...form, unit_cost: e.target.value })} className="h-9 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Invoice ref</Label>
                <Input value={form.invoice_ref} onChange={e => setForm({ ...form, invoice_ref: e.target.value })} placeholder="INV-12345" className="h-9 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Notes</Label>
                <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="h-9 text-sm" />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setAdding(false)}><X className="h-4 w-4 mr-1" />Cancel</Button>
              <Button size="sm" onClick={save} disabled={saving} className="gap-1.5">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Log Receipt
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">History</CardTitle></CardHeader>
        <CardContent>
          {receipts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center flex flex-col items-center gap-2">
              <Package className="h-8 w-8 opacity-40" />
              No receipts logged yet.
            </p>
          ) : (
            <div className="space-y-2">
              {receipts.map(r => (
                <div key={r.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{r.paper_stocks?.name ?? '—'}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(r.received_at), 'MMM d, yyyy')}
                      {r.vendor && ` · ${r.vendor}`}
                      {r.invoice_ref && ` · #${r.invoice_ref}`}
                    </p>
                    {r.notes && <p className="text-xs text-muted-foreground mt-0.5">{r.notes}</p>}
                  </div>
                  <Badge variant="outline" className="text-emerald-700 border-emerald-200">+{r.qty_received.toLocaleString()}</Badge>
                  {r.unit_cost && (
                    <span className="text-sm font-semibold w-20 text-right">${(r.unit_cost * r.qty_received).toFixed(2)}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
