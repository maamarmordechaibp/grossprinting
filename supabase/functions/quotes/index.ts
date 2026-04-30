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
    const id = url.searchParams.get('id')
    const orderId = url.searchParams.get('order_id')
    const client = userClient(auth)
    const admin = adminClient()

    // ── GET /quotes?order_id=xxx  (by order)
    if (method === 'GET' && orderId) {
      const { data, error } = await client
        .from('quotes')
        .select('*')
        .eq('order_id', orderId)
        .single()
      if (error) return err(error.message, 404)
      return json(data)
    }

    // ── GET /quotes  (list for staff)
    if (method === 'GET') {
      const { data, error } = await client
        .from('quotes')
        .select(`*, orders(title, customers(contact_name))`)
        .order('created_at', { ascending: false })
      if (error) return err(error.message)
      return json(data)
    }

    // ── POST /quotes  (staff creates quote for an order)
    if (method === 'POST') {
      const { data: roleRow } = await admin.from('users').select('role').eq('id', user.id).single()
      if (!isStaff(roleRow?.role ?? '')) return err('Forbidden', 403)

      const body = await req.json()
      const { data, error } = await admin
        .from('quotes')
        .insert({
          order_id: body.order_id,
          subtotal: body.subtotal,
          tax: body.tax ?? 0,
          total: body.total,
          valid_until: body.valid_until ?? null,
          status: 'sent',
        })
        .select()
        .single()
      if (error) return err(error.message)

      // Update order total
      await admin.from('orders').update({ total_amount: body.total }).eq('id', body.order_id)

      return json(data, 201)
    }

    // ── PATCH /quotes?id=xxx  (customer approves/rejects OR staff edits)
    if (method === 'PATCH' && id) {
      const body = await req.json()

      // Customer approve/reject — use RLS client (policy enforces allowed transitions)
      const { data, error } = await client
        .from('quotes')
        .update({
          ...body,
          decided_at: new Date().toISOString(),
          decided_by: user.id,
        })
        .eq('id', id)
        .select()
        .single()
      if (error) return err(error.message)

      // If approved, move order to approved status
      if (body.status === 'approved') {
        await admin.from('orders').update({ status: 'approved' }).eq('id', data.order_id)
      } else if (body.status === 'rejected') {
        await admin.from('orders').update({ status: 'rejected' }).eq('id', data.order_id)
      }

      return json(data)
    }

    return err('Method not allowed', 405)
  } catch (e) {
    return err((e as Error).message, 401)
  }
})
