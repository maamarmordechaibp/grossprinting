'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { api, setToken } from '@/lib/api'
import { useRealtimeOrders } from '@/lib/realtime/useOrdersChannel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { FileText, Image as ImageIcon, Download, Loader2, Save } from 'lucide-react'

const STATUS_COLOR: Record<string, string> = {
  quote: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-blue-100 text-blue-800',
  printing: 'bg-purple-100 text-purple-800',
  finishing: 'bg-indigo-100 text-indigo-800',
  completed: 'bg-green-100 text-green-800',
  delivered: 'bg-gray-100 text-gray-800',
  rejected: 'bg-red-100 text-red-800',
  cancelled: 'bg-red-50 text-red-600',
}

const ALL_STATUSES = ['quote', 'approved', 'printing', 'finishing', 'completed', 'delivered', 'rejected', 'cancelled']
const STAGES = ['prepress', 'printing', 'cutting', 'finishing', 'qc', 'packaging']

type Order = Record<string, unknown>

export default function AdminOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [order, setOrder] = useState<Order | null>(null)
  const [files, setFiles] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newStatus, setNewStatus] = useState('')
  const [note, setNote] = useState('')
  const [stage, setStage] = useState('')

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (session) setToken(session.access_token)

    const [orderData, filesData] = await Promise.all([
      api.orders.get(id),
      api.files.list(id),
    ])

    const o = orderData as Order
    setOrder(o)
    setNewStatus(o.status as string)
    setStage((o.production_stage as string) ?? '')
    setFiles((filesData as Record<string, unknown>[]) ?? [])
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  useRealtimeOrders({
    onOrder: (e) => {
      if ((e.new as Record<string, unknown>)?.id === id) load()
    },
    onStatusHistory: (e) => {
      if ((e.new as Record<string, unknown>)?.order_id === id) load()
    },
    onFile: (e) => {
      if ((e.new as Record<string, unknown>)?.order_id === id) load()
    },
  })

  async function updateOrder() {
    setSaving(true)
    try {
      await api.orders.update(id, {
        status: newStatus,
        production_stage: stage || undefined,
        notes: note || undefined,
      })
      toast.success('Order updated')
      setNote('')
      load()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function createQuote() {
    setSaving(true)
    try {
      await api.quotes.create({
        order_id: id,
        subtotal: 0,
        tax: 0,
        total: 0,
        valid_days: 14,
      })
      toast.success('Quote created — update the amounts and send to customer')
      load()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function createInvoice() {
    setSaving(true)
    try {
      await api.invoices.create({
        order_id: id,
        customer_id: order?.customer_id as string,
        subtotal: Number(order?.total_amount ?? 0),
        tax: 0,
        total: Number(order?.total_amount ?? 0),
        due_days: 14,
      })
      toast.success('Invoice created')
      load()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!order) return <div className="text-center py-16 text-muted-foreground">Order not found.</div>

  const history = (order.order_status_history as Record<string, unknown>[]) ?? []
  const quotes = (order.quotes as Record<string, unknown>[]) ?? []
  const items = (order.order_items as Record<string, unknown>[]) ?? []
  const cust = order.customers as Record<string, unknown> | null

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{order.title as string}</h1>
          <p className="text-muted-foreground text-sm">
            {(cust?.company_name ?? cust?.full_name) as string ?? 'Unknown customer'}
            {' · '}Created {formatDistanceToNow(new Date(order.created_at as string), { addSuffix: true })}
          </p>
        </div>
        <Badge className={STATUS_COLOR[order.status as string] ?? ''}>{order.status as string}</Badge>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Status control */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Update Status</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={newStatus} onValueChange={(v) => v && setNewStatus(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALL_STATUSES.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Production Stage</Label>
              <Select value={stage} onValueChange={(v) => v && setStage(v)}>
                <SelectTrigger><SelectValue placeholder="Select stage…" /></SelectTrigger>
                <SelectContent>
                  {STAGES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Note (optional)</Label>
              <Textarea
                placeholder="Leave a note on this status change…"
                rows={2}
                value={note}
                onChange={e => setNote(e.target.value)}
              />
            </div>
            <Button onClick={updateOrder} disabled={saving} className="w-full gap-2">
              <Save className="h-4 w-4" />
              {saving ? 'Saving…' : 'Save Changes'}
            </Button>
          </CardContent>
        </Card>

        {/* Actions */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Actions</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {quotes.length === 0 && (
              <Button onClick={createQuote} disabled={saving} variant="outline" className="w-full">
                Create Quote
              </Button>
            )}
            {quotes.length > 0 && (
              <Button onClick={createInvoice} disabled={saving} variant="outline" className="w-full">
                Create Invoice
              </Button>
            )}
            <Button asChild variant="outline" className="w-full">
              <a href={`/admin/orders/${id}/print`} target="_blank">Print Work Order</a>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Quotes */}
      {quotes.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Quotes</CardTitle></CardHeader>
          <CardContent>
            {quotes.map((q) => (
              <div key={q.id as string} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-3">
                  <Badge variant="outline">{q.status as string}</Badge>
                  <span className="text-sm text-muted-foreground">
                    Created {formatDistanceToNow(new Date(q.created_at as string), { addSuffix: true })}
                  </span>
                </div>
                <span className="font-semibold">${Number(q.total).toFixed(2)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Items */}
      {items.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Order Items</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={item.id as string ?? i} className="flex items-center justify-between text-sm py-1.5">
                  <div>
                    <p className="font-medium">{item.name as string}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.size as string} · {item.color_type === 'bw' ? 'B&W' : 'Color'}
                      {item.paper_type ? ` · ${item.paper_type}` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p>{item.quantity as number} pcs</p>
                    <p className="text-xs text-muted-foreground">${Number(item.line_total).toFixed(2)}</p>
                  </div>
                </div>
              ))}
              <Separator />
              <div className="flex justify-between font-semibold">
                <span>Total</span>
                <span>${Number(order.total_amount).toFixed(2)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Files */}
      {files.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Files ({files.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {files.map((f) => (
                <div key={f.id as string} className="flex items-center gap-3 p-2 border rounded-lg">
                  {(f.mime_type as string) === 'application/pdf' ? (
                    <FileText className="h-5 w-5 text-red-500 shrink-0" />
                  ) : (
                    <ImageIcon className="h-5 w-5 text-blue-500 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{f.name as string}</p>
                    <p className="text-xs text-muted-foreground">
                      {f.label ? `${String(f.label)} · ` : ''}{((f.size_bytes as number) / 1024).toFixed(0)} KB
                      {f.uploaded_by_name ? ` · ${String(f.uploaded_by_name)}` : ''}
                    </p>
                  </div>
                  {Boolean(f.is_final) && <Badge variant="outline" className="text-xs text-green-700 border-green-300">Final</Badge>}
                  {Boolean(f.signed_url) && (
                    <Button asChild variant="ghost" size="icon" className="h-7 w-7">
                      <a href={f.signed_url as string} target="_blank" rel="noreferrer">
                        <Download className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Timeline */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Status Timeline</CardTitle></CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No status changes recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {[...history].reverse().map((item, i) => (
                <div key={item.id as string} className="flex items-start gap-3">
                  <div className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${i === 0 ? 'bg-primary' : 'bg-muted-foreground/40'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">
                      {Boolean(item.from_status) && (
                        <><Badge variant="outline" className="text-xs mr-1">{item.from_status as string}</Badge> → </>
                      )}
                      <Badge className={`${STATUS_COLOR[item.to_status as string] ?? ''} text-xs`}>{item.to_status as string}</Badge>
                    </p>
                    {Boolean(item.note) && <p className="text-xs text-muted-foreground mt-0.5">{String(item.note)}</p>}
                    {Boolean(item.changed_by_name) && <p className="text-xs text-muted-foreground">{String(item.changed_by_name)}</p>}
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDistanceToNow(new Date(item.changed_at as string), { addSuffix: true })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
