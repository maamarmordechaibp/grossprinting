import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { FileText } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
type InvoiceRow = { id: string; order_id: string; status: string; total: number; amount_paid: number | null; created_at: string; due_date: string | null; orders: { title: string } | null }
const INVOICE_COLOR: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  sent: 'bg-blue-100 text-blue-700',
  partial: 'bg-yellow-100 text-yellow-700',
  paid: 'bg-green-100 text-green-700',
  overdue: 'bg-red-100 text-red-700',
  cancelled: 'bg-red-50 text-red-500',
}

export default async function CustomerInvoicesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileRaw } = await supabase.from('users').select('customer_id').eq('id', user.id).single()
  const profile = profileRaw as unknown as { customer_id: string | null } | null

  const { data: rawInvoices } = await supabase
    .from('invoices')
    .select('*, orders(title)')
    .eq('customer_id', profile?.customer_id!)
    .order('created_at', { ascending: false })
  const invoices = (rawInvoices ?? []) as unknown as InvoiceRow[]

  const totalOwed = (invoices ?? [])
    .filter(i => ['sent', 'partial', 'overdue'].includes(i.status))
    .reduce((sum, i) => sum + (Number(i.total) - Number(i.amount_paid ?? 0)), 0)

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Invoices</h1>
        {totalOwed > 0 && (
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Total Outstanding</p>
            <p className="text-xl font-bold text-red-600">${totalOwed.toFixed(2)}</p>
          </div>
        )}
      </div>

      {!invoices?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">No invoices yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {invoices.map((invoice) => {
            const remaining = Number(invoice.total) - Number(invoice.amount_paid ?? 0)
            return (
              <Card key={invoice.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm">{(invoice.orders as Record<string, unknown>)?.title as string}</p>
                        <Badge className={INVOICE_COLOR[invoice.status] ?? ''}>{invoice.status}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(invoice.created_at), { addSuffix: true })}
                        {invoice.due_date && ` · Due ${new Date(invoice.due_date).toLocaleDateString()}`}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold">${Number(invoice.total).toFixed(2)}</p>
                      {remaining > 0 && remaining !== Number(invoice.total) && (
                        <p className="text-xs text-muted-foreground">${remaining.toFixed(2)} remaining</p>
                      )}
                    </div>
                  </div>
                  {Number(invoice.amount_paid) > 0 && (
                    <>
                      <Separator className="my-3" />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Paid</span>
                        <span>${Number(invoice.amount_paid).toFixed(2)}</span>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 rounded-full transition-all"
                          style={{ width: `${Math.min((Number(invoice.amount_paid) / Number(invoice.total)) * 100, 100)}%` }}
                        />
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
