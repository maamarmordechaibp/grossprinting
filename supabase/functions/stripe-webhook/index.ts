/**
 * stripe-webhook — verifies Stripe signature and records payments
 */
import { cors, json, err } from '../_shared/cors.ts'
import { adminClient } from '../_shared/auth.ts'

const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? ''

async function verifyStripeSignature(payload: string, sigHeader: string, secret: string): Promise<boolean> {
  const parts = sigHeader.split(',')
  const timestamp = parts.find(p => p.startsWith('t='))?.split('=')[1]
  const sig = parts.find(p => p.startsWith('v1='))?.split('=')[1]
  if (!timestamp || !sig) return false

  const signedPayload = `${timestamp}.${payload}`
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload))
  const expectedSig = Array.from(new Uint8Array(signatureBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  return expectedSig === sig
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 })
  if (req.method !== 'POST') return err('Method not allowed', 405)

  try {
    const payload = await req.text()
    const sig = req.headers.get('stripe-signature') ?? ''

    if (STRIPE_WEBHOOK_SECRET) {
      const valid = await verifyStripeSignature(payload, sig, STRIPE_WEBHOOK_SECRET)
      if (!valid) return err('Invalid Stripe signature', 401)
    }

    const event = JSON.parse(payload)
    const admin = adminClient()

    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object
      const invoiceId = pi.metadata?.invoice_id

      if (!invoiceId) {
        console.warn('[stripe-webhook] No invoice_id in metadata, skipping')
        return json({ received: true })
      }

      // Idempotency: check if payment already recorded
      const { data: existing } = await admin
        .from('payments')
        .select('id')
        .eq('stripe_payment_intent_id', pi.id)
        .maybeSingle()

      if (existing) {
        console.log('[stripe-webhook] Payment already recorded:', pi.id)
        return json({ received: true, duplicate: true })
      }

      const { error } = await admin.from('payments').insert({
        invoice_id: invoiceId,
        amount: pi.amount_received / 100, // Stripe amounts are in cents
        method: 'stripe',
        stripe_payment_intent_id: pi.id,
        reference: pi.id,
        paid_at: new Date(pi.created * 1000).toISOString(),
      })

      if (error) {
        console.error('[stripe-webhook] DB insert error:', error)
        return err(error.message, 500)
      }

      console.log('[stripe-webhook] Payment recorded for invoice:', invoiceId)
    }

    return json({ received: true })
  } catch (e) {
    console.error('[stripe-webhook] Error:', e)
    return err((e as Error).message, 500)
  }
})
