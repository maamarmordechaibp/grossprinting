'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { api, setToken } from '@/lib/api'
import { useRealtimeOrders } from '@/lib/realtime/useOrdersChannel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { FileText, Image as ImageIcon, Download, CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { useParams } from 'next/navigation'

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

type Order = Record<string, unknown>
type Quote = Record<string, unknown>
type StatusHistory = Record<string, unknown>[]
type FileRow = Record<string, unknown>

export default function JobDetailPage() {
  const params = useParams()
  const id = params.id as string

  const [order, setOrder] = useState<Order | null>(null)
  const [quote, setQuote] = useState<Quote | null>(null)
  const [history, setHistory] = useState<StatusHistory>([])
  const [files, setFiles] = useState<FileRow[]>([])
  const [deciding, setDeciding] = useState(false)
  const [loading, setLoading] = useState(true)
  const [customerId, setCustomerId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      setToken(session.access_token)
      const { data: profileRaw } = await supabase.from('users').select('customer_id').eq('id', session.user.id).single()
      const profile = profileRaw as unknown as { customer_id: string | null } | null
      setCustomerId(profile?.customer_id ?? null)
    }

    const [orderData, filesData] = await Promise.all([
      api.orders.get(id),
      api.files.list(id),
    ])

    const o = orderData as Order
    setOrder(o)
    setHistory((o.order_status_history as StatusHistory) ?? [])
    const q = (o.quotes as Quote[] | null)?.[0] ?? null
    setQuote(q)
    setFiles((filesData as FileRow[]) ?? [])
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  // Realtime: refresh on order change or new status history
  useRealtimeOrders({
    customerId: customerId ?? undefined,
    onOrder: (e) => {
      if ((e.new as Record<string, unknown>)?.id === id || (e.old as Record<string, unknown>)?.id === id) {
        load()
      }
    },
    onStatusHistory: (e) => {
      if ((e.new as Record<string, unknown>)?.order_id === id) {
        load()
      }
    },
    onFile: (e) => {
      if ((e.new as Record<string, unknown>)?.order_id === id || (e.old as Record<string, unknown>)?.order_id === id) {
        load()
      }
    },
  })

  async function decide(status: 'approved' | 'rejected') {
    if (!quote) return
    setDeciding(true)
    try {
      await api.quotes.decide(quote.id as string, status)
      toast.success(status === 'approved' ? 'Quote approved! We\'ll start production soon.' : 'Quote rejected.')
      load()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setDeciding(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!order) {
    return <div className="text-center py-16 text-muted-foreground">Job not found.</div>
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{order.title as string}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Created {formatDistanceToNow(new Date(order.created_at as string), { addSuffix: true })}
          </p>
        </div>
        <Badge className={STATUS_COLOR[order.status as string] ?? ''}>{order.status as string}</Badge>
      </div>

      {/* Quote card */}
      {quote && (
        <Card className={quote.status === 'sent' ? 'border-yellow-300 bg-yellow-50/50' : ''}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              Quote
              <Badge variant="outline">{quote.status as string}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center mb-4">
              <div>
                <p className="text-xs text-muted-foreground">Subtotal</p>
                <p className="font-semibold">${Number(quote.subtotal).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Tax</p>
                <p className="font-semibold">${Number(quote.tax).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-xl font-bold text-primary">${Number(quote.total).toFixed(2)}</p>
              </div>
            </div>
            {Boolean(quote.valid_until) && (
              <p className="text-xs text-muted-foreground text-center mb-4">
                Valid until {new Date(quote.valid_until as string).toLocaleDateString()}
              </p>
            )}
            {quote.status === 'sent' && (
              <div className="flex gap-3 justify-center">
                <Button
                  onClick={() => decide('approved')}
                  disabled={deciding}
                  className="gap-2 bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle className="h-4 w-4" />
                  Approve Quote
                </Button>
                <Button
                  onClick={() => decide('rejected')}
                  disabled={deciding}
                  variant="outline"
                  className="gap-2 border-red-300 text-red-600 hover:bg-red-50"
                >
                  <XCircle className="h-4 w-4" />
                  Reject
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Status timeline */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Status Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {(history as StatusHistory).length === 0 ? (
              <p className="text-sm text-muted-foreground">Job submitted — awaiting review.</p>
            ) : (
              [...(history as StatusHistory)].reverse().map((item, i) => (
                <div key={item.id as string} className="flex items-start gap-3">
                  <div className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${i === 0 ? 'bg-primary' : 'bg-muted-foreground/40'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">
                      {Boolean(item.from_status) && (
                        <><Badge variant="outline" className="text-xs mr-1">{item.from_status as string}</Badge> → </>
                      )}
                      <Badge className={`${STATUS_COLOR[item.to_status as string] ?? ''} text-xs`}>{item.to_status as string}</Badge>
                    </p>
                    {Boolean(item.note) && <p className="text-xs text-muted-foreground mt-0.5">{item.note as string}</p>}
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDistanceToNow(new Date(item.changed_at as string), { addSuffix: true })}
                  </span>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Files */}
      {files.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Files ({files.length})</CardTitle>
          </CardHeader>
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

      {/* Items */}
      {Array.isArray(order.order_items) && (order.order_items as unknown[]).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Order Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(order.order_items as Record<string, unknown>[]).map((item, i) => (
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
    </div>
  )
}
