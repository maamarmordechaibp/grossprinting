/**
 * notify — sends transactional emails via Resend
 * Triggered by DB webhooks or called directly from other edge functions.
 * Events: new_order | quote_ready | status_changed | completed
 */
import { cors, json, err } from '../_shared/cors.ts'
import { adminClient } from '../_shared/auth.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const FROM_EMAIL = Deno.env.get('NOTIFY_FROM_EMAIL') ?? 'Gross Printing <noreply@grossprintingco.com>'

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY) {
    console.warn('[notify] RESEND_API_KEY not set — skipping email')
    return
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  })
  if (!res.ok) {
    const text = await res.text()
    console.error('[notify] Resend error', res.status, text)
  }
}

function orderUrl(orderId: string) {
  const base = Deno.env.get('NEXT_PUBLIC_APP_URL') ?? 'https://localhost:3000'
  return `${base}/customer/jobs/${orderId}`
}

Deno.serve(async (req) => {
  const preflight = cors(req)
  if (preflight) return preflight

  try {
    const body = await req.json()
    const { event, order_id } = body
    const admin = adminClient()

    const { data: order } = await admin
      .from('orders')
      .select(`*, customers(contact_name, email), quotes(total)`)
      .eq('id', order_id)
      .single()

    if (!order) return err('Order not found', 404)

    const to = order.customers?.email ?? ''
    const name = order.customers?.contact_name ?? 'Customer'
    const link = orderUrl(order_id)

    switch (event) {
      case 'new_order':
        await sendEmail(
          to,
          `✅ Job Received — ${order.title}`,
          `<p>Hi ${name},</p><p>We've received your print job <strong>${order.title}</strong>. We'll review it and send you a quote shortly.</p><p><a href="${link}">View your job →</a></p>`,
        )
        break

      case 'quote_ready':
        await sendEmail(
          to,
          `💰 Your Quote is Ready — ${order.title}`,
          `<p>Hi ${name},</p><p>Your quote for <strong>${order.title}</strong> is ready for review. Total: <strong>$${order.quotes?.[0]?.total ?? '—'}</strong></p><p><a href="${link}">Review &amp; Approve →</a></p>`,
        )
        break

      case 'status_changed':
        await sendEmail(
          to,
          `🔄 Job Update — ${order.title} is now ${order.status}`,
          `<p>Hi ${name},</p><p>Your print job <strong>${order.title}</strong> has moved to: <strong>${order.status}</strong>.</p><p><a href="${link}">Track your job →</a></p>`,
        )
        break

      case 'completed':
        await sendEmail(
          to,
          `🎉 Job Completed — ${order.title}`,
          `<p>Hi ${name},</p><p>Great news! Your print job <strong>${order.title}</strong> is complete and ready for pickup/delivery.</p><p><a href="${link}">View details →</a></p>`,
        )
        break

      default:
        console.warn('[notify] Unknown event:', event)
    }

    return json({ sent: true, event, order_id })
  } catch (e) {
    return err((e as Error).message)
  }
})
