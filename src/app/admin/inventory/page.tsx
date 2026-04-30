import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Package } from 'lucide-react'

type InventoryRow = { id: string; name: string; sku: string | null; quantity: number; min_quantity: number | null; unit: string; category: string; supplier: string | null }

const CATEGORY_COLOR: Record<string, string> = {
  ink: 'bg-blue-100 text-blue-700',
  paper: 'bg-green-100 text-green-700',
  substrate: 'bg-purple-100 text-purple-700',
  finishing_material: 'bg-yellow-100 text-yellow-700',
  chemical: 'bg-red-100 text-red-700',
  equipment: 'bg-gray-100 text-gray-600',
  packaging: 'bg-orange-100 text-orange-700',
  other: 'bg-gray-50 text-gray-500',
}

export default async function AdminInventoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: rawItems } = await supabase
    .from('inventory')
    .select('*')
    .order('category')
    .order('name')
  const items = (rawItems ?? []) as unknown as InventoryRow[]
  const lowStock = items.filter(i => i.quantity <= (i.min_quantity ?? 0))

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Inventory</h1>
        {lowStock.length > 0 && (
          <Badge variant="destructive">{lowStock.length} low stock</Badge>
        )}
      </div>

      {!items.length ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <Package className="h-10 w-10 mx-auto mb-2 opacity-40" />
          No inventory items.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const max = Math.max(item.quantity, item.min_quantity ?? 1) * 1.5
            const pct = Math.min((item.quantity / max) * 100, 100)
            const isLow = item.quantity <= (item.min_quantity ?? 0)
            return (
              <Card key={item.id} className={isLow ? 'border-red-200' : ''}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">{item.name}</p>
                        {item.sku && <span className="text-xs text-muted-foreground">{item.sku}</span>}
                        {isLow && <Badge variant="destructive" className="text-xs">Low</Badge>}
                      </div>
                      {item.supplier && <p className="text-xs text-muted-foreground">{item.supplier}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge className={CATEGORY_COLOR[item.category] ?? ''}>{item.category}</Badge>
                      <span className="font-bold text-sm whitespace-nowrap">
                        {item.quantity} {item.unit}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Progress value={pct} className={`h-1.5 ${isLow ? '[&>div]:bg-red-500' : ''}`} />
                    {item.min_quantity != null && (
                      <p className="text-xs text-muted-foreground">Min: {item.min_quantity} {item.unit}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
