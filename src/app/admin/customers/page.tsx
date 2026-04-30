import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Users } from 'lucide-react'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'

type CustomerRow = { id: string; company_name: string | null; full_name: string | null; email: string | null; phone: string | null; created_at: string; orders: { id: string }[] | null }

export default async function AdminCustomersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: rawCustomers } = await supabase
    .from('customers')
    .select('*, orders(id)')
    .order('created_at', { ascending: false })
    .limit(50)
  const customers = (rawCustomers ?? []) as unknown as CustomerRow[]

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold">Customers</h1>

      {!customers.length ? (
        <Card><CardContent className="flex flex-col items-center py-16">
          <Users className="h-10 w-10 text-muted-foreground/40 mb-2" />
          <p className="text-muted-foreground">No customers yet.</p>
        </CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {customers.map((c) => {
            const initials = (c.company_name ?? c.full_name ?? 'U').slice(0, 2).toUpperCase()
            const orderCount = Array.isArray(c.orders) ? (c.orders as unknown[]).length : 0
            return (
              <Card key={c.id}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <Avatar>
                      <AvatarFallback>{initials}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold">{c.company_name ?? c.full_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {c.email}
                        {c.phone && ` · ${c.phone}`}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Joined {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <Badge variant="outline">{orderCount} order{orderCount !== 1 ? 's' : ''}</Badge>
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/admin/orders?customer=${c.id}`}>Orders</Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
