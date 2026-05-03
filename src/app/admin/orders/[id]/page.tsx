'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { api, setToken } from '@/lib/api'
import { useRealtimeOrders } from '@/lib/realtime/useOrdersChannel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { FileText, Image as ImageIcon, Download, Loader2, Save, Send, User, Clock } from 'lucide-react'
import { QuoteCalculator } from '@/components/quote-calculator'

const STATUS_COLOR: Record<string, string> = {
  quote:     'bg-amber-100 text-amber-800',
  approved:  'bg-blue-100 text-blue-800',
  printing:  'bg-violet-100 text-violet-800',
  finishing: 'bg-indigo-100 text-indigo-800',
  completed: 'bg-emerald-100 text-emerald-800',
  delivered: 'bg-gray-100 text-gray-700',
  rejected:  'bg-red-100 text-red-800',
  cancelled: 'bg-red-50 text-red-600',
}

const ALL_STATUSES = ['quote','approved','printing','finishing','completed','delivered','rejected','cancelled']
const STAGES = ['pending','prepress','printing','cutting','finishing','qc','packaging']
const PRIORITY_COLOR: Record<string, string> = {
  low: 'bg-gray-100 text-gray-600', normal: 'bg-blue-50 text-blue-700',
  high: 'bg-orange-100 text-orange-700', urgent: 'bg-red-100 text-red-700',
}

type Order = Record<string, unknown>

