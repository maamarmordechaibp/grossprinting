export type UserRole = 'customer' | 'staff' | 'manager' | 'admin'
export type OrderStatus =
  | 'quote'
  | 'approved'
  | 'printing'
  | 'finishing'
  | 'completed'
  | 'delivered'
  | 'rejected'
  | 'cancelled'
export type ProductionStage = 'pending' | 'printing' | 'cutting' | 'finished'
export type Priority = 'low' | 'normal' | 'high' | 'urgent'
export type ColorType = 'bw' | 'color'
export type PaperSize = 'A4' | 'A3' | 'Letter' | 'custom'
export type QuoteStatus = 'draft' | 'sent' | 'approved' | 'rejected' | 'expired'
export type InvoiceStatus = 'draft' | 'sent' | 'partial' | 'paid' | 'overdue' | 'void'
export type PaymentMethod = 'cash' | 'bank_transfer' | 'card_manual' | 'stripe'

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          role: UserRole
          full_name: string | null
          phone: string | null
          customer_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          role?: UserRole
          full_name?: string | null
          phone?: string | null
          customer_id?: string | null
        }
        Update: {
          role?: UserRole
          full_name?: string | null
          phone?: string | null
          customer_id?: string | null
        }
      }
      customers: {
        Row: {
          id: string
          owner_id: string | null
          company_name: string | null
          contact_name: string
          email: string
          phone: string | null
          address: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          owner_id?: string | null
          company_name?: string | null
          contact_name: string
          email: string
          phone?: string | null
          address?: string | null
          notes?: string | null
        }
        Update: {
          company_name?: string | null
          contact_name?: string
          email?: string
          phone?: string | null
          address?: string | null
          notes?: string | null
        }
      }
      orders: {
        Row: {
          id: string
          customer_id: string
          created_by: string
          assigned_to: string | null
          title: string
          description: string | null
          status: OrderStatus
          production_stage: ProductionStage
          priority: Priority
          deadline: string | null
          total_amount: number
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          customer_id: string
          created_by: string
          assigned_to?: string | null
          title: string
          description?: string | null
          status?: OrderStatus
          production_stage?: ProductionStage
          priority?: Priority
          deadline?: string | null
          total_amount?: number
          notes?: string | null
        }
        Update: {
          assigned_to?: string | null
          title?: string
          description?: string | null
          status?: OrderStatus
          production_stage?: ProductionStage
          priority?: Priority
          deadline?: string | null
          total_amount?: number
          notes?: string | null
        }
      }
      order_items: {
        Row: {
          id: string
          order_id: string
          name: string
          quantity: number
          size: PaperSize
          custom_width_mm: number | null
          custom_height_mm: number | null
          paper_type: string | null
          color_type: ColorType
          unit_price: number
          line_total: number
          created_at: string
        }
        Insert: {
          id?: string
          order_id: string
          name: string
          quantity: number
          size?: PaperSize
          custom_width_mm?: number | null
          custom_height_mm?: number | null
          paper_type?: string | null
          color_type?: ColorType
          unit_price?: number
        }
        Update: {
          name?: string
          quantity?: number
          size?: PaperSize
          custom_width_mm?: number | null
          custom_height_mm?: number | null
          paper_type?: string | null
          color_type?: ColorType
          unit_price?: number
        }
      }
      quotes: {
        Row: {
          id: string
          order_id: string
          subtotal: number
          tax: number
          total: number
          valid_until: string | null
          status: QuoteStatus
          decided_at: string | null
          decided_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          order_id: string
          subtotal: number
          tax?: number
          total: number
          valid_until?: string | null
          status?: QuoteStatus
        }
        Update: {
          subtotal?: number
          tax?: number
          total?: number
          valid_until?: string | null
          status?: QuoteStatus
          decided_at?: string | null
          decided_by?: string | null
        }
      }
      files: {
        Row: {
          id: string
          order_id: string
          uploaded_by: string
          bucket: string
          path: string
          name: string
          mime_type: string
          size_bytes: number
          version: number
          label: string | null
          is_final: boolean
          created_at: string
        }
        Insert: {
          id?: string
          order_id: string
          uploaded_by: string
          bucket?: string
          path: string
          name: string
          mime_type: string
          size_bytes: number
          version?: number
          label?: string | null
          is_final?: boolean
        }
        Update: {
          label?: string | null
          is_final?: boolean
        }
      }
      order_status_history: {
        Row: {
          id: string
          order_id: string
          from_status: OrderStatus | null
          to_status: OrderStatus
          changed_by: string | null
          note: string | null
          changed_at: string
        }
      }
      inventory: {
        Row: {
          id: string
          sku: string
          name: string
          unit: string
          quantity: number
          min_quantity: number
          cost_per_unit: number
          category: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          sku: string
          name: string
          unit?: string
          quantity?: number
          min_quantity?: number
          cost_per_unit?: number
          category?: string
        }
        Update: {
          sku?: string
          name?: string
          unit?: string
          quantity?: number
          min_quantity?: number
          cost_per_unit?: number
          category?: string
        }
      }
      inventory_movements: {
        Row: {
          id: string
          inventory_id: string
          order_id: string | null
          delta: number
          reason: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          inventory_id: string
          order_id?: string | null
          delta: number
          reason?: string | null
          created_by?: string | null
        }
      }
      invoices: {
        Row: {
          id: string
          order_id: string
          invoice_number: string
          issue_date: string
          due_date: string | null
          subtotal: number
          tax: number
          total: number
          amount_paid: number
          status: InvoiceStatus
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          order_id: string
          invoice_number?: string
          issue_date?: string
          due_date?: string | null
          subtotal: number
          tax?: number
          total: number
          status?: InvoiceStatus
        }
        Update: {
          due_date?: string | null
          subtotal?: number
          tax?: number
          total?: number
          status?: InvoiceStatus
        }
      }
      payments: {
        Row: {
          id: string
          invoice_id: string
          amount: number
          method: PaymentMethod
          reference: string | null
          paid_at: string
          recorded_by: string | null
          stripe_payment_intent_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          invoice_id: string
          amount: number
          method?: PaymentMethod
          reference?: string | null
          paid_at?: string
          recorded_by?: string | null
          stripe_payment_intent_id?: string | null
        }
      }
      paper_stocks: {
        Row: {
          id: string
          name: string
          width_in: number
          height_in: number
          bw_price: number
          color_price: number
          duplex_surcharge: number
          stock_qty: number
          low_stock_threshold: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          width_in: number
          height_in: number
          bw_price?: number
          color_price?: number
          duplex_surcharge?: number
          stock_qty?: number
          low_stock_threshold?: number
          is_active?: boolean
        }
        Update: {
          name?: string
          width_in?: number
          height_in?: number
          bw_price?: number
          color_price?: number
          duplex_surcharge?: number
          stock_qty?: number
          low_stock_threshold?: number
          is_active?: boolean
        }
      }
      pricing_tiers: {
        Row: {
          id: string
          paper_stock_id: string
          min_qty: number
          max_qty: number | null
          discount_percent: number
          created_at: string
        }
        Insert: {
          id?: string
          paper_stock_id: string
          min_qty: number
          max_qty?: number | null
          discount_percent: number
        }
        Update: {
          min_qty?: number
          max_qty?: number | null
          discount_percent?: number
        }
      }
      product_presets: {
        Row: {
          id: string
          name: string
          finished_width_in: number
          finished_height_in: number
          description: string | null
          default_paper_stock_id: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          finished_width_in: number
          finished_height_in: number
          description?: string | null
          default_paper_stock_id?: string | null
          is_active?: boolean
        }
        Update: {
          name?: string
          finished_width_in?: number
          finished_height_in?: number
          description?: string | null
          default_paper_stock_id?: string | null
          is_active?: boolean
        }
      }
      finishing_options: {
        Row: {
          id: string
          name: string
          price_per_sheet: number
          price_per_piece: number
          flat_price: number
          description: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          price_per_sheet?: number
          price_per_piece?: number
          flat_price?: number
          description?: string | null
          is_active?: boolean
        }
        Update: {
          name?: string
          price_per_sheet?: number
          price_per_piece?: number
          flat_price?: number
          description?: string | null
          is_active?: boolean
        }
      }
    }
    Views: Record<string, never>
    Functions: {
      create_order_with_items: {
        Args: {
          p_customer_id: string
          p_title: string
          p_description: string | null
          p_priority: Priority
          p_deadline: string | null
          p_notes: string | null
          p_items: unknown[]
          p_file_paths: string[]
        }
        Returns: string
      }
    }
    Enums: {
      user_role: UserRole
      order_status: OrderStatus
      production_stage: ProductionStage
      priority: Priority
      quote_status: QuoteStatus
      invoice_status: InvoiceStatus
      payment_method: PaymentMethod
    }
  }
}
