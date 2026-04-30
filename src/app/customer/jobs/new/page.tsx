'use client'

import { useState, useEffect } from 'react'
import { useForm, useFieldArray, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CreateOrderSchema, type CreateOrderInput } from '@/lib/schemas'
import { api, setToken } from '@/lib/api'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2, Upload, X, FileText, Image } from 'lucide-react'

const STEPS = ['Job Details', 'Items', 'Upload Files', 'Review & Submit']

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
            i < current ? 'bg-primary text-primary-foreground' :
            i === current ? 'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2' :
            'bg-muted text-muted-foreground'
          }`}>
            {i + 1}
          </div>
          {i < total - 1 && <div className={`h-0.5 w-6 ${i < current ? 'bg-primary' : 'bg-muted'}`} />}
        </div>
      ))}
    </div>
  )
}

export default function NewJobPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ path: string; name: string; mime_type: string; size_bytes: number }>>([])
  const [uploading, setUploading] = useState(false)
  const [orderId, setOrderId] = useState<string | null>(null)

  const { register, control, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<CreateOrderInput>({
    resolver: zodResolver(CreateOrderSchema) as unknown as Resolver<CreateOrderInput>,
    defaultValues: {
      priority: 'normal',
      items: [{ name: '', quantity: 100, size: 'A4', color_type: 'color', unit_price: 0 }],
      file_paths: [],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'items' })

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setToken(session.access_token)
        supabase
          .from('users')
          .select('customer_id')
          .eq('id', session.user.id)
          .single()
          .then(({ data: profileRaw }) => {
            const data = profileRaw as unknown as { customer_id: string | null } | null
            if (data?.customer_id) {
              setCustomerId(data.customer_id)
              setValue('customer_id', data.customer_id)
            }
          })
        // Pre-create a temp order ID for file uploads
        setOrderId(crypto.randomUUID())
      }
    })
  }, [setValue])

  async function uploadFile(file: File) {
    if (!orderId) return
    setUploading(true)
    try {
      const { signed_url, path } = await api.files.signUpload({
        order_id: orderId,
        filename: file.name,
        mime_type: file.type,
        size_bytes: file.size,
      })
      const uploadRes = await fetch(signed_url, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      })
      if (!uploadRes.ok) throw new Error('Upload failed')
      setUploadedFiles(prev => [...prev, { path, name: file.name, mime_type: file.type, size_bytes: file.size }])
      toast.success(`${file.name} uploaded`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  async function onSubmit(values: CreateOrderInput) {
    try {
      values.file_paths = uploadedFiles.map(f => f.path)
      const result = await api.orders.create(values)

      // Register files against the real order
      if (uploadedFiles.length > 0) {
        await Promise.all(
          uploadedFiles.map(f =>
            api.files.register({
              order_id: result.id,
              path: f.path,
              name: f.name,
              mime_type: f.mime_type,
              size_bytes: f.size_bytes,
              version: 1,
              label: 'v1',
            }),
          ),
        )
      }

      toast.success('Job submitted successfully!')
      router.push(`/customer/jobs/${result.id}`)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const values = watch()

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">New Print Job</h1>
        <p className="text-muted-foreground text-sm mt-1">Tell us what you need printed.</p>
      </div>

      <div className="flex items-center justify-between">
        <StepIndicator current={step} total={STEPS.length} />
        <span className="text-sm text-muted-foreground">{STEPS[step]}</span>
      </div>

      <Separator />

      <form onSubmit={handleSubmit(onSubmit)}>

        {/* Step 0: Details */}
        {step === 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Job Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Job Title *</Label>
                <Input placeholder="e.g. Business Cards for Jane" {...register('title')} />
                {errors.title && <p className="text-destructive text-sm">{errors.title.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea placeholder="Any extra details for our team…" rows={3} {...register('description')} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Priority</Label>
                  <Select defaultValue="normal" onValueChange={v => setValue('priority', v as CreateOrderInput['priority'])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Deadline</Label>
                  <Input type="date" {...register('deadline')} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Internal Notes</Label>
                <Textarea placeholder="Any special instructions…" rows={2} {...register('notes')} />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 1: Items */}
        {step === 1 && (
          <div className="space-y-4">
            {fields.map((field, index) => (
              <Card key={field.id}>
                <CardHeader className="pb-2 flex-row items-center justify-between">
                  <CardTitle className="text-sm">Item {index + 1}</CardTitle>
                  {fields.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(index)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Item Name *</Label>
                    <Input placeholder="e.g. Front page, Inner pages…" {...register(`items.${index}.name`)} />
                    {errors.items?.[index]?.name && <p className="text-destructive text-xs">{errors.items[index].name?.message}</p>}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Quantity *</Label>
                      <Input type="number" min="1" {...register(`items.${index}.quantity`)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Size</Label>
                      <Select defaultValue="A4" onValueChange={v => setValue(`items.${index}.size`, v as 'A4' | 'A3' | 'Letter' | 'custom')}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="A4">A4</SelectItem>
                          <SelectItem value="A3">A3</SelectItem>
                          <SelectItem value="Letter">Letter</SelectItem>
                          <SelectItem value="custom">Custom</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Color</Label>
                      <Select defaultValue="color" onValueChange={v => setValue(`items.${index}.color_type`, v as 'bw' | 'color')}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="color">Full Color</SelectItem>
                          <SelectItem value="bw">Black & White</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Paper Type</Label>
                      <Select onValueChange={(v) => setValue(`items.${index}.paper_type`, v as string | null)}>
                        <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Standard 80gsm">Standard 80gsm</SelectItem>
                          <SelectItem value="Gloss 130gsm">Gloss 130gsm</SelectItem>
                          <SelectItem value="Card 250gsm">Card 250gsm</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2"
              onClick={() => append({ name: '', quantity: 100, size: 'A4', color_type: 'color', unit_price: 0 })}
            >
              <Plus className="h-4 w-4" /> Add Another Item
            </Button>
            {errors.items && typeof errors.items === 'object' && 'message' in errors.items && (
              <p className="text-destructive text-sm">{(errors.items as { message?: string }).message}</p>
            )}
          </div>
        )}

        {/* Step 2: Files */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Upload Print Files</CardTitle>
              <p className="text-sm text-muted-foreground">PDF, JPG, or PNG — max 50MB each</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                <span className="text-sm text-muted-foreground">Click to upload or drag & drop</span>
                <input
                  type="file"
                  className="hidden"
                  multiple
                  accept="application/pdf,image/jpeg,image/png"
                  onChange={async (e) => {
                    const files = Array.from(e.target.files ?? [])
                    for (const file of files) {
                      await uploadFile(file)
                    }
                    e.target.value = ''
                  }}
                  disabled={uploading}
                />
              </label>

              {uploading && <p className="text-sm text-muted-foreground text-center animate-pulse">Uploading…</p>}

              {uploadedFiles.length > 0 && (
                <div className="space-y-2">
                  {uploadedFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-3 p-2 border rounded-lg bg-muted/30">
                      {f.mime_type === 'application/pdf' ? (
                        <FileText className="h-5 w-5 text-red-500 shrink-0" />
                      ) : (
                        <Image className="h-5 w-5 text-blue-500 shrink-0" />
                      )}
                      <span className="text-sm flex-1 truncate">{f.name}</span>
                      <Badge variant="outline" className="text-xs">{(f.size_bytes / 1024).toFixed(0)} KB</Badge>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => setUploadedFiles(prev => prev.filter((_, j) => j !== i))}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 3: Review */}
        {step === 3 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Review Your Job</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <p className="text-sm font-medium">Title</p>
                <p className="text-sm text-muted-foreground">{values.title}</p>
              </div>
              {values.description && (
                <div className="space-y-1">
                  <p className="text-sm font-medium">Description</p>
                  <p className="text-sm text-muted-foreground">{values.description}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Priority</p>
                  <Badge variant="outline">{values.priority}</Badge>
                </div>
                {values.deadline && (
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Deadline</p>
                    <p className="text-sm text-muted-foreground">{new Date(values.deadline).toLocaleDateString()}</p>
                  </div>
                )}
              </div>
              <Separator />
              <div className="space-y-2">
                <p className="text-sm font-medium">Items ({values.items?.length})</p>
                {values.items?.map((item, i) => (
                  <div key={i} className="text-sm text-muted-foreground flex justify-between">
                    <span>{item.name || `Item ${i + 1}`}</span>
                    <span>{item.quantity} × {item.size} {item.color_type === 'bw' ? 'B&W' : 'Color'}</span>
                  </div>
                ))}
              </div>
              {uploadedFiles.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Files ({uploadedFiles.length})</p>
                    {uploadedFiles.map((f, i) => (
                      <p key={i} className="text-sm text-muted-foreground">{f.name}</p>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-6">
          <Button type="button" variant="outline" onClick={() => setStep(s => s - 1)} disabled={step === 0}>
            Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button type="button" onClick={() => setStep(s => s + 1)}>
              Continue
            </Button>
          ) : (
            <Button type="submit" disabled={isSubmitting || !customerId} className="gap-2">
              {isSubmitting ? 'Submitting…' : 'Submit Job'}
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}
