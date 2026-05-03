'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { api, setToken } from '@/lib/api'
import { useRealtimeOrders } from '@/lib/realtime/useOrdersChannel'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  closestCorners,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'
import Link from 'next/link'
import { GripVertical, Loader2, Clock, AlertTriangle } from 'lucide-react'

type Order = {
  id: string
  title: string
  priority: string
  status: string
  production_stage: string | null
  stage_entered_at: string | null
  deadline: string | null
  customers: { company_name: string | null; full_name: string } | null
}

const COLUMNS: { id: string; label: string; stage: string | null; color: string }[] = [
  { id: 'approved',  label: 'Approved',  stage: null,        color: 'border-blue-300' },
  { id: 'prepress',  label: 'Prepress',  stage: 'prepress',  color: 'border-sky-300' },
  { id: 'printing',  label: 'Printing',  stage: 'printing',  color: 'border-violet-300' },
  { id: 'cutting',   label: 'Cutting',   stage: 'cutting',   color: 'border-orange-300' },
  { id: 'finishing', label: 'Finishing', stage: 'finishing', color: 'border-indigo-300' },
  { id: 'qc',        label: 'QC',        stage: 'qc',        color: 'border-emerald-300' },
  { id: 'packaging', label: 'Packaging', stage: 'packaging', color: 'border-amber-300' },
]

const PRIORITY_DOT: Record<string, string> = {
  urgent: 'bg-red-500',
  high:   'bg-orange-400',
  normal: 'bg-blue-400',
  low:    'bg-gray-400',
}

// Returns elapsed time as a human string + a colour for the badge
function stageTime(enteredAt: string | null): { label: string; color: string } | null {
  if (!enteredAt) return null
  const ms   = Date.now() - new Date(enteredAt).getTime()
  const mins = Math.floor(ms / 60_000)
  const hrs  = Math.floor(mins / 60)
  const days = Math.floor(hrs / 24)

  let label: string
  let color: string

  if (days >= 2) {
    label = `${days}d`
    color = 'bg-red-100 text-red-700 border-red-200'
  } else if (hrs >= 8) {
    label = `${hrs}h`
    color = 'bg-orange-100 text-orange-700 border-orange-200'
  } else if (hrs >= 1) {
    label = `${hrs}h ${mins % 60}m`
    color = 'bg-yellow-100 text-yellow-700 border-yellow-200'
  } else {
    label = `${mins}m`
    color = 'bg-muted text-muted-foreground border-border'
  }

  return { label, color }
}

