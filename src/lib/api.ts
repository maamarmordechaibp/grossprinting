/**
 * Type-safe client for calling Supabase Edge Functions.
 * Always passes the current session token for auth.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
  }
}

async function call<T>(
  fn: string,
  method: string,
  params?: URLSearchParams,
  body?: unknown,
  token?: string,
): Promise<T> {
  const url = new URL(`${SUPABASE_URL}/functions/v1/${fn}`)
  if (params) params.forEach((v, k) => url.searchParams.set(k, v))

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_ANON_KEY,
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(data?.error ?? res.statusText, res.status)
  return data as T
}

// ── Token helper (browser only) ───────────────────────────────
let _token: string | null = null
export function setToken(t: string | null) {
  _token = t
}
export function getToken() {
  return _token
}

// ── Convenience wrappers ──────────────────────────────────────
export const api = {
  orders: {
    list: (p?: Record<string, string>) =>
      call<unknown[]>('orders', 'GET', new URLSearchParams(p), undefined, _token ?? undefined),
    get: (id: string) =>
      call<unknown>('orders', 'GET', new URLSearchParams({ id }), undefined, _token ?? undefined),
    create: (body: unknown) =>
      call<{ id: string }>('orders', 'POST', undefined, body, _token ?? undefined),
    update: (id: string, body: unknown) =>
      call<unknown>('orders', 'PATCH', new URLSearchParams({ id }), body, _token ?? undefined),
    cancel: (id: string) =>
      call<unknown>('orders', 'DELETE', new URLSearchParams({ id }), undefined, _token ?? undefined),
  },
  quotes: {
    byOrder: (order_id: string) =>
      call<unknown>('quotes', 'GET', new URLSearchParams({ order_id }), undefined, _token ?? undefined),
    list: () =>
      call<unknown[]>('quotes', 'GET', undefined, undefined, _token ?? undefined),
    create: (body: unknown) =>
      call<unknown>('quotes', 'POST', undefined, body, _token ?? undefined),
    decide: (id: string, status: 'approved' | 'rejected') =>
      call<unknown>('quotes', 'PATCH', new URLSearchParams({ id }), { status }, _token ?? undefined),
  },
  files: {
    signUpload: (body: unknown) =>
      call<{ signed_url: string; token: string; path: string }>(
        'files/sign-upload', 'POST', undefined, body, _token ?? undefined,
      ),
    register: (body: unknown) =>
      call<unknown>('files/register', 'POST', undefined, body, _token ?? undefined),
    list: (order_id: string) =>
      call<unknown[]>('files', 'GET', new URLSearchParams({ order_id }), undefined, _token ?? undefined),
    delete: (id: string) =>
      call<unknown>('files', 'DELETE', new URLSearchParams({ id }), undefined, _token ?? undefined),
  },
  invoices: {
    list: (p?: Record<string, string>) =>
      call<unknown[]>('invoices', 'GET', new URLSearchParams(p), undefined, _token ?? undefined),
    get: (id: string) =>
      call<unknown>('invoices', 'GET', new URLSearchParams({ id }), undefined, _token ?? undefined),
    byOrder: (order_id: string) =>
      call<unknown>('invoices', 'GET', new URLSearchParams({ order_id }), undefined, _token ?? undefined),
    create: (body: unknown) =>
      call<unknown>('invoices', 'POST', undefined, body, _token ?? undefined),
  },
  payments: {
    list: (invoice_id: string) =>
      call<unknown[]>('payments', 'GET', new URLSearchParams({ invoice_id }), undefined, _token ?? undefined),
    record: (body: unknown) =>
      call<unknown>('payments', 'POST', undefined, body, _token ?? undefined),
  },
  inventory: {
    list: () =>
      call<unknown[]>('inventory', 'GET', undefined, undefined, _token ?? undefined),
    get: (id: string) =>
      call<unknown>('inventory', 'GET', new URLSearchParams({ id }), undefined, _token ?? undefined),
    create: (body: unknown) =>
      call<unknown>('inventory', 'POST', undefined, body, _token ?? undefined),
    update: (id: string, body: unknown) =>
      call<unknown>('inventory', 'PATCH', new URLSearchParams({ id }), body, _token ?? undefined),
    movement: (body: unknown) =>
      call<unknown>('inventory/movement', 'POST', undefined, body, _token ?? undefined),
  },
}
