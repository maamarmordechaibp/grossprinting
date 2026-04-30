import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Briefcase, Clock, AlertTriangle, Package } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

type OrderRow = { id: string; title: string; status: string; priority: string; deadline: string | null; created_at: string; customers: { company_name: string | null; full_name: string } | null }
type QuoteRow = { id: string; order_id: string; total: number; status: string; created_at: string; orders: { title: string; customers: { company_name: string | null } | null } | null }
type InventoryRow = { id: string; name: string; quantity: number; min_quantity: number | null; unit: string }

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

export default async function AdminDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const today = new Date().toISOString().split('T')[0]

  const [
    activeOrdersRes,
    todayDeadlinesRes,
    urgentRes,
    pendingQuotesRes,
    recentOrdersRes,
    lowStockRes,
  ] = await Promise.all([
    supabase.from('orders').select('id', { count: 'exact', head: true }).not('status', 'in', '(delivered,cancelled,rejected)'),
    supabase.from('orders').select('*').lte('deadline', today + 'T23:59:59Z').not('status', 'in', '(delivered,cancelled,rejected)'),
    supabase.from('orders').select('*').eq('priority', 'urgent').not('status', 'in', '(delivered,cancelled,rejected)'),
    supabase.from('quotes').select('*, orders(title, customers(company_name))').eq('status', 'sent').order('created_at'),
    supabase.from('orders').select('*, customers(company_name, full_name)').order('created_at', { ascending: false }).limit(8),
    supabase.from('inventory').select('*'),
  ])

  const activeCount = activeOrdersRes.count ?? 0
  const todayDeadlines = (todayDeadlinesRes.data ?? []) as unknown as OrderRow[]
  const urgent = (urgentRes.data ?? []) as unknown as OrderRow[]
  const pendingQuotes = (pendingQuotesRes.data ?? []) as unknown as QuoteRow[]
  const recentOrders = (recentOrdersRes.data ?? []) as unknown as OrderRow[]
  const allInventory = (lowStockRes.data ?? []) as unknown as InventoryRow[]
  const lowStock = allInventory.filter(i => i.quantity <= (i.min_quantity ?? 0))

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Operations Dashboard</h1>
        <Button asChild className="gap-2">
          <Link href="/admin/orders"><Briefcase className="h-4 w-4" /> All Orders</Link>
        </Button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{activeCount}</p>
                <p className="text-xs text-muted-foreground">Active Orders</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={todayDeadlines.length > 0 ? 'border-orange-200' : ''}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Clock className={`h-5 w-5 ${todayDeadlines.length > 0 ? 'text-orange-500' : 'text-muted-foreground'}`} />
              <div>
                <p className="text-2xl font-bold">{todayDeadlines.length}</p>
                <p className="text-xs text-muted-foreground">Due Today</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={urgent.length > 0 ? 'border-red-200' : ''}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className={`h-5 w-5 ${urgent.length > 0 ? 'text-red-500' : 'text-muted-foreground'}`} />
              <div>
                <p className="text-2xl font-bold">{urgent.length}</p>
                <p className="text-xs text-muted-foreground">Urgent Jobs</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={lowStock.length > 0 ? 'border-yellow-200' : ''}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Package className={`h-5 w-5 ${lowStock.length > 0 ? 'text-yellow-500' : 'text-muted-foreground'}`} />
              <div>
                <p className="text-2xl font-bold">{lowStock.length}</p>
                <p className="text-xs text-muted-foreground">Low Stock</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Today's deadlines */}
        {todayDeadlines.length > 0 && (
          <Card className="border-orange-200 bg-orange-50/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-orange-800 flex items-center gap-2">
                <Clock className="h-4 w-4" /> Due Today ({todayDeadlines.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {todayDeadlines.map(o => (
                <Link key={o.id} href={`/admin/orders/${o.id}`}>
                  <div className="flex items-center justify-between bg-white rounded p-2 hover:bg-accent transition-colors">
                    <span className="text-sm font-medium">{o.title}</span>
                    <Badge className={STATUS_COLOR[o.status] ?? ''}>{o.status}</Badge>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Pending quotes */}
        {pendingQuotes.length > 0 && (
          <Card className="border-yellow-200 bg-yellow-50/40">
            <CardHeader className="pb-2 flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold text-yellow-800">
                Quotes Awaiting Action ({pendingQuotes.length})
              </CardTitle>
              <Button asChild variant="ghost" size="sm">
                <Link href="/admin/quotes">View all</Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {pendingQuotes.slice(0, 4).map((q: Record<string, unknown>) => (
                <Link key={q.id as string} href={`/admin/orders/${q.order_id}`}>
                  <div className="flex items-center justify-between bg-white rounded p-2 hover:bg-accent transition-colors">
                    <span className="text-sm font-medium">{(q.orders as Record<string, unknown>)?.title as string}</span>
                    <span className="text-sm font-semibold">${Number(q.total).toFixed(2)}</span>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Low stock alerts */}
        {lowStock.length > 0 && (
          <Card className="border-yellow-200 bg-yellow-50/40">
            <CardHeader className="pb-2 flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold text-yellow-800 flex items-center gap-2">
                <Package className="h-4 w-4" /> Low Stock
              </CardTitle>
              <Button asChild variant="ghost" size="sm">
                <Link href="/admin/inventory">Manage</Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {lowStock.map((item) => (
                <div key={item.id} className="flex items-center justify-between bg-white rounded p-2">
                  <span className="text-sm font-medium">{item.name}</span>
                  <span className="text-sm text-red-600 font-semibold">
                    {item.quantity} {item.unit} (min {item.min_quantity})
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Recent orders */}
      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between">
          <CardTitle className="text-base">Recent Orders</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/orders">View all</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {recentOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No orders yet.</p>
          ) : (
            <div className="space-y-2">
              {recentOrders.map((order) => {
                const cust = order.customers as Record<string, unknown> | null
                return (
                  <Link key={order.id} href={`/admin/orders/${order.id}`}>
                    <div className="flex items-center gap-3 rounded-lg border p-3 hover:bg-accent transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{order.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {(cust?.company_name ?? cust?.full_name) as string ?? 'Unknown customer'}
                          {' · '}{formatDistanceToNow(new Date(order.created_at), { addSuffix: true })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {order.priority !== 'normal' && (
                          <Badge variant="outline" className="text-xs">{order.priority}</Badge>
                        )}
                        <Badge className={STATUS_COLOR[order.status] ?? ''}>{order.status}</Badge>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
