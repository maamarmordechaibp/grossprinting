'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

type OrdersEvent = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  new: Record<string, unknown>
  old: Record<string, unknown>
}

type Options = {
  customerId?: string     // filter by customer (customer portal)
  onOrder?: (e: OrdersEvent) => void
  onStatusHistory?: (e: OrdersEvent) => void
  onFile?: (e: OrdersEvent) => void
}

export function useRealtimeOrders({ customerId, onOrder, onStatusHistory, onFile }: Options) {
  const channelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    const supabase = createClient()

    const channel = supabase.channel('orders-realtime')

    // Subscribe to orders
    if (onOrder) {
      const ordersFilter = customerId
        ? `customer_id=eq.${customerId}`
        : undefined

      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: ordersFilter },
        (payload) => onOrder(payload as OrdersEvent),
      )
    }

    // Subscribe to status history
    if (onStatusHistory) {
      channel.on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'order_status_history' },
        (payload) => onStatusHistory(payload as OrdersEvent),
      )
    }

    // Subscribe to files
    if (onFile) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'files' },
        (payload) => onFile(payload as OrdersEvent),
      )
    }

    channel.subscribe()
    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
    }
  }, [customerId]) // eslint-disable-line react-hooks/exhaustive-deps

  return channelRef
}
