import { cors, json, err } from '../_shared/cors.ts'
import { requireUser, adminClient, userClient } from '../_shared/auth.ts'

const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 50 * 1024 * 1024 // 50 MB

Deno.serve(async (req) => {
  const preflight = cors(req)
  if (preflight) return preflight

  const auth = req.headers.get('Authorization')

  try {
    const user = await requireUser(auth)
    const url = new URL(req.url)
    const method = req.method
    const client = userClient(auth)
    const admin = adminClient()

    // ── POST /files/sign-upload  — get a signed upload URL
    if (method === 'POST' && url.pathname.endsWith('sign-upload')) {
      const { order_id, filename, mime_type, size_bytes } = await req.json()

      if (!ALLOWED_MIME.includes(mime_type))
        return err(`File type not allowed. Allowed: ${ALLOWED_MIME.join(', ')}`, 422)
      if (size_bytes > MAX_BYTES)
        return err('File exceeds 50 MB limit', 422)

      const ext = filename.split('.').pop()
      const path = `orders/${order_id}/${crypto.randomUUID()}.${ext}`

      const { data, error } = await admin.storage
        .from('order-files')
        .createSignedUploadUrl(path)
      if (error) return err(error.message)

      return json({ signed_url: data.signedUrl, token: data.token, path })
    }

    // ── POST /files/register  — record file metadata after upload
    if (method === 'POST' && url.pathname.endsWith('register')) {
      const body = await req.json()

      const { data, error } = await client
        .from('files')
        .insert({
          order_id: body.order_id,
          uploaded_by: user.id,
          bucket: 'order-files',
          path: body.path,
          name: body.name,
          mime_type: body.mime_type,
          size_bytes: body.size_bytes,
          version: body.version ?? 1,
          label: body.label ?? null,
          is_final: body.is_final ?? false,
        })
        .select()
        .single()
      if (error) return err(error.message)
      return json(data, 201)
    }

    // ── GET /files?order_id=xxx  — list files for an order with signed read URLs
    if (method === 'GET') {
      const orderId = url.searchParams.get('order_id')
      if (!orderId) return err('order_id required')

      const { data: files, error } = await client
        .from('files')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false })
      if (error) return err(error.message)

      // Generate 5-minute signed read URLs for each file
      const withUrls = await Promise.all(
        (files ?? []).map(async (f) => {
          const { data } = await admin.storage
            .from(f.bucket)
            .createSignedUrl(f.path, 300)
          return { ...f, signed_url: data?.signedUrl ?? null }
        }),
      )

      return json(withUrls)
    }

    // ── DELETE /files?id=xxx  — delete a file record + storage object
    if (method === 'DELETE') {
      const id = url.searchParams.get('id')
      if (!id) return err('id required')

      const { data: file, error: fetchErr } = await client
        .from('files')
        .select('*')
        .eq('id', id)
        .single()
      if (fetchErr) return err(fetchErr.message, 404)
      if (file.is_final) return err('Cannot delete a final file', 422)

      await admin.storage.from(file.bucket).remove([file.path])
      await admin.from('files').delete().eq('id', id)

      return json({ success: true })
    }

    return err('Method not allowed', 405)
  } catch (e) {
    return err((e as Error).message, 401)
  }
})