export default function AdminOrderDetailPage() {
  const { id } = useParams<{ id: string }>()

  const [order, setOrder] = useState<Order | null>(null)
  const [files, setFiles] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newStatus, setNewStatus] = useState('')
  const [note, setNote] = useState('')
  const [stage, setStage] = useState('')
  const [qSubtotal, setQSubtotal] = useState('')
  const [qTax, setQTax] = useState('0')
  const [qValidDays, setQValidDays] = useState('14')
  const [qNotes, setQNotes] = useState('')
  const [showQuoteForm, setShowQuoteForm] = useState(false)
  const [activeEstimateTab, setActiveEstimateTab] = useState<'calculator'|'manual'>('calculator')

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
    setStage((o.production_stage as string) ?? 'pending')
    setFiles((filesData as Record<string, unknown>[]) ?? [])
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])
  useRealtimeOrders({
    onOrder: (e) => { if ((e.new as Record<string,unknown>)?.id === id) load() },
    onStatusHistory: (e) => { if ((e.new as Record<string,unknown>)?.order_id === id) load() },
    onFile: (e) => { if ((e.new as Record<string,unknown>)?.order_id === id) load() },
  })

  async function updateOrder() {
    setSaving(true)
    try {
      await api.orders.update(id, { status: newStatus, production_stage: stage || undefined })
      toast.success('Order updated')
      setNote('')
      load()
    } catch (e) { toast.error((e as Error).message) }
    finally { setSaving(false) }
  }

  async function submitQuote() {
    const subtotal = parseFloat(qSubtotal)
    if (isNaN(subtotal) || subtotal <= 0) { toast.error('Enter a valid subtotal'); return }
    const tax = parseFloat(qTax) || 0
    const total = subtotal + tax
    setSaving(true)
    try {
      await api.quotes.create({ order_id: id, subtotal, tax, total, valid_days: parseInt(qValidDays) || 14, notes: qNotes || undefined })
      toast.success('Quote created')
      setShowQuoteForm(false)
      load()
    } catch (e) { toast.error((e as Error).message) }
    finally { setSaving(false) }
  }

  async function createInvoice() {
    setSaving(true)
    try {
      await api.invoices.create({
        order_id: id, customer_id: order?.customer_id as string,
        subtotal: Number(order?.total_amount ?? 0), tax: 0,
        total: Number(order?.total_amount ?? 0), due_days: 14,
      })
      toast.success('Invoice created')
      load()
    } catch (e) { toast.error((e as Error).message) }
    finally { setSaving(false) }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  )
  if (!order) return <div className="text-center py-16 text-muted-foreground">Order not found.</div>

  const history = (order.order_status_history as Record<string, unknown>[]) ?? []
  const quotes  = (order.quotes as Record<string, unknown>[]) ?? []
  const items   = (order.order_items as Record<string, unknown>[]) ?? []
  const cust    = order.customers as Record<string, unknown> | null
  const qTotal  = (parseFloat(qSubtotal) || 0) + (parseFloat(qTax) || 0)

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold">{order.title as string}</h1>
            <Badge className={STATUS_COLOR[order.status as string] ?? ''}>{order.status as string}</Badge>
            {(order.priority as string) && (order.priority as string) !== 'normal' && (
              <Badge variant="outline" className={PRIORITY_COLOR[order.priority as string] ?? ''}>{order.priority as string}</Badge>
            )}
          </div>
          <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground flex-wrap">
            {cust && (
              <span className="flex items-center gap-1">
                <User className="h-3.5 w-3.5" />
                {(cust.company_name ?? cust.contact_name ?? cust.full_name) as string}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {formatDistanceToNow(new Date(order.created_at as string), { addSuffix: true })}
            </span>
            {Boolean(order.deadline) && <span>Due {new Date(order.deadline as string).toLocaleDateString()}</span>}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left: tabs */}
        <div className="lg:col-span-2 space-y-6">
          <Tabs defaultValue="items">
            <TabsList className="w-full">
              <TabsTrigger value="items" className="flex-1">Items ({items.length})</TabsTrigger>
              <TabsTrigger value="files" className="flex-1">Files ({files.length})</TabsTrigger>
              <TabsTrigger value="timeline" className="flex-1">Timeline</TabsTrigger>
            </TabsList>

            <TabsContent value="items" className="mt-4">
              <Card>
                <CardContent className="pt-4">
                  {items.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No items.</p>
                  ) : (
                    <div className="divide-y">
                      {items.map((item, i) => (
                        <div key={(item.id as string) ?? i} className="py-3 flex items-center justify-between">
                          <div>
                            <p className="font-medium text-sm">{item.name as string}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {item.size as string} &middot; {item.color_type as string}
                              {item.paper_type ? ` · ${item.paper_type as string}` : ''}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium">{item.quantity as number} pcs</p>
                            <p className="text-xs text-muted-foreground">${Number(item.line_total).toFixed(2)}</p>
                          </div>
                        </div>
                      ))}
                      <div className="pt-3 flex justify-between font-semibold">
                        <span>Total</span>
                        <span>${(items.reduce((s, it) => s + Number(it.line_total ?? 0), 0)).toFixed(2)}</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="files" className="mt-4">
              <Card>
                <CardContent className="pt-4">
                  {files.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No files uploaded.</p>
                  ) : (
                    <div className="space-y-2">
                      {files.map((f) => (
                        <div key={f.id as string} className="flex items-center gap-3 p-2.5 border rounded-lg hover:bg-muted/30">
                          {(f.mime_type as string) === 'application/pdf'
                            ? <FileText className="h-5 w-5 text-red-500 shrink-0" />
                            : <ImageIcon className="h-5 w-5 text-blue-500 shrink-0" />}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{f.name as string}</p>
                            <p className="text-xs text-muted-foreground">
                              {f.label ? `${String(f.label)} · ` : ''}{((f.size_bytes as number) / 1024).toFixed(0)} KB
                            </p>
                          </div>
                          {Boolean(f.is_final) && <Badge variant="outline" className="text-xs text-emerald-700 border-emerald-300">Final</Badge>}
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
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="timeline" className="mt-4">
              <Card>
                <CardContent className="pt-4">
                  {history.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No status changes yet.</p>
                  ) : (
                    <div className="relative pl-5">
                      <div className="absolute left-1.5 top-0 bottom-0 w-px bg-border" />
                      <div className="space-y-4">
                        {[...history].reverse().map((item) => (
                          <div key={item.id as string} className="relative">
                            <div className={`absolute -left-4 top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-background ${STATUS_COLOR[item.to_status as string] ?? 'bg-gray-400'}`} />
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-sm">
                                  {Boolean(item.from_status) && (
                                    <><Badge variant="outline" className="text-xs mr-1">{item.from_status as string}</Badge> &rarr; </>
                                  )}
                                  <Badge className={`${STATUS_COLOR[item.to_status as string] ?? ''} text-xs`}>{item.to_status as string}</Badge>
                                </p>
                                {Boolean(item.note) && <p className="text-xs text-muted-foreground mt-1">{String(item.note)}</p>}
                              </div>
                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                {formatDistanceToNow(new Date(item.changed_at as string), { addSuffix: true })}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Estimate / Quote section */}
          <Card>
            <CardHeader className="pb-3 flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold">
                {quotes.length > 0 ? 'Quote / Estimate' : 'Create Estimate'}
              </CardTitle>
              {quotes.length === 0 && !showQuoteForm && (
                <Button size="sm" onClick={() => setShowQuoteForm(true)} className="gap-1.5 h-7 text-xs">
                  <Send className="h-3.5 w-3.5" /> New Estimate
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {quotes.length > 0 ? (
                <div className="space-y-3">
                  {quotes.map((q) => (
                    <div key={q.id as string} className="rounded-lg border p-4">
                      <div className="flex items-center justify-between mb-3">
                        <Badge variant="outline">{q.status as string}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(q.created_at as string), { addSuffix: true })}
                        </span>
                      </div>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>${Number(q.subtotal).toFixed(2)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>${Number(q.tax).toFixed(2)}</span></div>
                        <Separator className="my-1.5" />
                        <div className="flex justify-between font-semibold text-base"><span>Total</span><span>${Number(q.total).toFixed(2)}</span></div>
                      </div>
                      {Boolean(q.valid_until) && (
                        <p className="text-xs text-muted-foreground mt-2">Valid until {new Date(q.valid_until as string).toLocaleDateString()}</p>
                      )}
                      {Boolean(q.notes) && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-line border-t pt-2">{String(q.notes)}</p>}
                      {q.status === 'draft' && (
                        <Button size="sm" className="mt-3 w-full gap-1.5" onClick={createInvoice} disabled={saving}>
                          <Send className="h-3.5 w-3.5" /> Create Invoice
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              ) : showQuoteForm ? (
                <div>
                  <Tabs value={activeEstimateTab} onValueChange={v => setActiveEstimateTab(v as 'calculator'|'manual')}>
                    <TabsList className="w-full mb-4">
                      <TabsTrigger value="calculator" className="flex-1">Auto Calculator</TabsTrigger>
                      <TabsTrigger value="manual" className="flex-1">Manual Entry</TabsTrigger>
                    </TabsList>

                    <TabsContent value="calculator">
                      <QuoteCalculator
                        orderTotalAmount={Number(order.total_amount ?? 0)}
                        onApply={(subtotal, tax, _total, notes) => {
                          setQSubtotal(subtotal.toFixed(2))
                          setQTax(tax.toFixed(2))
                          setQNotes(notes)
                          setActiveEstimateTab('manual')
                        }}
                      />
                    </TabsContent>

                    <TabsContent value="manual">
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs">Subtotal ($) *</Label>
                            <Input type="number" min="0" step="0.01" placeholder="0.00" value={qSubtotal} onChange={e => setQSubtotal(e.target.value)} />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Tax ($)</Label>
                            <Input type="number" min="0" step="0.01" placeholder="0.00" value={qTax} onChange={e => setQTax(e.target.value)} />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs">Valid for (days)</Label>
                            <Input type="number" min="1" value={qValidDays} onChange={e => setQValidDays(e.target.value)} />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Total</Label>
                            <div className="h-9 px-3 rounded-md border bg-muted flex items-center text-sm font-semibold">
                              ${qTotal.toFixed(2)}
                            </div>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Notes to customer</Label>
                          <Textarea rows={3} placeholder="Breakdown or notes..." value={qNotes} onChange={e => setQNotes(e.target.value)} />
                        </div>
                        <div className="flex gap-2">
                          <Button onClick={submitQuote} disabled={saving || !qSubtotal} className="flex-1 gap-1.5">
                            <Send className="h-3.5 w-3.5" />{saving ? 'Creating...' : 'Create Quote'}
                          </Button>
                          <Button variant="outline" onClick={() => setShowQuoteForm(false)}>Cancel</Button>
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-3">
                  No estimate yet. Click &quot;New Estimate&quot; to create one.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Update Order</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <Select value={newStatus} onValueChange={(v) => v && setNewStatus(v)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ALL_STATUSES.map(s => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Production Stage</Label>
                <Select value={stage} onValueChange={(v) => v && setStage(v)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select stage..." /></SelectTrigger>
                  <SelectContent>
                    {STAGES.map(s => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Status note</Label>
                <Textarea placeholder="Optional note..." rows={2} value={note} onChange={e => setNote(e.target.value)} className="text-sm" />
              </div>
              <Button onClick={updateOrder} disabled={saving} className="w-full gap-2 h-8 text-sm">
                <Save className="h-3.5 w-3.5" />{saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </CardContent>
          </Card>

          {cust && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Customer</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-1.5">
                <p className="font-medium">{(cust.company_name ?? cust.contact_name ?? cust.full_name) as string}</p>
                {cust.email && <p className="text-muted-foreground">{cust.email as string}</p>}
                {cust.phone && <p className="text-muted-foreground">{cust.phone as string}</p>}
              </CardContent>
            </Card>
          )}

          {Boolean(order.notes) && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Notes</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{order.notes as string}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
