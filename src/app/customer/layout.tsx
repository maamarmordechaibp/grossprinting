import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/app-shell'
import { LayoutDashboard, Briefcase, FileText } from 'lucide-react'

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileRaw } = await supabase
    .from('users')
    .select('role, full_name')
    .eq('id', user.id)
    .single()
  const profile = profileRaw as unknown as { role: string; full_name: string | null } | null

  if (profile?.role && ['staff', 'manager', 'admin'].includes(profile.role)) {
    redirect('/admin/dashboard')
  }

  const navItems = [
    { href: '/customer/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
    { href: '/customer/jobs', label: 'My Jobs', icon: <Briefcase className="h-4 w-4" /> },
    { href: '/customer/invoices', label: 'Invoices', icon: <FileText className="h-4 w-4" /> },
  ]

  return (
    <AppShell navItems={navItems} userEmail={user.email ?? ''} userName={profile?.full_name ?? undefined}>
      {children}
    </AppShell>
  )
}
