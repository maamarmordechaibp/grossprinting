import { z } from 'zod'

export const OrderItemSchema = z.object({
  name: z.string().min(1, 'Name required'),
  quantity: z.coerce.number().int().min(1, 'Minimum 1'),
  size: z.enum(['A4', 'A3', 'Letter', 'custom']).default('A4'),
  custom_width_mm: z.coerce.number().optional().nullable(),
  custom_height_mm: z.coerce.number().optional().nullable(),
  paper_type: z.string().optional().nullable(),
  color_type: z.enum(['bw', 'color']).default('color'),
  unit_price: z.coerce.number().min(0).default(0),
})

export const CreateOrderSchema = z.object({
  customer_id: z.string().uuid(),
  title: z.string().min(3, 'Title must be at least 3 characters'),
  description: z.string().optional().nullable(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  deadline: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  items: z.array(OrderItemSchema).min(1, 'Add at least one item'),
  file_paths: z.array(z.string()).default([]),
})

export const UpdateOrderSchema = z.object({
  title: z.string().min(3).optional(),
  description: z.string().optional().nullable(),
  status: z.enum(['quote', 'approved', 'printing', 'finishing', 'completed', 'delivered', 'rejected', 'cancelled']).optional(),
  production_stage: z.enum(['pending', 'printing', 'cutting', 'finished']).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  deadline: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  assigned_to: z.string().uuid().optional().nullable(),
  total_amount: z.coerce.number().min(0).optional(),
})

export const CreateQuoteSchema = z.object({
  order_id: z.string().uuid(),
  subtotal: z.coerce.number().min(0),
  tax: z.coerce.number().min(0).default(0),
  total: z.coerce.number().min(0),
  valid_until: z.string().optional().nullable(),
  valid_days: z.coerce.number().int().min(1).optional(),
})

export const CreateInvoiceSchema = z.object({
  order_id: z.string().uuid(),
  customer_id: z.string().uuid().optional(),
  subtotal: z.coerce.number().min(0).optional(),
  tax: z.coerce.number().min(0).default(0),
  total: z.coerce.number().min(0).optional(),
  issue_date: z.string().optional(),
  due_date: z.string().optional().nullable(),
  due_days: z.coerce.number().int().min(1).optional(),
})

export const RecordPaymentSchema = z.object({
  invoice_id: z.string().uuid(),
  amount: z.coerce.number().min(0.01, 'Amount must be positive'),
  method: z.enum(['cash', 'bank_transfer', 'card_manual']),
  reference: z.string().optional().nullable(),
  paid_at: z.string().optional(),
})

export const RegisterSchema = z.object({
  full_name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

export const LoginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password required'),
})

export const CustomerSchema = z.object({
  company_name: z.string().optional().nullable(),
  contact_name: z.string().min(2, 'Name required'),
  email: z.string().email('Invalid email'),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
})

export const InventorySchema = z.object({
  sku: z.string().min(1, 'SKU required'),
  name: z.string().min(1, 'Name required'),
  unit: z.enum(['sheet', 'ml', 'roll', 'piece']).default('sheet'),
  quantity: z.coerce.number().min(0).default(0),
  min_quantity: z.coerce.number().min(0).default(0),
  cost_per_unit: z.coerce.number().min(0).default(0),
  category: z.enum(['paper', 'ink', 'other']).default('paper'),
})

export type CreateOrderInput = z.infer<typeof CreateOrderSchema>
export type UpdateOrderInput = z.infer<typeof UpdateOrderSchema>
export type CreateQuoteInput = z.infer<typeof CreateQuoteSchema>
export type CreateInvoiceInput = z.infer<typeof CreateInvoiceSchema>
export type RecordPaymentInput = z.infer<typeof RecordPaymentSchema>
export type RegisterInput = z.infer<typeof RegisterSchema>
export type LoginInput = z.infer<typeof LoginSchema>
export type CustomerInput = z.infer<typeof CustomerSchema>
export type InventoryInput = z.infer<typeof InventorySchema>
