import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
type OrderRow = { id: string; title: string; status: string; priority: string; deadline: string | null; created_at: string; customers: { company_name: string | null; full_name: string } | null }
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
  normal: '',
  high: 'bg-orange-100 text-orange-700',
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

  let query = supabase
    .from('orders')
    .select('*, customers(company_name, full_name)')
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)
  if (search) query = query.ilike('title', `%${search}%`)

  const { data: rawOrders } = await query.limit(50)
  const orders = (rawOrders ?? []) as unknown as OrderRow[]

  const statuses = ['quote', 'approved', 'printing', 'finishing', 'completed', 'delivered', 'rejected', 'cancelled']

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Orders</h1>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <form className="flex-1 min-w-[200px]">
          <Input placeholder="Search orders…" name="search" defaultValue={search} className="max-w-sm" />
        </form>
        <div className="flex flex-wrap gap-1">
          <Button asChild variant={!status ? 'default' : 'outline'} size="sm">
            <Link href="/admin/orders">All</Link>
          </Button>
          {statuses.map(s => (
            <Button key={s} asChild variant={status === s ? 'default' : 'outline'} size="sm">
              <Link href={`/admin/orders?status=${s}`}>{s}</Link>
            </Button>
          ))}
        </div>
      </div>

      {!orders.length ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">No orders found.</CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {orders.map((order) => {
            const cust = order.customers as Record<string, unknown> | null
            return (
              <Link key={order.id} href={`/admin/orders/${order.id}`}>
                <Card className="hover:shadow-sm transition-shadow cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3 justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{order.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {(cust?.company_name ?? cust?.full_name) as string ?? 'Unknown'}
                          {' · '}{formatDistanceToNow(new Date(order.created_at), { addSuffix: true })}
                          {order.deadline && ` · Due ${new Date(order.deadline).toLocaleDateString()}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {order.priority !== 'normal' && (
                          <Badge variant="outline" className={PRIORITY_COLOR[order.priority] ?? ''}>{order.priority}</Badge>
                        )}
                        <Badge className={STATUS_COLOR[order.status] ?? ''}>{order.status}</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
