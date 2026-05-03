import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import {
  Briefcase, Clock, AlertTriangle, Package,
  TrendingUp, FileText, ArrowRight, Zap, CheckCircle2,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

type OrderRow = { id: string; title: string; status: string; priority: string; deadline: string | null; created_at: string; customers: { company_name: string | null; full_name: string } | null }
type QuoteRow  = { id: string; order_id: string; total: number; status: string; created_at: string; orders: { title: string; customers: { company_name: string | null } | null } | null }
type InventoryRow = { id: string; name: string; quantity: number; min_quantity: number | null; unit: string }

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

const STATUS_BAR: Record<string, string> = {
  quote: 'bg-amber-400', approved: 'bg-blue-500', printing: 'bg-violet-500',
  finishing: 'bg-indigo-500', completed: 'bg-emerald-500', delivered: 'bg-gray-400',
}

export default async function AdminDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileRaw } = await supabase.from('users').select('full_name').eq('id', user.id).single()
  const profile = profileRaw as unknown as { full_name: string | null } | null
  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'

  const today = new Date().toISOString().split('T')[0]
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  const [
    activeOrdersRes,
    todayDeadlinesRes,
    urgentRes,
    pendingQuotesRes,
    recentOrdersRes,
    lowStockRes,
    completedTodayRes,
  ] = await Promise.all([
    supabase.from('orders').select('id', { count: 'exact', head: true }).not('status', 'in', '(delivered,cancelled,rejected)'),
    supabase.from('orders').select('*, customers(company_name, full_name)').lte('deadline', today + 'T23:59:59Z').not('status', 'in', '(delivered,cancelled,rejected)'),
    supabase.from('orders').select('*, customers(company_name, full_name)').eq('priority', 'urgent').not('status', 'in', '(delivered,cancelled,rejected)'),
    supabase.from('quotes').select('*, orders(title, customers(company_name))').eq('status', 'sent').order('created_at'),
    supabase.from('orders').select('*, customers(company_name, full_name)').order('created_at', { ascending: false }).limit(10),
    supabase.from('inventory').select('*'),
    supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'completed').gte('updated_at', today + 'T00:00:00Z'),
  ])

  const activeCount   = activeOrdersRes.count ?? 0
  const completedToday = completedTodayRes.count ?? 0
  const todayDeadlines = (todayDeadlinesRes.data ?? []) as unknown as OrderRow[]
  const urgent         = (urgentRes.data ?? []) as unknown as OrderRow[]
  const pendingQuotes  = (pendingQuotesRes.data ?? []) as unknown as QuoteRow[]
  const recentOrders   = (recentOrdersRes.data ?? []) as unknown as OrderRow[]
  const allInventory   = (lowStockRes.data ?? []) as unknown as InventoryRow[]
  const lowStock       = allInventory.filter(i => i.quantity <= (i.min_quantity ?? 0))

  const hasAlerts = todayDeadlines.length > 0 || urgent.length > 0 || lowStock.length > 0

  return (
    <div className="space-y-7 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">{greeting}, {firstName} 👋</p>
          <h1 className="text-2xl font-bold tracking-tight mt-0.5">Operations Dashboard</h1>
        </div>
        <Button asChild className="gap-2 shadow-sm">
          <Link href="/admin/orders"><Briefcase className="h-4 w-4" /> View all orders</Link>
        </Button>
      </div>

      {/* Alert strip */}
      {hasAlerts && (
        <div className="flex flex-wrap gap-2">
          {urgent.length > 0 && (
            <Link href="/admin/orders?status=approved" className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm font-medium px-4 py-2 rounded-full hover:bg-red-100 transition-colors">
              <Zap className="h-3.5 w-3.5" />
              {urgent.length} urgent job{urgent.length !== 1 ? 's' : ''} need attention
            </Link>
          )}
          {todayDeadlines.length > 0 && (
            <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 text-orange-700 text-sm font-medium px-4 py-2 rounded-full">
              <Clock className="h-3.5 w-3.5" />
              {todayDeadlines.length} job{todayDeadlines.length !== 1 ? 's' : ''} due today
            </div>
          )}
          {lowStock.length > 0 && (
            <Link href="/admin/inventory" className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-sm font-medium px-4 py-2 rounded-full hover:bg-amber-100 transition-colors">
              <Package className="h-3.5 w-3.5" />
              {lowStock.length} item{lowStock.length !== 1 ? 's' : ''} low on stock
            </Link>
          )}
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Active orders */}
        <div className="bg-card rounded-2xl border p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Briefcase className="h-5 w-5 text-primary" />
            </div>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </div>
          <div>
            <p className="text-3xl font-bold tracking-tight">{activeCount}</p>
            <p className="text-sm text-muted-foreground mt-0.5">Active Orders</p>
          </div>
        </div>

        {/* Due today */}
        <div className={`bg-card rounded-2xl border p-5 flex flex-col gap-3 ${todayDeadlines.length > 0 ? 'border-orange-200 bg-orange-50/40' : ''}`}>
          <div className="flex items-center justify-between">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${todayDeadlines.length > 0 ? 'bg-orange-100' : 'bg-muted'}`}>
              <Clock className={`h-5 w-5 ${todayDeadlines.length > 0 ? 'text-orange-600' : 'text-muted-foreground'}`} />
            </div>
          </div>
          <div>
            <p className={`text-3xl font-bold tracking-tight ${todayDeadlines.length > 0 ? 'text-orange-700' : ''}`}>{todayDeadlines.length}</p>
            <p className="text-sm text-muted-foreground mt-0.5">Due Today</p>
          </div>
        </div>

        {/* Urgent */}
        <div className={`bg-card rounded-2xl border p-5 flex flex-col gap-3 ${urgent.length > 0 ? 'border-red-200 bg-red-50/40' : ''}`}>
          <div className="flex items-center justify-between">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${urgent.length > 0 ? 'bg-red-100' : 'bg-muted'}`}>
              <AlertTriangle className={`h-5 w-5 ${urgent.length > 0 ? 'text-red-600' : 'text-muted-foreground'}`} />
            </div>
          </div>
          <div>
            <p className={`text-3xl font-bold tracking-tight ${urgent.length > 0 ? 'text-red-700' : ''}`}>{urgent.length}</p>
            <p className="text-sm text-muted-foreground mt-0.5">Urgent Jobs</p>
          </div>
        </div>

        {/* Completed today */}
        <div className={`bg-card rounded-2xl border p-5 flex flex-col gap-3 ${completedToday > 0 ? 'border-emerald-200 bg-emerald-50/30' : ''}`}>
          <div className="flex items-center justify-between">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${completedToday > 0 ? 'bg-emerald-100' : 'bg-muted'}`}>
              <CheckCircle2 className={`h-5 w-5 ${completedToday > 0 ? 'text-emerald-600' : 'text-muted-foreground'}`} />
            </div>
          </div>
          <div>
            <p className={`text-3xl font-bold tracking-tight ${completedToday > 0 ? 'text-emerald-700' : ''}`}>{completedToday}</p>
            <p className="text-sm text-muted-foreground mt-0.5">Completed Today</p>
          </div>
        </div>
      </div>

      {/* Alert panels row */}
      {(todayDeadlines.length > 0 || pendingQuotes.length > 0 || lowStock.length > 0) && (
        <div className="grid lg:grid-cols-3 gap-4">

          {todayDeadlines.length > 0 && (
            <div className="rounded-2xl border border-orange-200 bg-orange-50/40 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-orange-200/60">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-orange-600" />
                  <span className="text-sm font-semibold text-orange-800">Due Today</span>
                  <span className="text-xs bg-orange-200 text-orange-800 font-bold px-1.5 py-0.5 rounded-full">{todayDeadlines.length}</span>
                </div>
              </div>
              <div className="p-3 space-y-1.5">
                {todayDeadlines.slice(0, 4).map(o => (
                  <Link key={o.id} href={`/admin/orders/${o.id}`}>
                    <div className="flex items-center gap-3 bg-white rounded-lg px-3 py-2.5 hover:bg-orange-50 transition-colors group border border-orange-100/50">
                      <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${STATUS_BAR[o.status] ?? 'bg-gray-400'}`} />
                      <span className="text-sm font-medium flex-1 truncate">{o.title}</span>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {pendingQuotes.length > 0 && (
            <div className="rounded-2xl border border-blue-200 bg-blue-50/30 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-blue-200/60">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-semibold text-blue-800">Quotes Pending</span>
                  <span className="text-xs bg-blue-200 text-blue-800 font-bold px-1.5 py-0.5 rounded-full">{pendingQuotes.length}</span>
                </div>
                <Link href="/admin/quotes" className="text-xs text-blue-600 hover:text-blue-800 font-medium">View all</Link>
              </div>
              <div className="p-3 space-y-1.5">
                {pendingQuotes.slice(0, 4).map((q) => (
                  <Link key={q.id} href={`/admin/orders/${q.order_id}`}>
                    <div className="flex items-center gap-3 bg-white rounded-lg px-3 py-2.5 hover:bg-blue-50 transition-colors group border border-blue-100/50">
                      <span className="text-sm font-medium flex-1 truncate">{(q.orders as Record<string,unknown>)?.title as string}</span>
                      <span className="text-sm font-bold text-blue-700">${Number(q.total).toFixed(2)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {lowStock.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/30 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-amber-200/60">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-amber-600" />
                  <span className="text-sm font-semibold text-amber-800">Low Stock</span>
                  <span className="text-xs bg-amber-200 text-amber-800 font-bold px-1.5 py-0.5 rounded-full">{lowStock.length}</span>
                </div>
                <Link href="/admin/inventory" className="text-xs text-amber-600 hover:text-amber-800 font-medium">Manage</Link>
              </div>
              <div className="p-3 space-y-1.5">
                {lowStock.slice(0, 4).map((item) => (
                  <div key={item.id} className="flex items-center gap-3 bg-white rounded-lg px-3 py-2.5 border border-amber-100/50">
                    <span className="text-sm font-medium flex-1 truncate">{item.name}</span>
                    <span className="text-xs font-semibold text-red-600">{item.quantity} {item.unit}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Recent orders */}
      <div className="rounded-2xl border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-semibold">Recent Orders</h2>
          <Link href="/admin/orders" className="text-sm text-primary hover:text-primary/80 font-medium flex items-center gap-1">
            View all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        {recentOrders.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">No orders yet.</div>
        ) : (
          <div className="divide-y">
            {recentOrders.map((order) => {
              const cust = order.customers as Record<string, unknown> | null
              return (
                <Link key={order.id} href={`/admin/orders/${order.id}`}>
                  <div className="flex items-center gap-4 px-6 py-3.5 hover:bg-accent/40 transition-colors group">
                    <div className={`h-8 w-1 rounded-full shrink-0 ${STATUS_BAR[order.status] ?? 'bg-gray-300'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{order.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {(cust?.company_name ?? cust?.full_name) as string ?? 'Unknown'}
                        {' · '}
                        {formatDistanceToNow(new Date(order.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {order.priority === 'urgent' && (
                        <span className="text-[11px] font-semibold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Urgent</span>
                      )}
                      {order.deadline && (
                        <span className="text-[11px] text-muted-foreground hidden sm:block">
                          Due {new Date(order.deadline).toLocaleDateString()}
                        </span>
                      )}
                      <Badge className={`text-xs ${STATUS_COLOR[order.status] ?? ''}`}>{order.status}</Badge>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}