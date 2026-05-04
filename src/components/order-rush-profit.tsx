'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Zap, Save, TrendingUp, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

type Props = {
  orderId: string
  initialIsRush: boolean
  initialDeadline: string | null
  initialSurcharge: number | null
  initialMaterial: number | null
  initialLabor: number | null
  initialOverhead: number | null
  totalAmount: number
}

export function OrderRushProfit(props: Props) {
  const supabase = createClient() as unknown as {
    from: (t: string) => {
      select: (q: string) => { single: () => Promise<{ data: { rush_surcharge_pct: number } | null }>; eq: (k: string, v: string) => { single: () => Promise<{ data: ProfitRow | null }> } }
      update: (v: Record<string, unknown>) => { eq: (k: string, v: string) => Promise<{ error: { message: string } | null }> }
    }
  }
  type ProfitRow = { material_cost: number; labor_cost: number; overhead_cost: number; rush_surcharge: number; total_cost: number; profit: number; margin_pct: number }

  const [isRush, setIsRush] = useState(props.initialIsRush)
  const [deadline, setDeadline] = useState(props.initialDeadline ? props.initialDeadline.slice(0, 16) : '')
  const [surchargePct, setSurchargePct] = useState(50)
  const [material, setMaterial] = useState(String(props.initialMaterial ?? 0))
  const [labor, setLabor] = useState(String(props.initialLabor ?? 0))
  const [overhead, setOverhead] = useState(String(props.initialOverhead ?? 0))
  const [profit, setProfit] = useState<ProfitRow | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void (async () => {
      const { data: settings } = await supabase.from('app_settings').select('rush_surcharge_pct').single()
      if (settings) setSurchargePct(Number(settings.rush_surcharge_pct))
      const { data: p } = await supabase.from('order_profitability').select('*').eq('id', props.orderId).single()
      if (p) setProfit(p)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.orderId])

  async function save() {
    setSaving(true)
    const m = parseFloat(material) || 0
    const l = parseFloat(labor) || 0
    const o = parseFloat(overhead) || 0
    const surcharge = isRush ? Number((props.totalAmount * surchargePct / 100).toFixed(2)) : 0
    const { error } = await supabase.from('orders').update({
      is_rush: isRush,
      rush_deadline: isRush && deadline ? new Date(deadline).toISOString() : null,
      rush_surcharge: surcharge,
      material_cost: m,
      labor_cost: l,
      overhead_cost: o,
    }).eq('id', props.orderId)
    setSaving(false)
    if (error) {
      toast.error(error.message)
    } else {
      toast.success('Rush & cost updated')
      // refresh profit view
      const { data: p } = await supabase.from('order_profitability').select('*').eq('id', props.orderId).single()
      if (p) setProfit(p)
    }
  }

  const totalCost = (parseFloat(material) || 0) + (parseFloat(labor) || 0) + (parseFloat(overhead) || 0)
  const expectedProfit = props.totalAmount + (isRush ? props.totalAmount * surchargePct / 100 : 0) - totalCost
  const expectedMargin = props.totalAmount > 0 ? (expectedProfit / (props.totalAmount + (isRush ? props.totalAmount * surchargePct / 100 : 0))) * 100 : 0

  // Countdown
  let countdown: string | null = null
  if (isRush && deadline) {
    const ms = new Date(deadline).getTime() - Date.now()
    if (ms > 0) {
      const h = Math.floor(ms / 3_600_000)
      const m = Math.floor((ms % 3_600_000) / 60_000)
      countdown = `${h}h ${m}m left`
    } else {
      countdown = 'OVERDUE'
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
          <Zap className="h-4 w-4 text-amber-500" /> Rush & Profit
        </CardTitle>
        {isRush && <Badge className="bg-red-500 hover:bg-red-500 text-xs">RUSH</Badge>}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between p-2 rounded-md bg-amber-50 border border-amber-200">
          <Label htmlFor="rush-toggle" className="text-sm cursor-pointer">Rush job (+{surchargePct}%)</Label>
          <input
            id="rush-toggle"
            type="checkbox"
            checked={isRush}
            onChange={e => setIsRush(e.target.checked)}
            className="h-4 w-4 cursor-pointer accent-red-500"
          />
        </div>
        {isRush && (
          <div className="space-y-1.5">
            <Label className="text-xs">Deadline</Label>
            <Input type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)} className="h-8 text-sm" />
            {countdown && (
              <p className={`text-xs font-medium ${countdown === 'OVERDUE' ? 'text-red-600' : 'text-amber-700'}`}>{countdown}</p>
            )}
            <p className="text-xs text-muted-foreground">Surcharge: ${(props.totalAmount * surchargePct / 100).toFixed(2)}</p>
          </div>
        )}

        <div className="pt-2 border-t space-y-2">
          <p className="text-xs font-semibold flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5" /> Costs</p>
          <div className="grid grid-cols-3 gap-1.5">
            <div>
              <Label className="text-xs">Material</Label>
              <Input type="number" step="0.01" value={material} onChange={e => setMaterial(e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Labor</Label>
              <Input type="number" step="0.01" value={labor} onChange={e => setLabor(e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Overhead</Label>
              <Input type="number" step="0.01" value={overhead} onChange={e => setOverhead(e.target.value)} className="h-8 text-sm" />
            </div>
          </div>

          <div className="rounded-md bg-muted/50 p-2 text-xs space-y-1">
            <div className="flex justify-between"><span className="text-muted-foreground">Revenue</span><span>${(props.totalAmount + (isRush ? props.totalAmount * surchargePct / 100 : 0)).toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Total cost</span><span>${totalCost.toFixed(2)}</span></div>
            <div className={`flex justify-between font-semibold ${expectedProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
              <span>Profit</span>
              <span>${expectedProfit.toFixed(2)} ({expectedMargin.toFixed(1)}%)</span>
            </div>
            {profit && profit.total_cost > 0 && (
              <p className="text-[10px] text-muted-foreground pt-1 border-t">DB: ${Number(profit.profit).toFixed(2)} profit @ {Number(profit.margin_pct).toFixed(1)}%</p>
            )}
          </div>
        </div>

        <Button onClick={save} disabled={saving} size="sm" className="w-full gap-1.5 h-8">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save rush & costs
        </Button>
      </CardContent>
    </Card>
  )
}
