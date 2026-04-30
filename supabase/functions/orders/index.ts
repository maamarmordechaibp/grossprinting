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
    const client = userClient(auth)
    const admin = adminClient()

    // ── GET /orders?id=xxx  (single)
    if (method === 'GET' && id) {
      const { data, error } = await client
        .from('orders')
        .select(`*, order_items(*), order_status_history(*), files(*), quotes(*), invoices(*), customers(*)`)
        .eq('id', id)
        .single()
      if (error) return err(error.message, 404)
      return json(data)
    }

    // ── GET /orders  (list with filters)
    if (method === 'GET') {
      let q = client
        .from('orders')
        .select(`*, customers(contact_name, company_name, email), order_items(*)`)
        .order('created_at', { ascending: false })

      const status = url.searchParams.get('status')
      const stage = url.searchParams.get('stage')
      const priority = url.searchParams.get('priority')
      const customerId = url.searchParams.get('customer_id')
      const limit = parseInt(url.searchParams.get('limit') ?? '50')
      const offset = parseInt(url.searchParams.get('offset') ?? '0')

      if (status) q = q.eq('status', status)
      if (stage) q = q.eq('production_stage', stage)
      if (priority) q = q.eq('priority', priority)
      if (customerId) q = q.eq('customer_id', customerId)
      q = q.range(offset, offset + limit - 1)

      const { data, error } = await q
      if (error) return err(error.message)
      return json(data)
    }

    // ── POST /orders  (create via RPC for atomicity)
    if (method === 'POST') {
      const body = await req.json()
      const { data, error } = await client.rpc('create_order_with_items', {
        p_customer_id: body.customer_id,
        p_title: body.title,
        p_description: body.description ?? null,
        p_priority: body.priority ?? 'normal',
        p_deadline: body.deadline ?? null,
        p_notes: body.notes ?? null,
        p_items: JSON.stringify(body.items ?? []),
        p_file_paths: JSON.stringify(body.file_paths ?? []),
      })
      if (error) return err(error.message)
      return json({ id: data }, 201)
    }

    // ── PATCH /orders?id=xxx  (update status / fields)
    if (method === 'PATCH' && id) {
      const body = await req.json()
      const { data, error } = await client
        .from('orders')
        .update(body)
        .eq('id', id)
        .select()
        .single()
      if (error) return err(error.message)
      return json(data)
    }

    // ── DELETE /orders?id=xxx  (admin only soft-cancel)
    if (method === 'DELETE' && id) {
      const { data: roleRow } = await admin
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single()
      if (!isStaff(roleRow?.role ?? '')) return err('Forbidden', 403)

      const { error } = await client
        .from('orders')
        .update({ status: 'cancelled' })
        .eq('id', id)
      if (error) return err(error.message)
      return json({ success: true })
    }

    return err('Method not allowed', 405)
  } catch (e) {
    return err((e as Error).message, 401)
  }
})