function KanbanCard({ order }: { order: Order }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: order.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }
  const cust  = order.customers
  const time  = stageTime(order.stage_entered_at)
  const isOverdue = order.deadline && new Date(order.deadline) < new Date() && !['completed','delivered'].includes(order.status)

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <Link href={`/admin/orders/${order.id}`}>
        <Card className="mb-2 hover:shadow-sm transition-shadow cursor-pointer group">
          <CardContent className="p-3">
            <div className="flex items-start gap-2">
              <button
                {...listeners}
                className="mt-0.5 text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing shrink-0"
                onClick={e => e.preventDefault()}
              >
                <GripVertical className="h-4 w-4" />
              </button>
              <div className="flex-1 min-w-0 space-y-1.5">
                <p className="text-sm font-semibold leading-tight truncate">{order.title}</p>
                <p className="text-xs text-muted-foreground truncate">{cust?.company_name ?? cust?.full_name ?? ''}</p>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {/* Time in stage */}
                  {time && (
                    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded border ${time.color}`}>
                      <Clock className="h-2.5 w-2.5" />
                      {time.label}
                    </span>
                  )}

                  {/* Overdue */}
                  {isOverdue && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700 border border-red-200">
                      <AlertTriangle className="h-2.5 w-2.5" />
                      Overdue
                    </span>
                  )}

                  {/* Deadline (not overdue) */}
                  {order.deadline && !isOverdue && (
                    <span className="text-[11px] text-muted-foreground">
                      Due {new Date(order.deadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </div>
              </div>
              <div className={`h-2 w-2 rounded-full mt-1 shrink-0 ${PRIORITY_DOT[order.priority] ?? 'bg-gray-400'}`} title={order.priority} />
            </div>
          </CardContent>
        </Card>
      </Link>
    </div>
  )
}

function Column({ id, label, orders, color }: { id: string; label: string; orders: Order[]; color: string }) {
  // Average time in stage (hours) for the column header indicator
  const avgHours = orders.length > 0
    ? orders.reduce((sum, o) => {
        if (!o.stage_entered_at) return sum
        return sum + (Date.now() - new Date(o.stage_entered_at).getTime()) / 3_600_000
      }, 0) / orders.filter(o => o.stage_entered_at).length
    : 0

  const hasSlowOrders = orders.some(o => {
    if (!o.stage_entered_at) return false
    return (Date.now() - new Date(o.stage_entered_at).getTime()) > 2 * 24 * 3_600_000 // >2 days
  })

  return (
    <div className="flex flex-col min-w-[210px] max-w-[230px] shrink-0">
      <div className={`flex items-center justify-between mb-2 px-1`}>
        <div className="flex items-center gap-2">
          <h3 className={`text-sm font-bold ${hasSlowOrders ? 'text-red-600' : ''}`}>{label}</h3>
          {hasSlowOrders && <AlertTriangle className="h-3.5 w-3.5 text-red-500" />}
        </div>
        <div className="flex items-center gap-1.5">
          {orders.length > 0 && avgHours > 0 && (
            <span className="text-[10px] text-muted-foreground" title="Avg time in stage">
              avg {avgHours < 1 ? `${Math.round(avgHours * 60)}m` : `${avgHours.toFixed(1)}h`}
            </span>
          )}
          <Badge variant="outline" className="text-xs">{orders.length}</Badge>
        </div>
      </div>
      <div className={`bg-muted/40 rounded-xl border-t-2 ${color} p-2 flex-1 min-h-[120px]`}>
        <SortableContext items={orders.map(o => o.id)} strategy={verticalListSortingStrategy}>
          {orders.map(o => <KanbanCard key={o.id} order={o} />)}
        </SortableContext>
        {orders.length === 0 && (
          <div className="text-xs text-muted-foreground/40 text-center py-6">Empty</div>
        )}
      </div>
    </div>
  )
}

export default function KanbanPage() {
  const [orders, setOrders]   = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [tick, setTick]       = useState(0)   // forces re-render every minute to keep times live

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (session) setToken(session.access_token)

    const { data } = await supabase
      .from('orders')
      .select('id, title, priority, status, production_stage, stage_entered_at, deadline, customers(company_name, full_name)')
      .in('status', ['approved', 'printing', 'finishing'])
      .order('created_at')

    setOrders((data as Order[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Refresh time badges every minute
  useEffect(() => {
    const t = setInterval(() => setTick(v => v + 1), 60_000)
    return () => clearInterval(t)
  }, [])

  useRealtimeOrders({ onOrder: () => load() })

  function getColumnOrders(colId: string) {
    const col = COLUMNS.find(c => c.id === colId)!
    if (col.id === 'approved') {
      return orders.filter(o => o.status === 'approved' && !o.production_stage)
    }
    return orders.filter(o => o.production_stage === col.stage)
  }

  function handleDragStart(e: DragStartEvent) { setActiveId(e.active.id as string) }

  async function handleDragEnd(e: DragEndEvent) {
    setActiveId(null)
    const { active, over } = e
    if (!over || active.id === over.id) return

    const overCol =
      COLUMNS.find(c => c.id === over.id) ??
      COLUMNS.find(c => getColumnOrders(c.id).some(o => o.id === over.id))
    if (!overCol) return

    const order = orders.find(o => o.id === active.id)
    if (!order) return

    const newStage  = overCol.stage
    const newStatus = overCol.id === 'approved' ? 'approved' : 'printing'

    setOrders(prev => prev.map(o =>
      o.id === order.id
        ? { ...o, production_stage: newStage, status: newStatus, stage_entered_at: new Date().toISOString() }
        : o
    ))

    try {
      await api.orders.update(order.id, { production_stage: newStage ?? undefined, status: newStatus })
    } catch (err) {
      toast.error((err as Error).message)
      load()
    }
  }

  // Bottleneck = stage with most orders
  const stageTotals = COLUMNS.map(c => ({ ...c, count: getColumnOrders(c.id).length }))
  const maxCount    = Math.max(...stageTotals.map(s => s.count), 0)
  const bottleneck  = maxCount >= 3 ? stageTotals.find(s => s.count === maxCount) : null

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const active = activeId ? orders.find(o => o.id === activeId) : null

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Production Kanban</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {orders.length} orders in production Â· Time badges show how long each order has been in its current stage
          </p>
        </div>
      </div>

      {/* Bottleneck callout */}
      {bottleneck && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm text-red-700 w-fit">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span><strong>{bottleneck.label}</strong> is the current bottleneck with {bottleneck.count} orders â€” prioritise clearing this stage.</span>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
        <span className="font-semibold">Time in stage:</span>
        <span className="bg-muted text-muted-foreground border border-border px-2 py-0.5 rounded">{'<1h'} â€” on track</span>
        <span className="bg-yellow-100 text-yellow-700 border border-yellow-200 px-2 py-0.5 rounded">1â€“8h â€” watch</span>
        <span className="bg-orange-100 text-orange-700 border border-orange-200 px-2 py-0.5 rounded">{'>'} 8h â€” slow</span>
        <span className="bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded">{'>'} 2d â€” blocked</span>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4" suppressHydrationWarning>
          {COLUMNS.map(col => (
            <Column key={col.id} id={col.id} label={col.label} orders={getColumnOrders(col.id)} color={col.color} />
          ))}
        </div>
        <DragOverlay>
          {active && (
            <Card className="shadow-xl w-[210px]">
              <CardContent className="p-3">
                <p className="text-sm font-semibold truncate">{active.title}</p>
              </CardContent>
            </Card>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  )
}

