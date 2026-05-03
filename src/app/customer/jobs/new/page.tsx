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
import { Badge } from '@/components/ui/badge'
import {
  Plus, Trash2, Upload, X, FileText, Image as ImageIcon,
  Printer, Layers, CloudUpload, CheckCircle2,
  AlignLeft, Calendar, Zap, StickyNote, Package,
} from 'lucide-react'

/* ── types ── */
type FileEntry = { path: string; name: string; mime_type: string; size_bytes: number }

/* ─────────────── Step indicator ─────────────── */
const STEPS = [
  { label: 'Details',  icon: AlignLeft },
  { label: 'Items',    icon: Layers },
  { label: 'Files',    icon: CloudUpload },
  { label: 'Review',   icon: CheckCircle2 },
]

function StepBar({ current }: { current: number }) {
  return (
    <div className="flex items-start justify-between">
      {STEPS.map((s, i) => {
        const done    = i < current
        const active  = i === current
        const Icon    = s.icon
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1.5 relative">
            {/* connector line */}
            {i < STEPS.length - 1 && (
              <div className={`absolute left-1/2 top-4 h-0.5 w-full transition-colors ${done ? 'bg-primary' : 'bg-border'}`} />
            )}
            {/* circle */}
            <div className={`relative z-10 h-8 w-8 rounded-full flex items-center justify-center transition-all duration-200 ${
              done   ? 'bg-primary text-primary-foreground shadow-sm' :
              active ? 'bg-primary text-primary-foreground ring-4 ring-primary/20 shadow-md' :
                       'bg-muted text-muted-foreground'
            }`}>
              {done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
            </div>
            {/* label */}
            <span className={`text-xs font-medium ${active ? 'text-primary' : done ? 'text-foreground' : 'text-muted-foreground'}`}>
              {s.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/* ─────────────── Visual toggle button ─────────────── */
function ToggleChip({ label, active, onClick, icon }: { label: string; active: boolean; onClick: () => void; icon?: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-all ${
        active
          ? 'border-primary bg-primary text-primary-foreground shadow-sm'
          : 'border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

/* ─────────────── Paper chip ─────────────── */
const PAPER_OPTIONS = [
  { value: 'Standard 80gsm', label: 'Standard', sub: '80gsm' },
  { value: 'Gloss 130gsm',   label: 'Gloss',    sub: '130gsm' },
  { value: 'Card 250gsm',    label: 'Card',      sub: '250gsm' },
]

function PaperPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {PAPER_OPTIONS.map(p => (
        <button
          key={p.value}
          type="button"
          onClick={() => onChange(p.value)}
          className={`flex flex-col items-center px-4 py-2 rounded-lg border text-xs font-medium transition-all ${
            value === p.value
              ? 'border-primary bg-primary/5 text-primary'
              : 'border-border text-muted-foreground hover:border-primary/40'
          }`}
        >
          <span className="font-semibold text-sm">{p.label}</span>
          <span className="opacity-70">{p.sub}</span>
        </button>
      ))}
    </div>
  )
}

/* ─────────────────── Main component ─────────────────── */
export default function NewJobPage() {
  const router = useRouter()
  const [step, setStep]               = useState(0)
  const [customerId, setCustomerId]   = useState<string | null>(null)
  const [uploadedFiles, setUploadedFiles] = useState<FileEntry[]>([])
  const [uploading, setUploading]     = useState(false)
  const [orderId]                     = useState(() => crypto.randomUUID())
  const [itemPapers, setItemPapers]   = useState<Record<number, string>>({})

  const { register, control, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } =
    useForm<CreateOrderInput>({
      resolver: zodResolver(CreateOrderSchema) as unknown as Resolver<CreateOrderInput>,
      defaultValues: {
        priority: 'normal',
        items: [{ name: '', quantity: 100, size: 'Letter', color_type: 'color', unit_price: 0 }],
        file_paths: [],
      },
    })

  const { fields, append, remove } = useFieldArray({ control, name: 'items' })

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      setToken(session.access_token)
      supabase
        .from('users').select('customer_id')
        .eq('id', session.user.id).single()
        .then(({ data: d }) => {
          const profile = d as unknown as { customer_id: string | null } | null
          if (profile?.customer_id) {
            setCustomerId(profile.customer_id)
            setValue('customer_id', profile.customer_id)
          }
        })
    })
  }, [setValue])

  async function uploadFile(file: File) {
    setUploading(true)
    try {
      const { signed_url, path } = await api.files.signUpload({
        order_id: orderId,
        filename: file.name,
        mime_type: file.type,
        size_bytes: file.size,
      })
      const res = await fetch(signed_url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
      if (!res.ok) throw new Error('Upload failed')
      setUploadedFiles(p => [...p, { path, name: file.name, mime_type: file.type, size_bytes: file.size }])
      toast.success(`${file.name} uploaded`)
    } catch (e) { toast.error((e as Error).message) }
    finally { setUploading(false) }
  }

  async function onSubmit(values: CreateOrderInput) {
    try {
      values.file_paths = uploadedFiles.map(f => f.path)
      const result = await api.orders.create(values)
      if (uploadedFiles.length > 0) {
        await Promise.all(uploadedFiles.map(f =>
          api.files.register({ order_id: result.id, path: f.path, name: f.name, mime_type: f.mime_type, size_bytes: f.size_bytes, version: 1, label: 'v1' })
        ))
      }
      toast.success('Job submitted!')
      router.push(`/customer/jobs/${result.id}`)
    } catch (e) { toast.error((e as Error).message) }
  }

  const values = watch()
  const priority = values.priority ?? 'normal'

  const PRIORITY_COLORS: Record<string, string> = {
    low: 'bg-gray-100 text-gray-600 border-gray-200',
    normal: 'bg-blue-50 text-blue-700 border-blue-100',
    high: 'bg-orange-100 text-orange-700 border-orange-200',
    urgent: 'bg-red-100 text-red-700 border-red-200',
  }

  /* step validation before advancing */
  function canContinue(): boolean {
    if (step === 0) return !!values.title?.trim()
    if (step === 1) return (values.items ?? []).every(it => it.name?.trim() && it.quantity > 0)
    return true
  }

  return (
    <div className="max-w-2xl mx-auto pb-12">
      {/* ── Page header ── */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Printer className="h-5 w-5 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">New Print Job</h1>
        </div>
        <p className="text-muted-foreground text-sm ml-12">Tell us what you need printed and we will take care of the rest.</p>
      </div>

      {/* ── Step bar ── */}
      <div className="mb-8 px-2">
        <StepBar current={step} />
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

        {/* ════════ STEP 0: Details ════════ */}
        {step === 0 && (
          <div className="space-y-5">
            {/* Title */}
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Job Title <span className="text-destructive">*</span></Label>
              <div className="relative">
                <AlignLeft className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="e.g. Business Cards for Jane"
                  {...register('title')}
                />
              </div>
              {errors.title && <p className="text-destructive text-xs">{errors.title.message}</p>}
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Description</Label>
              <Textarea
                placeholder="Any extra details for our team — paper finish, fold type, special requirements…"
                rows={3}
                {...register('description')}
              />
            </div>

            {/* Priority + Deadline */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5" /> Priority
                </Label>
                <Select defaultValue="normal" onValueChange={v => setValue('priority', v as CreateOrderInput['priority'])}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">🟢 Low</SelectItem>
                    <SelectItem value="normal">🔵 Normal</SelectItem>
                    <SelectItem value="high">🟠 High</SelectItem>
                    <SelectItem value="urgent">🔴 Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" /> Deadline
                </Label>
                <Input type="date" className="h-9" {...register('deadline')} />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold flex items-center gap-1.5">
                <StickyNote className="h-3.5 w-3.5" /> Special Instructions
              </Label>
              <Textarea
                placeholder="Cutting, folding, lamination, or delivery notes…"
                rows={2}
                {...register('notes')}
              />
            </div>
          </div>
        )}

        {/* ════════ STEP 1: Items ════════ */}
        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Add one or more print items to this job.</p>
            {fields.map((field, idx) => (
              <div key={field.id} className="border rounded-xl overflow-hidden shadow-sm">
                {/* card header */}
                <div className="flex items-center justify-between px-4 py-3 bg-muted/40 border-b">
                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-bold">
                      {idx + 1}
                    </div>
                    <span className="text-sm font-semibold">Item {idx + 1}</span>
                  </div>
                  {fields.length > 1 && (
                    <button type="button" onClick={() => remove(idx)}
                      className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="p-4 space-y-4">
                  {/* Item name */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Item Name *</Label>
                    <Input placeholder="e.g. Business Card, Flyer Front, Brochure Cover…" {...register(`items.${idx}.name`)} />
                    {errors.items?.[idx]?.name && <p className="text-destructive text-xs">{errors.items[idx].name?.message}</p>}
                  </div>

                  {/* Quantity + Size */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quantity *</Label>
                      <Input type="number" min="1" {...register(`items.${idx}.quantity`, { valueAsNumber: true })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Size</Label>
                      <Select defaultValue="Letter" onValueChange={v => setValue(`items.${idx}.size`, v as CreateOrderInput['items'][0]['size'])}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="A4">A4 (210×297mm)</SelectItem>
                          <SelectItem value="A3">A3 (297×420mm)</SelectItem>
                          <SelectItem value="Letter">Letter (8.5×11")</SelectItem>
                          <SelectItem value="custom">Custom size</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Color toggle */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Color Mode</Label>
                    <div className="flex gap-2">
                      <ToggleChip
                        label="Full Color"
                        active={values.items?.[idx]?.color_type === 'color'}
                        onClick={() => setValue(`items.${idx}.color_type`, 'color')}
                        icon={<span className="text-base leading-none">🎨</span>}
                      />
                      <ToggleChip
                        label="Black & White"
                        active={values.items?.[idx]?.color_type === 'bw'}
                        onClick={() => setValue(`items.${idx}.color_type`, 'bw')}
                        icon={<span className="text-base leading-none">⬛</span>}
                      />
                    </div>
                  </div>

                  {/* Paper picker */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Paper Stock</Label>
                    <PaperPicker
                      value={itemPapers[idx] ?? ''}
                      onChange={v => {
                        setItemPapers(p => ({ ...p, [idx]: v }))
                        setValue(`items.${idx}.paper_type`, v)
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={() => append({ name: '', quantity: 100, size: 'Letter', color_type: 'color', unit_price: 0 })}
              className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-border rounded-xl text-sm font-medium text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
            >
              <Plus className="h-4 w-4" /> Add another item
            </button>
          </div>
        )}

        {/* ════════ STEP 2: Files ════════ */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium">Upload your print files</p>
              <p className="text-xs text-muted-foreground mt-0.5">PDF, JPG, or PNG — max 50 MB each. You can skip this and email files later.</p>
            </div>

            {/* Drop zone */}
            <label className={`flex flex-col items-center justify-center w-full py-10 border-2 border-dashed rounded-xl cursor-pointer transition-colors group ${
              uploading ? 'border-primary/50 bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/30'
            }`}>
              <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/15 transition-colors">
                {uploading
                  ? <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  : <CloudUpload className="h-7 w-7 text-primary" />}
              </div>
              <p className="text-sm font-medium">{uploading ? 'Uploading…' : 'Click to upload'}</p>
              <p className="text-xs text-muted-foreground mt-1">or drag & drop files here</p>
              <input
                type="file"
                className="hidden"
                multiple
                accept="application/pdf,image/jpeg,image/png"
                disabled={uploading}
                onChange={async (e) => {
                  for (const file of Array.from(e.target.files ?? [])) await uploadFile(file)
                  e.target.value = ''
                }}
              />
            </label>

            {/* File list */}
            {uploadedFiles.length > 0 && (
              <div className="space-y-2">
                {uploadedFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3 border rounded-xl bg-muted/20 hover:bg-muted/40 transition-colors group">
                    <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                      f.mime_type === 'application/pdf' ? 'bg-red-100' : 'bg-blue-100'
                    }`}>
                      {f.mime_type === 'application/pdf'
                        ? <FileText className="h-4 w-4 text-red-600" />
                        : <ImageIcon className="h-4 w-4 text-blue-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{f.name}</p>
                      <p className="text-xs text-muted-foreground">{(f.size_bytes / 1024).toFixed(0)} KB</p>
                    </div>
                    <Badge variant="outline" className="text-emerald-600 border-emerald-300 bg-emerald-50 text-xs">Uploaded</Badge>
                    <button
                      type="button"
                      onClick={() => setUploadedFiles(p => p.filter((_, j) => j !== i))}
                      className="h-7 w-7 flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-all"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ════════ STEP 3: Review ════════ */}
        {step === 3 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Please review everything before submitting.</p>

            {/* Summary card */}
            <div className="border rounded-xl overflow-hidden shadow-sm">
              {/* Job info */}
              <div className="px-5 py-4 bg-muted/30 border-b">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-base">{values.title || '—'}</p>
                    {values.description && <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{values.description}</p>}
                  </div>
                  {priority && (
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${PRIORITY_COLORS[priority] ?? ''}`}>
                      {priority.charAt(0).toUpperCase() + priority.slice(1)}
                    </span>
                  )}
                </div>
                {values.deadline && (
                  <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> Due {new Date(values.deadline).toLocaleDateString()}
                  </p>
                )}
              </div>

              {/* Items */}
              <div className="px-5 py-4 border-b space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                  <Package className="inline h-3.5 w-3.5 mr-1" />Items ({values.items?.length ?? 0})
                </p>
                {values.items?.map((item, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                      <span className="text-sm font-medium">{item.name || `Item ${i + 1}`}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{item.quantity} pcs</Badge>
                      <Badge variant="outline" className="text-xs">{item.size}</Badge>
                      <Badge variant="outline" className={`text-xs ${item.color_type === 'color' ? 'border-violet-300 text-violet-700 bg-violet-50' : 'border-gray-300 text-gray-600'}`}>
                        {item.color_type === 'color' ? 'Color' : 'B&W'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>

              {/* Files */}
              <div className="px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                  <CloudUpload className="inline h-3.5 w-3.5 mr-1" />Files ({uploadedFiles.length})
                </p>
                {uploadedFiles.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No files uploaded — you can email them after submitting.</p>
                ) : (
                  <div className="space-y-1">
                    {uploadedFiles.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                        {f.mime_type === 'application/pdf' ? <FileText className="h-3.5 w-3.5 text-red-500 shrink-0" /> : <ImageIcon className="h-3.5 w-3.5 text-blue-500 shrink-0" />}
                        <span className="truncate">{f.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {values.notes && (
              <div className="rounded-xl border bg-amber-50/60 border-amber-200 px-4 py-3">
                <p className="text-xs font-semibold text-amber-700 mb-1">Special Instructions</p>
                <p className="text-sm text-amber-900">{values.notes}</p>
              </div>
            )}
          </div>
        )}

        {/* ════════ Navigation ════════ */}
        <div className="flex items-center justify-between pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setStep(s => s - 1)}
            disabled={step === 0}
            className="gap-2"
          >
            Back
          </Button>

          {step < STEPS.length - 1 ? (
            <Button
              type="button"
              onClick={() => setStep(s => s + 1)}
              disabled={!canContinue()}
              className="gap-2 min-w-28"
            >
              Continue →
            </Button>
          ) : (
            <Button
              type="submit"
              disabled={isSubmitting || !customerId}
              className="gap-2 min-w-36"
            >
              {isSubmitting ? (
                <>
                  <div className="h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Submitting…
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" /> Submit Job
                </>
              )}
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}