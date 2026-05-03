import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { ArrowRight, Search, Inbox } from 'lucide-react'

type OrderRow = {
  id: string; title: string; status: string; priority: string
  deadline: string | null; created_at: string
  customers: { company_name: string | null; full_name: string } | null
}

const ALL_STATUSES = ['quote','approved','printing','finishing','completed','delivered','rejected','cancelled']

const STATUS_META: Record<string, { color: string; bar: string; dot: string }> = {
  quote:     { color: 'bg-amber-100 text-amber-800 border-amber-200',    bar: 'bg-amber-400',   dot: 'bg-amber-400' },
  approved:  { color: 'bg-blue-100 text-blue-800 border-blue-200',       bar: 'bg-blue-500',    dot: 'bg-blue-500' },
  printing:  { color: 'bg-violet-100 text-violet-800 border-violet-200', bar: 'bg-violet-500',  dot: 'bg-violet-500' },
  finishing: { color: 'bg-indigo-100 text-indigo-800 border-indigo-200', bar: 'bg-indigo-500',  dot: 'bg-indigo-500' },
  completed: { color: 'bg-emerald-100 text-emerald-800 border-emerald-200', bar: 'bg-emerald-500', dot: 'bg-emerald-500' },
  delivered: { color: 'bg-gray-100 text-gray-700 border-gray-200',       bar: 'bg-gray-400',    dot: 'bg-gray-400' },
  rejected:  { color: 'bg-red-100 text-red-800 border-red-200',          bar: 'bg-red-500',     dot: 'bg-red-500' },
  cancelled: { color: 'bg-red-50 text-red-600 border-red-100',           bar: 'bg-red-300',     dot: 'bg-red-300' },
}

const PRIORITY_META: Record<string, string> = {
  low:    'bg-gray-100 text-gray-600',
  normal: '',
  high:   'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { status, search } = await searchParams

  // Fetch all orders for counts, then filtered for display
  const [allOrdersRes, filteredRes] = await Promise.all([
    supabase.from('orders').select('status'),
    (() => {
      let q = supabase
        .from('orders')
        .select('*, customers(company_name, full_name)')
        .order('created_at', { ascending: false })
      if (status) q = q.eq('status', status)
      if (search) q = q.ilike('title', `%${search}%`)
      return q.limit(60)
    })(),
  ])

  const allOrders = (allOrdersRes.data ?? []) as { status: string }[]
  const orders    = (filteredRes.data ?? []) as unknown as OrderRow[]

  // Count per status
  const counts = ALL_STATUSES.reduce<Record<string,number>>((acc, s) => {
    acc[s] = allOrders.filter(o => o.status === s).length
    return acc
  }, {})
  const totalActive = allOrders.filter(o => !['delivered','cancelled','rejected'].includes(o.status)).length

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{totalActive} active jobs in the pipeline</p>
      </div>

      {/* Pipeline tabs */}
      <div className="space-y-3">
        {/* Search */}
        <form method="get" action="/admin/orders" className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            name="search"
            defaultValue={search}
            placeholder="Search by title…"
            className="w-full pl-9 pr-3 h-9 rounded-lg border bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 transition"
          />
          {status && <input type="hidden" name="status" value={status} />}
        </form>

        {/* Status tabs */}
        <div className="flex flex-wrap gap-1.5">
          <Link
            href={search ? `/admin/orders?search=${search}` : '/admin/orders'}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-medium transition-all border ${
              !status
                ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                : 'bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground'
            }`}
          >
            All
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${!status ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'}`}>
              {allOrders.length}
            </span>
          </Link>
          {ALL_STATUSES.filter(s => counts[s] > 0 || s === status).map(s => (
            <Link
              key={s}
              href={`/admin/orders?status=${s}${search ? `&search=${search}` : ''}`}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-medium transition-all border ${
                status === s
                  ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                  : 'bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${STATUS_META[s]?.dot ?? 'bg-gray-400'}`} />
              {s.charAt(0).toUpperCase() + s.slice(1)}
              <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${status === s ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'}`}>
                {counts[s]}
              </span>
            </Link>
          ))}
        </div>
      </div>

      {/* Orders list */}
      {orders.length === 0 ? (
        <div className="rounded-2xl border bg-card py-16 text-center">
          <Inbox className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No orders found{status ? ` with status "${status}"` : ''}.</p>
        </div>
      ) : (
        <div className="rounded-2xl border bg-card overflow-hidden divide-y">
          {orders.map((order) => {
            const cust = order.customers as Record<string, unknown> | null
            const meta = STATUS_META[order.status]
            const isOverdue = order.deadline && new Date(order.deadline) < new Date() && !['delivered','cancelled','completed'].includes(order.status)
            return (
              <Link key={order.id} href={`/admin/orders/${order.id}`}>
                <div className="flex items-center gap-4 px-5 py-4 hover:bg-accent/30 transition-colors group">
                  {/* Status bar */}
                  <div className={`h-10 w-1 rounded-full shrink-0 ${meta?.bar ?? 'bg-gray-300'}`} />

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm">{order.title}</p>
                      {order.priority === 'urgent' && (
                        <span className="text-[10px] font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full uppercase tracking-wide">Urgent</span>
                      )}
                      {order.priority === 'high' && (
                        <span className="text-[10px] font-semibold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">High</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-xs text-muted-foreground">
                        {(cust?.company_name ?? cust?.full_name) as string ?? 'Unknown customer'}
                      </span>
                      <span className="text-muted-foreground/40 text-xs">·</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(order.created_at), { addSuffix: true })}
                      </span>
                      {order.deadline && (
                        <>
                          <span className="text-muted-foreground/40 text-xs">·</span>
                          <span className={`text-xs font-medium ${isOverdue ? 'text-red-600' : 'text-muted-foreground'}`}>
                            {isOverdue ? '⚠ Overdue · ' : ''}Due {new Date(order.deadline).toLocaleDateString()}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Status badge */}
                  <div className="shrink-0 flex items-center gap-2">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${meta?.color ?? ''}`}>
                      {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                    </span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}