import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'
import { Plus, Briefcase, Clock, CheckCircle, AlertTriangle, ChevronRight, FileText, Activity } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

type OrderRow = { id: string; title: string; status: string; priority: string; created_at: string; deadline: string | null }
type QuoteRow = { id: string; order_id: string; total: number; orders: { title: string } | null }
type InvoiceRow = { id: string; order_id: string; total: number; orders: { title: string } | null }
type HistoryRow = { id: string; order_id: string; from_status: string | null; to_status: string; changed_at: string; orders: { title: string } | null }

const STATUS_COLOR: Record<string, string> = {
  quote: 'bg-amber-100 text-amber-800 border-amber-200',
  approved: 'bg-blue-100 text-blue-800 border-blue-200',
  printing: 'bg-violet-100 text-violet-800 border-violet-200',
  finishing: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  completed: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  delivered: 'bg-gray-100 text-gray-700 border-gray-200',
  rejected: 'bg-red-100 text-red-800 border-red-200',
  cancelled: 'bg-red-50 text-red-600 border-red-100',
}

const STATUS_LABEL: Record<string, string> = {
  quote: 'Awaiting Quote',
  approved: 'In Production',
  printing: 'Printing',
  finishing: 'Finishing',
  completed: 'Ready',
  delivered: 'Delivered',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
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
    supabase.from('orders').select('*').eq('customer_id', customerId ?? '').order('created_at', { ascending: false }).limit(10),
    supabase.from('quotes').select('*, orders(title)').eq('status', 'sent').limit(5),
    supabase.from('invoices').select('*, orders(title)').in('status', ['sent', 'partial', 'overdue']).limit(5),
    supabase.from('order_status_history').select('*, orders(title)').order('changed_at', { ascending: false }).limit(6),
  ])

  const orders = (ordersRes.data ?? []) as unknown as OrderRow[]
  const pendingQuotes = (quotesRes.data ?? []) as unknown as QuoteRow[]
  const unpaidInvoices = (invoicesRes.data ?? []) as unknown as InvoiceRow[]
  const history = (historyRes.data ?? []) as unknown as HistoryRow[]

  const activeOrders = orders.filter(o => !['delivered', 'cancelled', 'rejected'].includes(o.status))
  const completedOrders = orders.filter(o => ['completed', 'delivered'].includes(o.status))
  const urgentOrders = orders.filter(o => o.priority === 'urgent' && !['delivered', 'completed', 'cancelled'].includes(o.status))
  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="rounded-2xl bg-primary p-6 text-primary-foreground flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-primary-foreground/70 text-sm font-medium">Welcome back</p>
          <h1 className="text-2xl font-bold mt-0.5">Hi, {firstName}!</h1>
          <p className="text-primary-foreground/70 text-sm mt-1">
            {activeOrders.length > 0
              ? `You have ${activeOrders.length} active job${activeOrders.length !== 1 ? 's' : ''} in progress.`
              : 'No active jobs right now. Ready to start something new?'}
          </p>
        </div>
        <Button asChild size="lg" variant="secondary" className="gap-2 shrink-0">
          <Link href="/customer/jobs/new"><Plus className="h-5 w-5" />New Print Job</Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Active Jobs', value: activeOrders.length, icon: Briefcase, color: 'text-primary', bg: 'bg-primary/10' },
          { label: 'Quotes to Review', value: pendingQuotes.length, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Completed', value: completedOrders.length, icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Urgent', value: urgentOrders.length, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label} className="border-0 shadow-sm">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className={`${bg} p-2.5 rounded-xl`}>
                  <Icon className={`h-5 w-5 ${color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold leading-none">{value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {(pendingQuotes.length > 0 || unpaidInvoices.length > 0) && (
        <div className="grid sm:grid-cols-2 gap-4">
          {pendingQuotes.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-600" />
                <span className="font-semibold text-amber-900 text-sm">Quotes awaiting approval</span>
              </div>
              {pendingQuotes.slice(0, 3).map((q) => (
                <div key={q.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium">{q.orders?.title ?? 'Order'}</p>
                    <p className="text-xs text-muted-foreground">${Number(q.total).toFixed(2)}</p>
                  </div>
                  <Button asChild size="sm" className="h-7 text-xs bg-amber-600 hover:bg-amber-700">
                    <Link href={`/customer/jobs/${q.order_id}`}>Review →</Link>
                  </Button>
                </div>
              ))}
            </div>
          )}
          {unpaidInvoices.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-red-600" />
                <span className="font-semibold text-red-900 text-sm">Invoices outstanding</span>
              </div>
              {unpaidInvoices.slice(0, 3).map((inv) => (
                <div key={inv.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium">{inv.orders?.title ?? 'Invoice'}</p>
                    <p className="text-xs font-semibold text-red-700">${Number(inv.total).toFixed(2)} due</p>
                  </div>
                  <Button asChild size="sm" variant="outline" className="h-7 text-xs border-red-300 text-red-700">
                    <Link href="/customer/invoices">View</Link>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3 flex-row items-center justify-between">
              <CardTitle className="text-base font-semibold">Recent Jobs</CardTitle>
              <Button asChild variant="ghost" size="sm" className="text-xs h-7 gap-1">
                <Link href="/customer/jobs">View all <ChevronRight className="h-3 w-3" /></Link>
              </Button>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {orders.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground px-4">
                  <Briefcase className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-medium">No jobs yet</p>
                  <p className="text-xs mt-1 mb-4">Create your first print job to get started.</p>
                  <Button asChild size="sm" className="gap-1">
                    <Link href="/customer/jobs/new"><Plus className="h-4 w-4" />New Job</Link>
                  </Button>
                </div>
              ) : (
                <div>
                  {orders.map((order, i) => (
                    <Link key={order.id} href={`/customer/jobs/${order.id}`}>
                      <div className={`flex items-center justify-between px-6 py-3.5 hover:bg-muted/40 transition-colors cursor-pointer ${i < orders.length - 1 ? 'border-b' : ''}`}>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{order.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {formatDistanceToNow(new Date(order.created_at), { addSuffix: true })}
                            {order.deadline ? ` · Due ${new Date(order.deadline).toLocaleDateString()}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 ml-3 shrink-0">
                          <Badge className={`text-xs border ${STATUS_COLOR[order.status] ?? ''}`}>
                            {STATUS_LABEL[order.status] ?? order.status}
                          </Badge>
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3 flex-row items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base font-semibold">Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No recent activity.</p>
              ) : (
                <div className="relative pl-5">
                  <div className="absolute left-1.5 top-1 bottom-1 w-px bg-border" />
                  <div className="space-y-4">
                    {history.map((item) => (
                      <div key={item.id} className="relative">
                        <div className="absolute -left-4 top-1.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
                        <p className="text-sm font-medium leading-tight">{item.orders?.title ?? 'Job'}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          → <span className="font-medium text-foreground">{STATUS_LABEL[item.to_status] ?? item.to_status}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(item.changed_at), { addSuffix: true })}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
