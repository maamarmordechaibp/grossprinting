import { createClient } from 'npm:@supabase/supabase-js@2'

/** Build a Supabase client using the caller's JWT (respects RLS) */
export function userClient(authHeader: string | null) {
  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  return createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader ?? '' } },
    auth: { persistSession: false },
  })
}

/** Build a service-role client (bypasses RLS) */
export function adminClient() {
  const url = Deno.env.get('SUPABASE_URL')!
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** Verify JWT and return the authed user; throws if invalid */
export async function requireUser(authHeader: string | null) {
  if (!authHeader) throw new Error('Missing Authorization header')
  const client = userClient(authHeader)
  const { data, error } = await client.auth.getUser()
  if (error || !data.user) throw new Error('Unauthorized')
  return data.user
}

/** Return the role stored in the JWT claims */
export function claimRole(user: { app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> }): string {
  return (
    (user.app_metadata?.['role'] as string) ??
    (user.user_metadata?.['role'] as string) ??
    'customer'
  )
}

export function isStaff(role: string) {
  return ['staff', 'manager', 'admin'].includes(role)
}

export function isAdmin(role: string) {
  return ['manager', 'admin'].includes(role)
}
