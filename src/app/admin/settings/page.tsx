'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Save, Settings as SettingsIcon } from 'lucide-react'

type AppSettings = {
  id: string
  company_name: string | null
  company_address: string | null
  company_phone: string | null
  company_email: string | null
  rush_surcharge_pct: number
  default_tax_pct: number
  invoice_terms: string | null
  invoice_footer: string | null
}

export default function SettingsPage() {
  const supabase = createClient() as unknown as {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    from: (t: string) => any
  }
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from('app_settings').select('*').single()
      setSettings(data)
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function save() {
    if (!settings) return
    setSaving(true)
    setMessage(null)
    const { error } = await supabase.from('app_settings').update({
      company_name: settings.company_name,
      company_address: settings.company_address,
      company_phone: settings.company_phone,
      company_email: settings.company_email,
      rush_surcharge_pct: settings.rush_surcharge_pct,
      default_tax_pct: settings.default_tax_pct,
      invoice_terms: settings.invoice_terms,
      invoice_footer: settings.invoice_footer,
    }).eq('id', settings.id)
    setSaving(false)
    setMessage(error ? `Error: ${error.message}` : 'Saved!')
    setTimeout(() => setMessage(null), 3000)
  }

  function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setSettings(s => (s ? { ...s, [key]: value } : s))
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  if (!settings) {
    return <Card><CardContent className="py-12 text-center text-muted-foreground">Could not load settings.</CardContent></Card>
  }

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center gap-2">
        <SettingsIcon className="h-5 w-5" />
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Company Information</CardTitle>
          <CardDescription>Shown on invoices, quotes, and emails.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Company name</Label>
            <Input value={settings.company_name ?? ''} onChange={e => update('company_name', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Phone</Label>
              <Input value={settings.company_phone ?? ''} onChange={e => update('company_phone', e.target.value)} />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={settings.company_email ?? ''} onChange={e => update('company_email', e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Address</Label>
            <Textarea rows={2} value={settings.company_address ?? ''} onChange={e => update('company_address', e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pricing Defaults</CardTitle>
          <CardDescription>Used by the auto-quote calculator and rush surcharge.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Rush surcharge %</Label>
              <Input
                type="number"
                step="0.01"
                value={settings.rush_surcharge_pct}
                onChange={e => update('rush_surcharge_pct', parseFloat(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground mt-1">Applied to total when an order is marked as RUSH.</p>
            </div>
            <div>
              <Label>Default tax %</Label>
              <Input
                type="number"
                step="0.01"
                value={settings.default_tax_pct}
                onChange={e => update('default_tax_pct', parseFloat(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground mt-1">Pre-filled on new invoices.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invoice Defaults</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Default terms</Label>
            <Input value={settings.invoice_terms ?? ''} placeholder="Net 30" onChange={e => update('invoice_terms', e.target.value)} />
          </div>
          <div>
            <Label>Footer message</Label>
            <Textarea rows={2} placeholder="Thank you for your business!" value={settings.invoice_footer ?? ''} onChange={e => update('invoice_footer', e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3 sticky bottom-2 bg-background/80 backdrop-blur p-3 rounded-lg border">
        {message && <span className={`text-sm ${message.startsWith('Error') ? 'text-red-600' : 'text-emerald-600'}`}>{message}</span>}
        <Button onClick={save} disabled={saving} className="gap-1.5">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save changes
        </Button>
      </div>
    </div>
  )
}
