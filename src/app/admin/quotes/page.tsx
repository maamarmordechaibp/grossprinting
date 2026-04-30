import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
type QuoteRow = { id: string; order_id: string; total: number; status: string; created_at: string; orders: { title: string; customers: { company_name: string | null; full_name: string } | null } | null }
const QUOTE_COLOR: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  sent: 'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}

export default async function AdminQuotesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: rawQuotes } = await supabase
    .from('quotes')
    .select('*, orders(title, customers(company_name, full_name))')
    .order('created_at', { ascending: false })
    .limit(50)
  const quotes = (rawQuotes ?? []) as unknown as QuoteRow[]

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold">Quotes</h1>
      {!quotes.length ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No quotes yet.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {quotes.map((q) => {
            const order = q.orders as Record<string, unknown> | null
            const cust = (order?.customers as Record<string, unknown> | null)
            return (
              <Card key={q.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{order?.title as string}</p>
                      <p className="text-sm text-muted-foreground">
                        {(cust?.company_name ?? cust?.full_name) as string ?? 'Unknown'}
                        {' · '}{formatDistanceToNow(new Date(q.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <Badge className={QUOTE_COLOR[q.status] ?? ''}>{q.status}</Badge>
                      <span className="font-bold">${Number(q.total).toFixed(2)}</span>
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/admin/orders/${q.order_id}`}>View</Link>
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
