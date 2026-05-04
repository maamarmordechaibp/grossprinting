import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/invoices/export-qbo
 * Returns a QuickBooks Online–compatible CSV of all invoices.
 * Columns match QBO Import Data → Invoices template.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: prof } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (!prof || !['admin', 'manager', 'staff'].includes((prof as { role: string }).role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: rawRows } = await supabase
    .from('invoice_export')
    .select('*')
    .order('issue_date', { ascending: false })

  type Row = {
    invoice_id: string
    invoice_number: string
    issue_date: string
    due_date: string | null
    invoice_status: string
    invoice_total: number
    amount_paid: number
    customer_name: string | null
    customer_email: string | null
    customer_phone: string | null
    customer_address: string | null
    order_title: string | null
    is_rush: boolean | null
  }
  const rows = (rawRows ?? []) as unknown as Row[]

  const headers = [
    'InvoiceNo',
    'Customer',
    'InvoiceDate',
    'DueDate',
    'Terms',
    'Memo',
    'Item(Product/Service)',
    'ItemDescription',
    'ItemQuantity',
    'ItemRate',
    'ItemAmount',
    'TaxableItem',
    'TaxRate',
    'EmailAddress',
    'BillingAddress',
    'Status',
    'Currency',
  ]

  function csvEscape(v: unknown): string {
    if (v === null || v === undefined) return ''
    const s = String(v)
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }

  const lines = [headers.join(',')]
  for (const r of rows) {
    const memo = r.is_rush ? 'RUSH order' : ''
    const description = r.order_title ?? ''
    const amount = Number(r.invoice_total).toFixed(2)
    const status = r.invoice_status === 'paid' ? 'Paid' : r.invoice_status === 'sent' ? 'Open' : 'Draft'
    lines.push([
      r.invoice_number,
      r.customer_name ?? '',
      r.issue_date,
      r.due_date ?? '',
      'Net 30',
      memo,
      'Printing Services',
      description,
      '1',
      amount,
      amount,
      'No',
      '0',
      r.customer_email ?? '',
      r.customer_address ?? '',
      status,
      'USD',
    ].map(csvEscape).join(','))
  }

  const csv = lines.join('\n')
  const today = new Date().toISOString().slice(0, 10)
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="invoices-qbo-${today}.csv"`,
    },
  })
}
