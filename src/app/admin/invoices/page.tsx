import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { Download } from 'lucide-react'

type InvoiceRow = { id: string; order_id: string; status: string; total: number; amount_paid: number | null; created_at: string; due_date: string | null; orders: { title: string } | null; customers: { company_name: string | null; full_name: string | null } | null }

const INVOICE_COLOR: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  sent: 'bg-blue-100 text-blue-700',
  partial: 'bg-yellow-100 text-yellow-700',
  paid: 'bg-green-100 text-green-700',
  overdue: 'bg-red-100 text-red-700',
  cancelled: 'bg-red-50 text-red-500',
}

export default async function AdminInvoicesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: rawInvoices } = await supabase
    .from('invoices')
    .select('*, orders(title), customers(company_name, full_name)')
    .order('created_at', { ascending: false })
    .limit(50)
  const invoices = (rawInvoices ?? []) as unknown as InvoiceRow[]

  const totalOutstanding = (invoices ?? [])
    .filter(i => ['sent', 'partial', 'overdue'].includes(i.status))
    .reduce((sum, i) => sum + (Number(i.total) - Number(i.amount_paid ?? 0)), 0)

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Invoices</h1>
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <a href="/api/invoices/export-qbo"><Download className="h-4 w-4" /> Export to QuickBooks</a>
          </Button>
          {totalOutstanding > 0 && (
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Total Outstanding</p>
              <p className="text-lg font-bold text-red-600">${totalOutstanding.toFixed(2)}</p>
            </div>
          )}
        </div>
      </div>

      {!invoices.length ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No invoices yet.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {invoices.map((inv) => {
            const order = inv.orders as Record<string, unknown> | null
            const cust = inv.customers as Record<string, unknown> | null
            const remaining = Number(inv.total) - Number(inv.amount_paid ?? 0)
            return (
              <Card key={inv.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{order?.title as string}</p>
                      <p className="text-sm text-muted-foreground">
                        {(cust?.company_name ?? cust?.full_name) as string ?? 'Unknown'}
                        {' · '}{formatDistanceToNow(new Date(inv.created_at), { addSuffix: true })}
                        {inv.due_date && ` · Due ${new Date(inv.due_date).toLocaleDateString()}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <Badge className={INVOICE_COLOR[inv.status] ?? ''}>{inv.status}</Badge>
                      <div className="text-right">
                        <p className="font-bold">${Number(inv.total).toFixed(2)}</p>
                        {remaining > 0 && remaining < Number(inv.total) && (
                          <p className="text-xs text-red-600">${remaining.toFixed(2)} due</p>
                        )}
                      </div>
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/admin/orders/${inv.order_id}`}>View</Link>
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
