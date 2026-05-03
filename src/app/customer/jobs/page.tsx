import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { Plus, Briefcase, ChevronRight, Calendar, AlertTriangle, RotateCcw } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

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

const STATUS_STRIPE: Record<string, string> = {
  quote:     'bg-amber-400',
  approved:  'bg-blue-500',
  printing:  'bg-violet-500',
  finishing: 'bg-indigo-500',
  completed: 'bg-emerald-500',
  delivered: 'bg-gray-400',
  rejected:  'bg-red-500',
  cancelled: 'bg-red-300',
}

const STATUS_LABEL: Record<string, string> = {
  quote: 'Awaiting Quote', approved: 'In Production',
  printing: 'Printing', finishing: 'Finishing',
  completed: 'Ready', delivered: 'Delivered',
  rejected: 'Rejected', cancelled: 'Cancelled',
}

const PRIORITY_COLOR: Record<string, string> = {
  low: 'bg-gray-100 text-gray-500',
  normal: 'bg-blue-50 text-blue-600',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
}

type OrderRow = { id: string; title: string; status: string; priority: string; created_at: string; deadline: string | null; description: string | null }

export default async function CustomerJobsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileRaw } = await supabase.from('users').select('customer_id').eq('id', user.id).single()
  const profile = profileRaw as unknown as { customer_id: string | null } | null
  const customerId = profile?.customer_id

  const { data: rawOrders } = await supabase
    .from('orders')
    .select('*')
    .eq('customer_id', customerId ?? '')
    .order('created_at', { ascending: false })

  const orders = (rawOrders ?? []) as unknown as OrderRow[]
  const active = orders.filter(o => !['delivered', 'cancelled', 'rejected'].includes(o.status))
  const done   = orders.filter(o => ['delivered', 'cancelled', 'rejected'].includes(o.status))

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">My Print Jobs</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {active.length} active · {done.length} completed
          </p>
        </div>
        <Button asChild className="gap-2">
          <Link href="/customer/jobs/new"><Plus className="h-4 w-4" />New Job</Link>
        </Button>
      </div>

      {orders.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-12 text-center space-y-4">
          <Briefcase className="h-12 w-12 mx-auto text-muted-foreground/30" />
          <div>
            <p className="font-semibold text-lg">No jobs yet</p>
            <p className="text-sm text-muted-foreground mt-1">Submit your first print job and we'll get started right away.</p>
          </div>
          <Button asChild className="gap-2">
            <Link href="/customer/jobs/new"><Plus className="h-4 w-4" />Create your first job</Link>
          </Button>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Active Jobs</h2>
              <div className="space-y-2">
                {active.map((order) => (
                  <Link key={order.id} href={`/customer/jobs/${order.id}`}>
                    <div className="group flex items-stretch border rounded-xl overflow-hidden bg-card hover:shadow-md transition-all hover:border-primary/40">
                      <div className={`w-1.5 shrink-0 ${STATUS_STRIPE[order.status] ?? 'bg-gray-300'}`} />
                      <div className="flex-1 px-4 py-3.5 flex items-center justify-between gap-3 min-w-0">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm truncate">{order.title}</span>
                            {order.priority === 'urgent' && (
                              <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                            <span>{formatDistanceToNow(new Date(order.created_at), { addSuffix: true })}</span>
                            {order.deadline && (
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                Due {new Date(order.deadline).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {order.priority && order.priority !== 'normal' && (
                            <Badge variant="outline" className={`text-xs ${PRIORITY_COLOR[order.priority] ?? ''}`}>
                              {order.priority}
                            </Badge>
                          )}
                          <Badge className={`text-xs ${STATUS_COLOR[order.status] ?? ''}`}>
                            {STATUS_LABEL[order.status] ?? order.status}
                          </Badge>
                          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {done.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Past Jobs</h2>
              <div className="space-y-2">
                {done.map((order) => (
                  <div key={order.id} className="group flex items-stretch border rounded-xl overflow-hidden bg-muted/30 hover:bg-card hover:shadow-sm transition-all">
                    <div className={`w-1.5 shrink-0 ${STATUS_STRIPE[order.status] ?? 'bg-gray-200'}`} />
                    <Link href={`/customer/jobs/${order.id}`} className="flex-1 px-4 py-3 flex items-center justify-between gap-3 min-w-0">
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-sm text-muted-foreground truncate block">{order.title}</span>
                        <span className="text-xs text-muted-foreground/70">
                          {formatDistanceToNow(new Date(order.created_at), { addSuffix: true })}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className={`text-xs ${STATUS_COLOR[order.status] ?? ''}`}>
                          {STATUS_LABEL[order.status] ?? order.status}
                        </Badge>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </Link>
                    <div className="border-l flex items-center px-3">
                      <Link
                        href={`/customer/jobs/new?from=${order.id}`}
                        className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors whitespace-nowrap py-1 px-2 rounded-lg hover:bg-primary/8"
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Reorder
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
