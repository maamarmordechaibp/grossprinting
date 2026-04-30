import { cors, json, err } from '../_shared/cors.ts'
import { requireUser, adminClient, userClient, isStaff, isAdmin } from '../_shared/auth.ts'

Deno.serve(async (req) => {
  const preflight = cors(req)
  if (preflight) return preflight

  const auth = req.headers.get('Authorization')

  try {
    const user = await requireUser(auth)
    const url = new URL(req.url)
    const method = req.method
    const id = url.searchParams.get('id')
    const orderId = url.searchParams.get('order_id')
    const client = userClient(auth)
    const admin = adminClient()

    const { data: roleRow } = await admin.from('users').select('role').eq('id', user.id).single()
    const role = roleRow?.role ?? 'customer'

    // ── GET /invoices?id=xxx
    if (method === 'GET' && id) {
      const { data, error } = await client
        .from('invoices')
        .select(`*, orders(title, customers(contact_name, email)), payments(*)`)
        .eq('id', id)
        .single()
      if (error) return err(error.message, 404)
      return json(data)
    }

    // ── GET /invoices?order_id=xxx
    if (method === 'GET' && orderId) {
      const { data, error } = await client
        .from('invoices')
        .select(`*, payments(*)`)
        .eq('order_id', orderId)
        .single()
      if (error) return err(error.message, 404)
      return json(data)
    }

    // ── GET /invoices  (list)
    if (method === 'GET') {
      const status = url.searchParams.get('status')
      let q = client
        .from('invoices')
        .select(`*, orders(title, customers(contact_name))`)
        .order('created_at', { ascending: false })
      if (status) q = q.eq('status', status)
      const { data, error } = await q
      if (error) return err(error.message)
      return json(data)
    }

    // ── POST /invoices  (staff creates invoice from approved order)
    if (method === 'POST') {
      if (!isStaff(role)) return err('Forbidden', 403)
      const body = await req.json()

      // Check order exists and is approved
      const { data: order } = await admin
        .from('orders')
        .select('id, status, total_amount')
        .eq('id', body.order_id)
        .single()
      if (!order) return err('Order not found', 404)
      if (!['approved', 'printing', 'finishing', 'completed', 'delivered'].includes(order.status))
        return err('Order must be approved before invoicing', 422)

      const subtotal = body.subtotal ?? order.total_amount ?? 0
      const tax = body.tax ?? 0
      const total = body.total ?? subtotal + tax

      const { data, error } = await admin
        .from('invoices')
        .insert({
          order_id: body.order_id,
          issue_date: body.issue_date ?? new Date().toISOString().split('T')[0],
          due_date: body.due_date ?? null,
          subtotal,
          tax,
          total,
          status: 'sent',
        })
        .select()
        .single()
      if (error) return err(error.message)
      return json(data, 201)
    }

    // ── PATCH /invoices?id=xxx  (admin updates)
    if (method === 'PATCH' && id) {
      if (!isAdmin(role)) return err('Forbidden', 403)
      const body = await req.json()
      const { data, error } = await admin
        .from('invoices')
        .update(body)
        .eq('id', id)
        .select()
        .single()
      if (error) return err(error.message)
      return json(data)
    }

    return err('Method not allowed', 405)
  } catch (e) {
    return err((e as Error).message, 401)
  }
})
