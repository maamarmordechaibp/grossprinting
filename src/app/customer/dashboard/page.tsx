import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import Link from 'next/link'
import { Plus, Briefcase, Clock, CheckCircle, AlertTriangle } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

type OrderRow = { id: string; title: string; status: string; priority: string; created_at: string; deadline: string | null }
type QuoteRow = { id: string; order_id: string; orders: { title: string } | null }
type InvoiceRow = { id: string; order_id: string; total: number; orders: { title: string } | null }
type HistoryRow = { id: string; order_id: string; from_status: string | null; to_status: string; changed_at: string; note: string | null; orders: { title: string } | null }

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

export default async function CustomerDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileRaw } = await supabase
    .from('users')
    .select('customer_id, full_name')
    .eq('id', user.id)
    .single()
  const profile = profileRaw as unknown as { customer_id: string | null; full_name: string | null } | null

  const customerId = profile?.customer_id

  const [ordersRes, quotesRes, invoicesRes, historyRes] = await Promise.all([
    supabase.from('orders').select('*').eq('customer_id', customerId!).order('created_at', { ascending: false }).limit(10),
    supabase.from('quotes').select('*, orders(title)').eq('status', 'sent').limit(5),
    supabase.from('invoices').select('*, orders(title)').in('status', ['sent', 'partial', 'overdue']).limit(5),
    supabase.from('order_status_history').select('*, orders(title)').order('changed_at', { ascending: false }).limit(8),
  ])

  const orders = (ordersRes.data ?? []) as unknown as OrderRow[]
  const pendingQuotes = (quotesRes.data ?? []) as unknown as QuoteRow[]
  const unpaidInvoices = (invoicesRes.data ?? []) as unknown as InvoiceRow[]
  const history = (historyRes.data ?? []) as unknown as HistoryRow[]

  const activeOrders = orders.filter(o => !['delivered', 'cancelled', 'rejected'].includes(o.status))
  const urgentOrders = orders.filter(o => o.priority === 'urgent' && !['delivered', 'completed', 'cancelled'].includes(o.status))

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Welcome + CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Welcome back{profile?.full_name ? `, ${profile.full_name}` : ''} 👋</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage your print jobs and track production.</p>
        </div>
        <Button asChild size="lg" className="gap-2 w-full sm:w-auto">
          <Link href="/customer/jobs/new">
            <Plus className="h-5 w-5" />
            New Print Job
          </Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{activeOrders.length}</p>
                <p className="text-xs text-muted-foreground">Active Jobs</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-yellow-500" />
              <div>
                <p className="text-2xl font-bold">{pendingQuotes.length}</p>
                <p className="text-xs text-muted-foreground">Quotes to Review</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{orders.filter(o => o.status === 'completed').length}</p>
                <p className="text-xs text-muted-foreground">Completed</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              <div>
                <p className="text-2xl font-bold">{urgentOrders.length}</p>
                <p className="text-xs text-muted-foreground">Urgent</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Pending Quotes */}
        {pendingQuotes.length > 0 && (
          <Card className="border-yellow-200 bg-yellow-50/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-yellow-800 flex items-center gap-2">
                <Clock className="h-4 w-4" /> Quotes Awaiting Your Approval
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {pendingQuotes.map((q: Record<string, unknown>) => (
                <div key={q.id as string} className="flex items-center justify-between bg-white rounded p-2">
                  <span className="text-sm font-medium">{(q.orders as Record<string, unknown>)?.title as string}</span>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/customer/jobs/${q.order_id}`}>Review</Link>
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Unpaid Invoices */}
        {unpaidInvoices.length > 0 && (
          <Card className="border-red-200 bg-red-50/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-red-800 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" /> Unpaid Invoices
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {unpaidInvoices.map((inv: Record<string, unknown>) => (
                <div key={inv.id as string} className="flex items-center justify-between bg-white rounded p-2">
                  <span className="text-sm font-medium">{(inv.orders as Record<string, unknown>)?.title as string}</span>
                  <span className="text-sm font-semibold">${Number(inv.total).toFixed(2)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Recent orders */}
      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between">
          <CardTitle className="text-base">Recent Jobs</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link href="/customer/jobs">View all</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Briefcase className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p>No jobs yet. Create your first print job!</p>
              <Button asChild className="mt-4 gap-2">
                <Link href="/customer/jobs/new">
                  <Plus className="h-4 w-4" /> New Job
                </Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {orders.map((order) => (
                <Link key={order.id} href={`/customer/jobs/${order.id}`}>
                  <div className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{order.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDistanceToNow(new Date(order.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    <Badge className={STATUS_COLOR[order.status] ?? ''}>{order.status}</Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Activity feed */}
      {history.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {history.map((item: Record<string, unknown>, i) => (
                <div key={item.id as string}>
                  {i > 0 && <Separator className="my-2" />}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm">
                        <span className="font-medium">{(item.orders as Record<string, unknown>)?.title as string}</span>
                        {' '}moved to{' '}
                        <Badge variant="outline" className="text-xs">{item.to_status as string}</Badge>
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(item.changed_at as string), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
