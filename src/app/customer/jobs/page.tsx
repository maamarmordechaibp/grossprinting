import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'
import { Plus, Briefcase } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

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

const PRIORITY_COLOR: Record<string, string> = {
  low: 'bg-gray-100 text-gray-600',
  normal: 'bg-blue-50 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
}

export default async function CustomerJobsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileRaw } = await supabase.from('users').select('customer_id').eq('id', user.id).single()
  const profile = profileRaw as unknown as { customer_id: string | null } | null
  const { data: rawOrders } = await supabase
    .from('orders')
    .select('*')
    .eq('customer_id', profile?.customer_id!)
    .order('created_at', { ascending: false })
  type OrderRow = { id: string; title: string; description: string | null; status: string; priority: string; created_at: string; deadline: string | null }
  const orders = (rawOrders ?? []) as unknown as OrderRow[]

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My Jobs</h1>
        <Button asChild className="gap-2">
          <Link href="/customer/jobs/new">
            <Plus className="h-4 w-4" /> New Job
          </Link>
        </Button>
      </div>

      {!orders.length ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-center">
            <Briefcase className="h-12 w-12 text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">No jobs yet.</p>
            <Button asChild className="mt-4 gap-2">
              <Link href="/customer/jobs/new"><Plus className="h-4 w-4" /> Create your first job</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {orders.map((order) => (
            <Link key={order.id} href={`/customer/jobs/${order.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{order.title}</p>
                      {order.description && (
                        <p className="text-sm text-muted-foreground truncate mt-0.5">{order.description}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(order.created_at), { addSuffix: true })}
                        {order.deadline && ` · Due ${new Date(order.deadline).toLocaleDateString()}`}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <Badge className={STATUS_COLOR[order.status] ?? ''}>{order.status}</Badge>
                      {order.priority !== 'normal' && (
                        <Badge variant="outline" className={PRIORITY_COLOR[order.priority] ?? ''}>{order.priority}</Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
