import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ArrowLeft, FileText, Plus, Mail, Phone, MapPin, Calendar, DollarSign } from 'lucide-react'
import Link from 'next/link'
import { formatDistanceToNow, format } from 'date-fns'

type Order = { id: string; title: string; status: string; priority: string; deadline: string | null; total_amount: number; is_rush: boolean; created_at: string }
type Invoice = { id: string; invoice_number: string; status: string; total: number; amount_paid: number; issue_date: string; due_date: string | null; order_id: string }
type Customer = {
  id: string
  company_name: string | null
  contact_name: string | null
  full_name: string | null
  email: string | null
  phone: string | null
  address: string | null
  notes: string | null
  created_at: string
  orders: Order[] | null
}

const STATUS_COLORS: Record<string, string> = {
  quote: 'bg-slate-100 text-slate-700 border-slate-200',
  approved: 'bg-blue-50 text-blue-700 border-blue-200',
  printing: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  finishing: 'bg-purple-50 text-purple-700 border-purple-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  delivered: 'bg-green-50 text-green-700 border-green-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
  cancelled: 'bg-zinc-100 text-zinc-600 border-zinc-200',
}

const INV_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700 border-slate-200',
  sent: 'bg-blue-50 text-blue-700 border-blue-200',
  partial: 'bg-amber-50 text-amber-700 border-amber-200',
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  overdue: 'bg-red-50 text-red-700 border-red-200',
  void: 'bg-zinc-100 text-zinc-600 border-zinc-200',
}

function fmt$(n: number) { return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) }

export default async function AdminCustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: rawCustomer } = await supabase
    .from('customers')
    .select('*, orders(id, title, status, priority, deadline, total_amount, is_rush, created_at)')
    .eq('id', id)
    .single()

  if (!rawCustomer) notFound()
  const customer = rawCustomer as unknown as Customer

  // Get all invoices for this customer's orders
  const orderIds = (customer.orders ?? []).map(o => o.id)
  const { data: rawInvoices } = orderIds.length
    ? await supabase
        .from('invoices')
        .select('id, invoice_number, status, total, amount_paid, issue_date, due_date, order_id')
        .in('order_id', orderIds)
        .order('issue_date', { ascending: false })
    : { data: [] }
  const invoices = (rawInvoices ?? []) as unknown as Invoice[]

  const orders = (customer.orders ?? []).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  const totalRevenue = invoices.reduce((s, i) => s + Number(i.amount_paid), 0)
  const totalBilled = invoices.reduce((s, i) => s + Number(i.total), 0)
  const outstanding = totalBilled - totalRevenue
  const displayName = customer.company_name ?? customer.contact_name ?? customer.full_name ?? 'Customer'

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <Button asChild variant="ghost" size="sm" className="gap-1 -ml-2">
        <Link href="/admin/customers"><ArrowLeft className="h-4 w-4" /> All customers</Link>
      </Button>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{displayName}</h1>
          {customer.contact_name && customer.company_name && (
            <p className="text-sm text-muted-foreground">{customer.contact_name}</p>
          )}
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href={`/admin/orders?customer=${customer.id}`}><FileText className="h-4 w-4" /> All orders</Link>
          </Button>
          <Button asChild size="sm" className="gap-1.5">
            <Link href={`/admin/orders?customer=${customer.id}&new=1`}><Plus className="h-4 w-4" /> New job</Link>
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">Total orders</p>
          <p className="text-2xl font-bold">{orders.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground flex items-center gap-1"><DollarSign className="h-3 w-3" />Lifetime revenue</p>
          <p className="text-2xl font-bold">{fmt$(totalRevenue)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">Total billed</p>
          <p className="text-2xl font-bold">{fmt$(totalBilled)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-xs text-muted-foreground">Outstanding</p>
          <p className={`text-2xl font-bold ${outstanding > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{fmt$(outstanding)}</p>
        </CardContent></Card>
      </div>

      {/* Contact info */}
      <Card>
        <CardHeader><CardTitle className="text-base">Contact</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {customer.email && <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" />{customer.email}</div>}
          {customer.phone && <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" />{customer.phone}</div>}
          {customer.address && <div className="flex items-start gap-2"><MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />{customer.address}</div>}
          <div className="flex items-center gap-2 text-muted-foreground"><Calendar className="h-4 w-4" />Customer since {format(new Date(customer.created_at), 'MMM d, yyyy')}</div>
          {customer.notes && (
            <>
              <Separator />
              <p className="text-muted-foreground whitespace-pre-line">{customer.notes}</p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Orders */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base">Orders ({orders.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No orders yet.</p>
          ) : (
            <div className="space-y-2">
              {orders.map(o => (
                <Link key={o.id} href={`/admin/orders/${o.id}`} className="flex items-center justify-between gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{o.title} {o.is_rush && <Badge className="ml-1 bg-red-500 hover:bg-red-500 text-xs">RUSH</Badge>}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(o.created_at), { addSuffix: true })}
                      {o.deadline && ` · due ${format(new Date(o.deadline), 'MMM d')}`}
                    </p>
                  </div>
                  <Badge variant="outline" className={STATUS_COLORS[o.status] ?? ''}>{o.status}</Badge>
                  <span className="text-sm font-semibold w-20 text-right">{fmt$(Number(o.total_amount))}</span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invoices */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Invoices ({invoices.length})</CardTitle></CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No invoices yet.</p>
          ) : (
            <div className="space-y-2">
              {invoices.map(i => (
                <div key={i.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{i.invoice_number}</p>
                    <p className="text-xs text-muted-foreground">
                      Issued {format(new Date(i.issue_date), 'MMM d, yyyy')}
                      {i.due_date && ` · due ${format(new Date(i.due_date), 'MMM d, yyyy')}`}
                    </p>
                  </div>
                  <Badge variant="outline" className={INV_COLORS[i.status] ?? ''}>{i.status}</Badge>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{fmt$(Number(i.total))}</p>
                    {Number(i.amount_paid) > 0 && Number(i.amount_paid) < Number(i.total) && (
                      <p className="text-xs text-amber-600">paid {fmt$(Number(i.amount_paid))}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
