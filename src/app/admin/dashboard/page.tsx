import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import {
  Briefcase, Clock, AlertTriangle, Package,
  TrendingUp, FileText, ArrowRight, Zap, CheckCircle2,
  DollarSign, BarChart3, ShieldAlert,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

type OrderRow = {
  id: string; title: string; status: string; priority: string
  deadline: string | null; created_at: string; total_amount: number
  production_stage: string | null
  customers: { company_name: string | null; full_name: string } | null
}
type QuoteRow = {
  id: string; order_id: string; total: number
  orders: { title: string; customers: { company_name: string | null } | null } | null
}
type InventoryRow = { id: string; name: string; quantity: number; min_quantity: number | null; unit: string }
type PaymentRow   = { amount: number; paid_at: string }

const STAGE_ORDER = ['pending', 'prepress', 'printing', 'cutting', 'finishing', 'qc', 'packaging']
const STAGE_LABELS: Record<string, string> = {
  pending: 'Pending', prepress: 'Prepress', printing: 'Printing',
  cutting: 'Cutting', finishing: 'Finishing', qc: 'QC', packaging: 'Packaging',
}
const STAGE_BAR_COLORS: Record<string, string> = {
  pending: 'bg-gray-400', prepress: 'bg-blue-400', printing: 'bg-violet-500',
  cutting: 'bg-orange-400', finishing: 'bg-indigo-500', qc: 'bg-emerald-500', packaging: 'bg-amber-400',
}

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

function fmt$(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

export default async function AdminDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileRaw } = await supabase.from('users').select('full_name').eq('id', user.id).single()
  const profile = profileRaw as unknown as { full_name: string | null } | null
  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'

  const now   = new Date()
  const today = now.toISOString().split('T')[0]
  const hour  = now.getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  // Date range helpers for revenue
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
  const monday     = new Date(now)
  monday.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1))
  monday.setHours(0, 0, 0, 0)
  const monthStart = new Date(now); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)

  const [
    allActiveRes,
    pendingQuotesRes,
    recentOrdersRes,
    lowStockRes,
    completedTodayRes,
    paymentsRes,
  ] = await Promise.all([
    // Single fetch for all active orders — used for KPIs, risk, bottleneck
    supabase.from('orders')
      .select('id, title, status, production_stage, priority, deadline, total_amount, created_at, customers(company_name, full_name)')
      .not('status', 'in', '(delivered,cancelled,rejected)')
      .order('deadline', { ascending: true, nullsFirst: false }),
    supabase.from('quotes')
      .select('id, order_id, total, orders(title, customers(company_name))')
      .eq('status', 'sent').order('created_at'),
    supabase.from('orders')
      .select('id, title, status, priority, deadline, created_at, customers(company_name, full_name)')
      .order('created_at', { ascending: false }).limit(8),
    supabase.from('inventory').select('id, name, quantity, min_quantity, unit'),
    supabase.from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'completed').gte('updated_at', today + 'T00:00:00Z'),
    supabase.from('payments')
      .select('amount, paid_at')
      .gte('paid_at', monthStart.toISOString()),
  ])

  const allActive      = (allActiveRes.data ?? [])      as unknown as OrderRow[]
  const pendingQuotes  = (pendingQuotesRes.data ?? [])  as unknown as QuoteRow[]
  const recentOrders   = (recentOrdersRes.data ?? [])   as unknown as OrderRow[]
  const allInventory   = (lowStockRes.data ?? [])       as unknown as InventoryRow[]
  const payments       = (paymentsRes.data ?? [])       as unknown as PaymentRow[]
  const completedToday = completedTodayRes.count ?? 0

  // ── KPI derivations ────────────────────────────────────────────────────────
  const activeCount    = allActive.length
  const endOfToday     = new Date(today + 'T23:59:59Z')
  const todayDeadlines = allActive.filter(o => o.deadline && new Date(o.deadline) <= endOfToday)
  const urgentActive   = allActive.filter(o => o.priority === 'urgent' && o.status !== 'completed')
  const riskOrders     = allActive
    .filter(o => o.deadline && new Date(o.deadline) < now && o.status !== 'completed')
    .slice(0, 5)
  const lowStock       = allInventory.filter(i => i.quantity <= (i.min_quantity ?? 0))

  // ── Revenue ─────────────────────────────────────────────────────────────────
  const revenueToday = payments.filter(p => new Date(p.paid_at) >= todayStart).reduce((s, p) => s + Number(p.amount), 0)
  const revenueWeek  = payments.filter(p => new Date(p.paid_at) >= monday).reduce((s, p) => s + Number(p.amount), 0)

  // ── Production bottleneck ──────────────────────────────────────────────────
  const inProduction = allActive.filter(o => !['quote', 'completed'].includes(o.status))
  const stageCounts: Record<string, number> = {}
  for (const o of inProduction) {
    const s = o.production_stage ?? 'pending'
    stageCounts[s] = (stageCounts[s] ?? 0) + 1
  }
  const maxStageCount   = inProduction.length > 0 ? Math.max(0, ...Object.values(stageCounts)) : 0
  const bottleneckStage = maxStageCount > 0
    ? Object.entries(stageCounts).sort((a, b) => b[1] - a[1])[0][0]
    : null

  // Unique issue count for "Needs Attention" badge
  const attentionIds = new Set([...riskOrders.map(o => o.id), ...urgentActive.map(o => o.id)])

  return (
    <div className="space-y-7 max-w-6xl mx-auto">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">{greeting}, {firstName} 👋</p>
          <h1 className="text-2xl font-bold tracking-tight mt-0.5">Operations Dashboard</h1>
        </div>
        <Button asChild className="gap-2 shadow-sm">
          <Link href="/admin/orders"><Briefcase className="h-4 w-4" /> View all orders</Link>
        </Button>
      </div>

      {/* ── NEEDS ATTENTION NOW ────────────────────────────────────────────── */}
      {attentionIds.size > 0 && (
        <div className="rounded-2xl border border-red-200 bg-red-50/40 overflow-hidden">
          <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-red-200/60">
            <ShieldAlert className="h-4 w-4 text-red-600" />
            <span className="text-sm font-bold text-red-800 tracking-wide uppercase">Needs Attention Now</span>
            <span className="ml-auto text-xs bg-red-600 text-white font-bold px-2 py-0.5 rounded-full">
              {attentionIds.size} issue{attentionIds.size !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="p-4 space-y-2">
            {/* Overdue orders */}
            {riskOrders.map(o => {
              const cust = o.customers as Record<string, unknown> | null
              const daysOverdue = Math.floor((now.getTime() - new Date(o.deadline!).getTime()) / 86_400_000)
              return (
                <Link key={o.id} href={`/admin/orders/${o.id}`}>
                  <div className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 hover:bg-red-50 transition-colors group border border-red-100">
                    <div className="h-8 w-8 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
                      <Clock className="h-4 w-4 text-red-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{o.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {(cust?.company_name ?? cust?.full_name) as string ?? 'Unknown'}
                        {' · '}
                        <span className="text-red-600 font-medium">{daysOverdue}d overdue</span>
                        {Number(o.total_amount) > 0 && ` · ${fmt$(Number(o.total_amount))}`}
                      </p>
                    </div>
                    {o.priority === 'urgent' && (
                      <span className="text-[11px] font-bold bg-red-600 text-white px-2 py-0.5 rounded-full shrink-0">URGENT</span>
                    )}
                    <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </div>
                </Link>
              )
            })}
            {/* Urgent but not overdue */}
            {urgentActive
              .filter(u => !riskOrders.some(r => r.id === u.id))
              .slice(0, 3)
              .map(o => {
                const cust = o.customers as Record<string, unknown> | null
                return (
                  <Link key={o.id} href={`/admin/orders/${o.id}`}>
                    <div className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 hover:bg-orange-50 transition-colors group border border-orange-100">
                      <div className="h-8 w-8 rounded-lg bg-orange-100 flex items-center justify-center shrink-0">
                        <Zap className="h-4 w-4 text-orange-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{o.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {(cust?.company_name ?? cust?.full_name) as string ?? 'Unknown'} · Urgent priority
                          {Number(o.total_amount) > 0 && ` · ${fmt$(Number(o.total_amount))}`}
                        </p>
                      </div>
                      <span className="text-[11px] font-bold bg-orange-500 text-white px-2 py-0.5 rounded-full shrink-0">URGENT</span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </div>
                  </Link>
                )
              })}
          </div>
        </div>
      )}

      {/* ── Alert strip ────────────────────────────────────────────────────── */}
      {(todayDeadlines.length > 0 || lowStock.length > 0 || (bottleneckStage && maxStageCount >= 3)) && (
        <div className="flex flex-wrap gap-2">
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
          {bottleneckStage && maxStageCount >= 3 && (
            <Link href="/admin/kanban" className="flex items-center gap-2 bg-violet-50 border border-violet-200 text-violet-700 text-sm font-medium px-4 py-2 rounded-full hover:bg-violet-100 transition-colors">
              <BarChart3 className="h-3.5 w-3.5" />
              Bottleneck: {STAGE_LABELS[bottleneckStage]} ({maxStageCount} orders)
            </Link>
          )}
        </div>
      )}

      {/* ── KPI cards (6 across) ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <div className="bg-card rounded-2xl border p-5 flex flex-col gap-3">
          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Briefcase className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-bold tracking-tight">{activeCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Active Orders</p>
          </div>
        </div>

        <div className={`bg-card rounded-2xl border p-5 flex flex-col gap-3 ${todayDeadlines.length > 0 ? 'border-orange-200 bg-orange-50/30' : ''}`}>
          <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${todayDeadlines.length > 0 ? 'bg-orange-100' : 'bg-muted'}`}>
            <Clock className={`h-5 w-5 ${todayDeadlines.length > 0 ? 'text-orange-600' : 'text-muted-foreground'}`} />
          </div>
          <div>
            <p className={`text-2xl font-bold tracking-tight ${todayDeadlines.length > 0 ? 'text-orange-700' : ''}`}>{todayDeadlines.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Due Today</p>
          </div>
        </div>

        <div className={`bg-card rounded-2xl border p-5 flex flex-col gap-3 ${urgentActive.length > 0 ? 'border-red-200 bg-red-50/30' : ''}`}>
          <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${urgentActive.length > 0 ? 'bg-red-100' : 'bg-muted'}`}>
            <AlertTriangle className={`h-5 w-5 ${urgentActive.length > 0 ? 'text-red-600' : 'text-muted-foreground'}`} />
          </div>
          <div>
            <p className={`text-2xl font-bold tracking-tight ${urgentActive.length > 0 ? 'text-red-700' : ''}`}>{urgentActive.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Urgent Jobs</p>
          </div>
        </div>

        <div className={`bg-card rounded-2xl border p-5 flex flex-col gap-3 ${completedToday > 0 ? 'border-emerald-200 bg-emerald-50/20' : ''}`}>
          <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${completedToday > 0 ? 'bg-emerald-100' : 'bg-muted'}`}>
            <CheckCircle2 className={`h-5 w-5 ${completedToday > 0 ? 'text-emerald-600' : 'text-muted-foreground'}`} />
          </div>
          <div>
            <p className={`text-2xl font-bold tracking-tight ${completedToday > 0 ? 'text-emerald-700' : ''}`}>{completedToday}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Completed Today</p>
          </div>
        </div>

        <div className={`bg-card rounded-2xl border p-5 flex flex-col gap-3 ${revenueToday > 0 ? 'border-emerald-200 bg-emerald-50/20' : ''}`}>
          <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${revenueToday > 0 ? 'bg-emerald-100' : 'bg-muted'}`}>
            <DollarSign className={`h-5 w-5 ${revenueToday > 0 ? 'text-emerald-600' : 'text-muted-foreground'}`} />
          </div>
          <div>
            <p className={`text-2xl font-bold tracking-tight tabular-nums ${revenueToday > 0 ? 'text-emerald-700' : ''}`}>{fmt$(revenueToday)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Revenue Today</p>
          </div>
        </div>

        <div className="bg-card rounded-2xl border p-5 flex flex-col gap-3">
          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <TrendingUp className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-bold tracking-tight tabular-nums">{fmt$(revenueWeek)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">This Week</p>
          </div>
        </div>
      </div>

      {/* ── Production Pipeline ─────────────────────────────────────────────── */}
      {inProduction.length > 0 && (
        <div className="rounded-2xl border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold">Production Pipeline</h2>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{inProduction.length} in flight</span>
            </div>
            <Link href="/admin/kanban" className="text-sm text-primary hover:text-primary/80 font-medium flex items-center gap-1">
              Kanban <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="px-6 py-5">
            <div className="grid grid-cols-7 gap-3">
              {STAGE_ORDER.map(stage => {
                const count = stageCounts[stage] ?? 0
                const isBottleneck = stage === bottleneckStage && count > 0
                const heightPct = maxStageCount > 0 ? Math.max(10, Math.round((count / maxStageCount) * 100)) : 10
                return (
                  <div key={stage} className="flex flex-col items-center gap-1.5">
                    <span className={`text-sm font-bold ${count > 0 ? 'text-foreground' : 'text-muted-foreground/30'}`}>
                      {count > 0 ? count : '—'}
                    </span>
                    <div className="w-full h-16 bg-muted/40 rounded-lg flex items-end overflow-hidden">
                      {count > 0 && (
                        <div
                          className={`w-full rounded-lg ${STAGE_BAR_COLORS[stage]} ${isBottleneck ? 'ring-2 ring-red-400 ring-offset-1' : ''}`}
                          style={{ height: `${heightPct}%` }}
                        />
                      )}
                    </div>
                    <div className="text-center">
                      <span className={`text-[10px] font-medium leading-tight block ${isBottleneck ? 'text-red-600 font-bold' : 'text-muted-foreground'}`}>
                        {STAGE_LABELS[stage]}
                      </span>
                      {isBottleneck && <span className="text-[9px] text-red-500 font-bold">BOTTLENECK</span>}
                    </div>
                  </div>
                )
              })}
            </div>
            {bottleneckStage && maxStageCount >= 2 && (
              <p className="text-xs text-muted-foreground mt-4 text-center bg-red-50 rounded-lg px-4 py-2 border border-red-100">
                ⚠️ <span className="font-semibold text-red-600">{STAGE_LABELS[bottleneckStage]}</span> has {maxStageCount} orders queued — prioritise this stage to keep deliveries on track.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Alert panels ────────────────────────────────────────────────────── */}
      {(todayDeadlines.length > 0 || pendingQuotes.length > 0 || lowStock.length > 0) && (
        <div className="grid lg:grid-cols-3 gap-4">

          {todayDeadlines.length > 0 && (
            <div className="rounded-2xl border border-orange-200 bg-orange-50/40 overflow-hidden">
              <div className="flex items-center px-5 py-3.5 border-b border-orange-200/60 gap-2">
                <Clock className="h-4 w-4 text-orange-600" />
                <span className="text-sm font-semibold text-orange-800">Due Today</span>
                <span className="text-xs bg-orange-200 text-orange-800 font-bold px-1.5 py-0.5 rounded-full">{todayDeadlines.length}</span>
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
                {pendingQuotes.slice(0, 4).map(q => (
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
                {lowStock.slice(0, 4).map(item => (
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

      {/* ── Recent Orders ───────────────────────────────────────────────────── */}
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
            {recentOrders.map(order => {
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
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[order.status] ?? 'bg-gray-100 text-gray-700'}`}>
                        {order.status}
                      </span>
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