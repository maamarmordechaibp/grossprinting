'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Menu, Printer, LogOut, ChevronRight } from 'lucide-react'

export interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
  section?: string   // if set, a divider + section label renders before this item
}

interface ShellProps {
  children: React.ReactNode
  navItems: NavItem[]
  userEmail: string
  userName?: string
  userRole?: string
}

const ROLE_LABEL: Record<string, { label: string; color: string }> = {
  admin:    { label: 'Admin',    color: 'bg-violet-100 text-violet-700' },
  manager:  { label: 'Manager',  color: 'bg-blue-100 text-blue-700' },
  staff:    { label: 'Staff',    color: 'bg-sky-100 text-sky-700' },
  customer: { label: 'Customer', color: 'bg-emerald-100 text-emerald-700' },
}

function NavLinks({ items, pathname }: { items: NavItem[]; pathname: string }) {
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
      {items.map((item, i) => {
        const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
        const showSection = !!item.section && (i === 0 || items[i - 1].section !== item.section)
        return (
          <div key={item.href}>
            {showSection && (
              <div className="pt-4 pb-1 px-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 select-none">
                  {item.section}
                </p>
              </div>
            )}
            <Link
              href={item.href}
              className={cn(
                'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 relative',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-primary" />
              )}
              <span className={cn(
                'flex items-center justify-center h-7 w-7 rounded-md shrink-0 transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground/70 group-hover:text-foreground',
              )}>
                {item.icon}
              </span>
              <span className="flex-1 truncate">{item.label}</span>
              {isActive && <ChevronRight className="h-3.5 w-3.5 opacity-60 shrink-0" />}
            </Link>
          </div>
        )
      })}
    </nav>
  )
}

function SidebarContent({
  navItems, pathname, userEmail, userName, userRole, onSignOut,
}: {
  navItems: NavItem[]; pathname: string; userEmail: string; userName?: string; userRole?: string;
  onSignOut: () => void;
}) {
  const initials = (userName ?? userEmail).slice(0, 2).toUpperCase()
  const roleInfo = ROLE_LABEL[userRole ?? 'customer']

  return (
    <div className="flex h-full flex-col bg-[var(--sidebar)]">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-[var(--sidebar-border)]">
        <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shadow-sm shrink-0">
          <Printer className="h-4.5 w-4.5 text-white" style={{ height: '18px', width: '18px' }} />
        </div>
        <div className="min-w-0">
          <p className="font-bold text-sm leading-tight text-foreground tracking-tight">Gross Printing</p>
          <p className="text-[10px] text-muted-foreground leading-tight">Management Portal</p>
        </div>
      </div>

      {/* Nav */}
      <NavLinks items={navItems} pathname={pathname} />

      {/* User card */}
      <div className="border-t border-[var(--sidebar-border)] p-3">
        <div className="flex items-center gap-3 rounded-lg px-3 py-2.5 bg-accent/60 group">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="text-xs font-semibold bg-primary/15 text-primary">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-tight truncate">{userName ?? userEmail.split('@')[0]}</p>
            <p className="text-[11px] text-muted-foreground truncate leading-tight">{userEmail}</p>
          </div>
          {roleInfo && (
            <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0', roleInfo.color)}>
              {roleInfo.label}
            </span>
          )}
        </div>
        <button
          onClick={onSignOut}
          className="mt-1.5 w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/8 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </div>
  )
}

export function AppShell({ children, navItems, userEmail, userName, userRole }: ShellProps) {
  const pathname = usePathname()
  const router = useRouter()

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    toast.success('Signed out')
    router.push('/login')
    router.refresh()
  }

  const sidebarProps = { navItems, pathname, userEmail, userName, userRole, onSignOut: signOut }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 flex-col shrink-0 border-r border-[var(--sidebar-border)] sticky top-0 h-screen">
        <SidebarContent {...sidebarProps} />
      </aside>

      <div className="flex flex-1 flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden flex h-14 items-center justify-between border-b bg-[var(--sidebar)] px-4 gap-4 sticky top-0 z-40">
          <Sheet>
            <SheetTrigger render={
              <button className="inline-flex items-center justify-center rounded-lg h-9 w-9 hover:bg-accent transition-colors text-muted-foreground">
                <Menu className="h-5 w-5" />
              </button>
            } />
            <SheetContent side="left" className="w-60 p-0 border-r border-[var(--sidebar-border)]">
              <SidebarContent {...sidebarProps} />
            </SheetContent>
          </Sheet>

          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center">
              <Printer className="text-white" style={{ height: '15px', width: '15px' }} />
            </div>
            <span className="font-bold text-sm">Gross Printing</span>
          </div>

          <div className="w-9" /> {/* spacer */}
        </header>

        {/* Page content */}
        <main className="flex-1 p-5 md:p-7 overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  )
}