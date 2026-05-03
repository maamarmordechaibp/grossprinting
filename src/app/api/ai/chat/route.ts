import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const SYSTEM_PROMPT = `You are an intelligent operations assistant for Gross Printing, a professional printing business.
You help staff and managers with:
- Checking order status and production pipeline
- Identifying bottlenecks, risks, and overdue jobs
- Finding customer information
- Reviewing inventory levels
- Analysing quotes and invoices
- Summarising daily/weekly production

Always be concise, direct, and actionable. Use bullet points for lists.
When showing data, reference order titles, customer names, and amounts.
When asked about "today's production", "what needs attention", or similar summaries, use the available tools to gather live data first.`

const tools: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'search_orders',
      description: 'Search and filter orders by status, priority, or title keyword.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', description: 'Filter by status: quote, approved, printing, finishing, completed, delivered, rejected, cancelled' },
          priority: { type: 'string', description: 'Filter by priority: low, normal, high, urgent' },
          search: { type: 'string', description: 'Search order titles by keyword' },
          limit: { type: 'number', description: 'Max results (default 10)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_order_detail',
      description: 'Get full details of a specific order including status history and quote.',
      parameters: {
        type: 'object',
        required: ['order_id'],
        properties: {
          order_id: { type: 'string', description: 'UUID of the order' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_production_stats',
      description: 'Get live production pipeline stats: orders per stage, bottleneck, overdue and urgent orders.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_inventory_status',
      description: 'Get inventory levels, optionally filtered to only low-stock items.',
      parameters: {
        type: 'object',
        properties: {
          low_stock_only: { type: 'boolean', description: 'Return only items at or below minimum quantity' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_quotes',
      description: 'Get quotes list with optional status filter.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', description: 'draft | sent | approved | rejected | expired' },
          limit: { type: 'number', description: 'Max results (default 10)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_revenue_summary',
      description: 'Get payment/revenue totals for today, this week, and this month.',
      parameters: { type: 'object', properties: {} },
    },
  },
]

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

async function executeTool(name: string, args: Record<string, unknown>, db: SupabaseClient): Promise<string> {
  if (name === 'search_orders') {
    let q = db
      .from('orders')
      .select('id, title, status, priority, deadline, total_amount, created_at, customers(company_name, full_name)')
      .order('created_at', { ascending: false })
      .limit(Math.min(Number(args.limit ?? 10), 20))
    if (args.status)   q = q.eq('status',   args.status as string)
    if (args.priority) q = q.eq('priority', args.priority as string)
    if (args.search)   q = q.ilike('title', `%${args.search}%`)
    const { data } = await q
    return JSON.stringify(data ?? [])
  }

  if (name === 'get_order_detail') {
    const { data } = await db
      .from('orders')
      .select('*, customers(*), order_items(*), order_status_history(to_status, from_status, changed_at, note), quotes(subtotal, tax, total, status, valid_until)')
      .eq('id', args.order_id as string)
      .single()
    return JSON.stringify(data ?? null)
  }

  if (name === 'get_production_stats') {
    const now = new Date()
    const { data: orders } = await db
      .from('orders')
      .select('id, title, status, production_stage, priority, deadline, total_amount')
      .not('status', 'in', '(delivered,cancelled,rejected)')
    const all = (orders ?? []) as Array<{ id: string; title: string; status: string; production_stage: string | null; priority: string; deadline: string | null; total_amount: number }>
    const inProd = all.filter(o => !['quote', 'completed'].includes(o.status))
    const stageCounts: Record<string, number> = {}
    for (const o of inProd) {
      const s = o.production_stage ?? 'pending'
      stageCounts[s] = (stageCounts[s] ?? 0) + 1
    }
    const sorted = Object.entries(stageCounts).sort((a, b) => b[1] - a[1])
    const overdue = all.filter(o => o.deadline && new Date(o.deadline) < now && o.status !== 'completed')
    const urgent  = all.filter(o => o.priority === 'urgent' && o.status !== 'completed')
    return JSON.stringify({
      active_orders:      all.length,
      in_production:      inProd.length,
      stage_distribution: stageCounts,
      bottleneck:         sorted[0] ? { stage: sorted[0][0], count: sorted[0][1] } : null,
      overdue_orders:     overdue.map(o => ({ id: o.id, title: o.title, deadline: o.deadline, status: o.status })),
      urgent_orders:      urgent.map(o => ({ id: o.id, title: o.title, status: o.status })),
    })
  }

  if (name === 'get_inventory_status') {
    const { data } = await db
      .from('inventory')
      .select('sku, name, quantity, min_quantity, unit, category')
      .order('name')
    const items = (data ?? []) as Array<{ sku: string; name: string; quantity: number; min_quantity: number | null; unit: string; category: string }>
    const result = args.low_stock_only
      ? items.filter(i => i.quantity <= (i.min_quantity ?? 0))
      : items
    return JSON.stringify(result.map(i => ({ ...i, is_low: i.quantity <= (i.min_quantity ?? 0) })))
  }

  if (name === 'get_quotes') {
    let q = db
      .from('quotes')
      .select('id, order_id, subtotal, tax, total, status, valid_until, created_at, orders(title, customers(company_name, full_name))')
      .order('created_at', { ascending: false })
      .limit(Math.min(Number(args.limit ?? 10), 20))
    if (args.status) q = q.eq('status', args.status as string)
    const { data } = await q
    return JSON.stringify(data ?? [])
  }

  if (name === 'get_revenue_summary') {
    const now = new Date()
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
    const monday = new Date(now)
    monday.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1))
    monday.setHours(0, 0, 0, 0)
    const monthStart = new Date(now); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)
    const { data } = await db.from('payments').select('amount, paid_at').gte('paid_at', monthStart.toISOString())
    const pmts = (data ?? []) as Array<{ amount: number; paid_at: string }>
    return JSON.stringify({
      today:         pmts.filter(p => new Date(p.paid_at) >= todayStart).reduce((s, p) => s + Number(p.amount), 0),
      this_week:     pmts.filter(p => new Date(p.paid_at) >= monday).reduce((s, p) => s + Number(p.amount), 0),
      this_month:    pmts.reduce((s, p) => s + Number(p.amount), 0),
      payment_count: pmts.length,
    })
  }

  return JSON.stringify({ error: `Unknown tool: ${name}` })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify admin/staff role
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  const role = (profile as { role?: string } | null)?.role
  if (!role || !['staff', 'manager', 'admin'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json() as { messages?: OpenAI.Chat.ChatCompletionMessageParam[] }
  if (!Array.isArray(body.messages)) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const history: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...body.messages.slice(-14),
  ]

  // Agentic loop — max 4 iterations to handle multi-step tool calls
  for (let i = 0; i < 4; i++) {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: history,
      tools,
      tool_choice: 'auto',
      temperature: 0.3,
    })

    const msg = completion.choices[0].message
    history.push(msg as OpenAI.Chat.ChatCompletionMessageParam)

    if (!msg.tool_calls?.length) {
      return NextResponse.json({ content: msg.content ?? '' })
    }

    const results = await Promise.all(
      msg.tool_calls.map(async (tc) => {
        if (tc.type !== 'function') {
          return { role: 'tool' as const, tool_call_id: tc.id, content: '{}' }
        }
        let args: Record<string, unknown> = {}
        try { args = JSON.parse(tc.function.arguments) } catch { /* ignore */ }
        const result = await executeTool(tc.function.name, args, supabase)
        return { role: 'tool' as const, tool_call_id: tc.id, content: result }
      })
    )
    history.push(...results)
  }

  return NextResponse.json({ content: 'I was unable to complete this request. Please try again.' })
}
