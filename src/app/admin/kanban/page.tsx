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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import Link from 'next/link'
import { GripVertical, Loader2 } from 'lucide-react'

type Order = {
  id: string
  title: string
  priority: string
  status: string
  production_stage: string | null
  deadline: string | null
  customers: { company_name: string | null; full_name: string } | null
}

const COLUMNS: { id: string; label: string; stage: string | null }[] = [
  { id: 'approved', label: 'Approved', stage: null },
  { id: 'prepress', label: 'Prepress', stage: 'prepress' },
  { id: 'printing', label: 'Printing', stage: 'printing' },
  { id: 'cutting', label: 'Cutting', stage: 'cutting' },
  { id: 'finishing', label: 'Finishing', stage: 'finishing' },
  { id: 'qc', label: 'QC', stage: 'qc' },
  { id: 'packaging', label: 'Packaging', stage: 'packaging' },
]

const PRIORITY_DOT: Record<string, string> = {
  urgent: 'bg-red-500',
  high: 'bg-orange-400',
  normal: 'bg-blue-400',
  low: 'bg-gray-400',
}

function KanbanCard({ order }: { order: Order }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: order.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }
  const cust = order.customers

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <Link href={`/admin/orders/${order.id}`}>
        <Card className="mb-2 hover:shadow-sm transition-shadow cursor-pointer">
          <CardContent className="p-3">
            <div className="flex items-start gap-2">
              <button {...listeners} className="mt-0.5 text-muted-foreground/50 hover:text-muted-foreground cursor-grab active:cursor-grabbing shrink-0" onClick={e => e.preventDefault()}>
                <GripVertical className="h-4 w-4" />
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{order.title}</p>
                <p className="text-xs text-muted-foreground truncate">{cust?.company_name ?? cust?.full_name ?? ''}</p>
                {order.deadline && (
                  <p className="text-xs text-muted-foreground mt-1">Due {new Date(order.deadline).toLocaleDateString()}</p>
                )}
              </div>
              <div className={`h-2 w-2 rounded-full mt-1 shrink-0 ${PRIORITY_DOT[order.priority] ?? 'bg-gray-400'}`} title={order.priority} />
            </div>
          </CardContent>
        </Card>
      </Link>
    </div>
  )
}

function Column({ id, label, orders }: { id: string; label: string; orders: Order[] }) {
  return (
    <div className="flex flex-col min-w-[200px] max-w-[220px] shrink-0">
      <div className="flex items-center justify-between mb-2 px-1">
        <h3 className="text-sm font-semibold">{label}</h3>
        <Badge variant="outline" className="text-xs">{orders.length}</Badge>
      </div>
      <div className="bg-muted/40 rounded-lg p-2 flex-1 min-h-[120px]">
        <SortableContext items={orders.map(o => o.id)} strategy={verticalListSortingStrategy}>
          {orders.map(o => <KanbanCard key={o.id} order={o} />)}
        </SortableContext>
        {orders.length === 0 && (
          <div className="text-xs text-muted-foreground/50 text-center py-4">Empty</div>
        )}
      </div>
    </div>
  )
}

export default function KanbanPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (session) setToken(session.access_token)

    const { data } = await supabase
      .from('orders')
      .select('id, title, priority, status, production_stage, deadline, customers(company_name, full_name)')
      .in('status', ['approved', 'printing', 'finishing'])
      .order('created_at')

    setOrders((data as Order[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useRealtimeOrders({ onOrder: () => load() })

  function getColumnOrders(colId: string) {
    const col = COLUMNS.find(c => c.id === colId)!
    if (col.id === 'approved') {
      return orders.filter(o => o.status === 'approved' && !o.production_stage)
    }
    return orders.filter(o => o.production_stage === col.stage)
  }

  function handleDragStart(e: DragStartEvent) {
    setActiveId(e.active.id as string)
  }

  async function handleDragEnd(e: DragEndEvent) {
    setActiveId(null)
    const { active, over } = e
    if (!over || active.id === over.id) return

    // Find target column from over.id (could be column id or order id)
    const overCol = COLUMNS.find(c => c.id === over.id) ?? COLUMNS.find(c => getColumnOrders(c.id).some(o => o.id === over.id))
    if (!overCol) return

    const order = orders.find(o => o.id === active.id)
    if (!order) return

    const newStage = overCol.stage
    const newStatus = overCol.id === 'approved' ? 'approved' : 'printing'

    // Optimistic update
    setOrders(prev => prev.map(o =>
      o.id === order.id ? { ...o, production_stage: newStage, status: newStatus } : o,
    ))

    try {
      await api.orders.update(order.id, { production_stage: newStage ?? undefined, status: newStatus })
    } catch (err) {
      toast.error((err as Error).message)
      load()
    }
  }

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
      <h1 className="text-2xl font-bold">Production Kanban</h1>
      <p className="text-sm text-muted-foreground">Drag orders between stages to update production status in real time.</p>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUMNS.map(col => (
            <Column key={col.id} id={col.id} label={col.label} orders={getColumnOrders(col.id)} />
          ))}
        </div>
        <DragOverlay>
          {active && (
            <Card className="shadow-xl w-[200px]">
              <CardContent className="p-3">
                <p className="text-sm font-medium truncate">{active.title}</p>
              </CardContent>
            </Card>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
