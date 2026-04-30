import { cors, json, err } from '../_shared/cors.ts'
import { requireUser, adminClient, userClient, isStaff } from '../_shared/auth.ts'

Deno.serve(async (req) => {
  const preflight = cors(req)
  if (preflight) return preflight

  const auth = req.headers.get('Authorization')

  try {
    const user = await requireUser(auth)
    const url = new URL(req.url)
    const method = req.method
    const invoiceId = url.searchParams.get('invoice_id')
    const client = userClient(auth)
    const admin = adminClient()

    const { data: roleRow } = await admin.from('users').select('role').eq('id', user.id).single()
    const role = roleRow?.role ?? 'customer'

    // ── GET /payments?invoice_id=xxx
    if (method === 'GET' && invoiceId) {
      const { data, error } = await client
        .from('payments')
        .select('*')
        .eq('invoice_id', invoiceId)
        .order('paid_at', { ascending: false })
      if (error) return err(error.message)
      return json(data)
    }

    // ── POST /payments  (staff records a payment)
    if (method === 'POST') {
      if (!isStaff(role)) return err('Forbidden', 403)
      const body = await req.json()

      if (!['cash', 'bank_transfer', 'card_manual'].includes(body.method ?? '')) {
        return err('Use the Stripe webhook for stripe payments', 422)
      }

      const { data, error } = await admin
        .from('payments')
        .insert({
          invoice_id: body.invoice_id,
          amount: body.amount,
          method: body.method,
          reference: body.reference ?? null,
          paid_at: body.paid_at ?? new Date().toISOString(),
          recorded_by: user.id,
        })
        .select()
        .single()
      if (error) return err(error.message)
      return json(data, 201)
    }

    return err('Method not allowed', 405)
  } catch (e) {
    return err((e as Error).message, 401)
  }
})
