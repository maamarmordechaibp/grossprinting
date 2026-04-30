import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Get role to route correctly
  const { data: profileRaw } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()
  const profile = profileRaw as unknown as { role: string } | null

  const role = profile?.role ?? 'customer'
  if (['staff', 'manager', 'admin'].includes(role)) {
    redirect('/admin/dashboard')
  }
  redirect('/customer/dashboard')
}
