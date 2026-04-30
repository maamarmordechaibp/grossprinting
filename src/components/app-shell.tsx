'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Menu, Printer, LogOut, User } from 'lucide-react'

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
}

interface ShellProps {
  children: React.ReactNode
  navItems: NavItem[]
  userEmail: string
  userName?: string
}

function NavLinks({ items, pathname }: { items: NavItem[]; pathname: string }) {
  return (
    <nav className="flex flex-col gap-1 p-2">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
            pathname === item.href || pathname.startsWith(item.href + '/')
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
          )}
        >
          {item.icon}
          {item.label}
        </Link>
      ))}
    </nav>
  )
}

export function AppShell({ children, navItems, userEmail, userName }: ShellProps) {
  const pathname = usePathname()
  const router = useRouter()
  const initials = (userName ?? userEmail).slice(0, 2).toUpperCase()

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    toast.success('Signed out')
    router.push('/login')
    router.refresh()
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 p-4 border-b">
        <Printer className="h-5 w-5 text-primary" />
        <span className="font-semibold text-sm">Gross Printing</span>
      </div>
      <div className="flex-1 overflow-auto">
        <NavLinks items={navItems} pathname={pathname} />
      </div>
    </div>
  )

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 flex-col border-r bg-card">
        {sidebar}
      </aside>

      <div className="flex flex-1 flex-col">
        {/* Top bar */}
        <header className="flex h-14 items-center justify-between border-b bg-card px-4 gap-4">
          {/* Mobile menu */}
          <Sheet>
            <SheetTrigger className="md:hidden" render={
              <button className="inline-flex items-center justify-center rounded-md h-8 w-8 hover:bg-accent transition-colors">
                <Menu className="h-5 w-5" />
              </button>
            } />
            <SheetContent side="left" className="w-56 p-0">
              {sidebar}
            </SheetContent>
          </Sheet>

          <div className="flex items-center gap-2 md:hidden">
            <Printer className="h-5 w-5 text-primary" />
            <span className="font-semibold text-sm">Gross Printing</span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-accent transition-colors">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                  </Avatar>
                  <span className="hidden sm:block text-sm text-muted-foreground">{userEmail}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem disabled>
                  <User className="mr-2 h-4 w-4" />
                  {userName ?? userEmail}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={signOut} className="text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
