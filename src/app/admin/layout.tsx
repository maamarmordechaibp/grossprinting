import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/app-shell'
import {
  LayoutDashboard, Briefcase, Kanban, Users,
  Package, FileText, Quote, Receipt,
} from 'lucide-react'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileRaw } = await supabase
    .from('users')
    .select('role, full_name')
    .eq('id', user.id)
    .single()
  const profile = profileRaw as unknown as { role: string; full_name: string | null } | null

  if (!profile || !['staff', 'manager', 'admin'].includes(profile.role)) {
    redirect('/customer/dashboard')
  }

  const navItems = [
    { href: '/admin/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
    { href: '/admin/orders', label: 'Orders', icon: <Briefcase className="h-4 w-4" /> },
    { href: '/admin/kanban', label: 'Kanban', icon: <Kanban className="h-4 w-4" /> },
    { href: '/admin/quotes', label: 'Quotes', icon: <Quote className="h-4 w-4" /> },
    { href: '/admin/customers', label: 'Customers', icon: <Users className="h-4 w-4" /> },
    { href: '/admin/invoices', label: 'Invoices', icon: <Receipt className="h-4 w-4" /> },
    { href: '/admin/inventory', label: 'Inventory', icon: <Package className="h-4 w-4" /> },
  ]

  return (
    <AppShell navItems={navItems} userEmail={user.email ?? ''} userName={profile?.full_name ?? undefined}>
      {children}
    </AppShell>
  )
}
