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
    const client = userClient(auth)
    const admin = adminClient()

    const { data: roleRow } = await admin.from('users').select('role').eq('id', user.id).single()
    const role = roleRow?.role ?? 'customer'

    if (!isStaff(role)) return err('Forbidden', 403)

    // ── GET /inventory  (list with low-stock flag)
    if (method === 'GET' && !id) {
      const { data, error } = await client
        .from('inventory')
        .select('*')
        .order('name')
      if (error) return err(error.message)
      const withFlag = (data ?? []).map(item => ({
        ...item,
        low_stock: item.quantity <= item.min_quantity,
      }))
      return json(withFlag)
    }

    // ── GET /inventory?id=xxx  (single + movements)
    if (method === 'GET' && id) {
      const { data, error } = await client
        .from('inventory')
        .select(`*, inventory_movements(*, users(full_name))`)
        .eq('id', id)
        .single()
      if (error) return err(error.message, 404)
      return json({ ...data, low_stock: data.quantity <= data.min_quantity })
    }

    // ── POST /inventory  (admin creates SKU)
    if (method === 'POST') {
      if (!isAdmin(role)) return err('Forbidden', 403)
      const body = await req.json()
      const { data, error } = await admin
        .from('inventory')
        .insert(body)
        .select()
        .single()
      if (error) return err(error.message)
      return json(data, 201)
    }

    // ── PATCH /inventory?id=xxx  (admin updates)
    if (method === 'PATCH' && id) {
      if (!isAdmin(role)) return err('Forbidden', 403)
      const body = await req.json()
      const { data, error } = await admin
        .from('inventory')
        .update(body)
        .eq('id', id)
        .select()
        .single()
      if (error) return err(error.message)
      return json(data)
    }

    // ── POST /inventory/movement  — record manual adjustment
    if (method === 'POST' && url.pathname.endsWith('movement')) {
      if (!isAdmin(role)) return err('Forbidden', 403)
      const body = await req.json()
      const { data, error } = await admin
        .from('inventory_movements')
        .insert({
          inventory_id: body.inventory_id,
          order_id: body.order_id ?? null,
          delta: body.delta,
          reason: body.reason ?? null,
          created_by: user.id,
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
