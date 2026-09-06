/**
 * Tipos do banco. Espelham o schema criado em supabase/migrations/.
 * Para regenerar a partir do banco real:
 *   npx supabase gen types typescript --project-id <ref> > src/lib/types/database.types.ts
 */

export type Json = string | number | boolean | null | { [k: string]: Json | undefined } | Json[]

export type AppRole = 'super_admin' | 'admin' | 'customer'

export type AppPermission =
  | 'products.read' | 'products.write' | 'products.delete'
  | 'categories.read' | 'categories.write' | 'categories.delete'
  | 'collections.read' | 'collections.write' | 'collections.delete'
  | 'banners.read' | 'banners.write' | 'banners.delete'
  | 'homepage.read' | 'homepage.write'
  | 'pages.read' | 'pages.write' | 'pages.delete'
  | 'orders.read' | 'orders.write' | 'orders.refund'
  | 'customers.read' | 'customers.write'
  | 'reviews.read' | 'reviews.moderate' | 'reviews.delete'
  | 'coupons.read' | 'coupons.write' | 'coupons.delete'
  | 'inventory.read' | 'inventory.write'
  | 'settings.read' | 'settings.write'
  | 'logs.read' | 'admins.manage'

export type ProductStatus = 'draft' | 'active' | 'archived'
export type DeliveryType = 'automatic' | 'manual'
export type StockPolicy = 'unlimited' | 'manual' | 'digital_keys'
export type OrderStatus = 'pending' | 'paid' | 'processing' | 'completed' | 'cancelled' | 'refunded'
export type PaymentStatus = 'pending' | 'authorized' | 'paid' | 'failed' | 'expired' | 'refunded' | 'chargeback'
export type CouponType = 'percentage' | 'fixed'
export type BannerPlacement = 'home_hero' | 'home_middle' | 'category_top' | 'sidebar'
export type SectionType =
  | 'hero' | 'banner' | 'categories' | 'collection' | 'products'
  | 'text' | 'faq' | 'reviews' | 'cta' | 'features'
export type DigitalContentType = 'code' | 'link' | 'file' | 'credential' | 'text'
export type StockItemStatus = 'available' | 'reserved' | 'delivered' | 'disabled'

export interface Category {
  id: string
  parent_id: string | null
  name: string
  slug: string
  description: string | null
  image_url: string | null
  banner_url: string | null
  position: number
  is_active: boolean
  is_featured: boolean
  show_on_home: boolean
  seo_title: string | null
  seo_description: string | null
  created_at: string
  updated_at: string
}

export interface Product {
  id: string
  short_code: string
  name: string
  slug: string
  short_description: string | null
  description: string | null
  price_cents: number
  compare_at_cents: number | null
  cost_cents: number | null
  sku: string | null
  status: ProductStatus
  category_id: string | null
  delivery_type: DeliveryType
  stock_policy: StockPolicy
  stock_quantity: number
  stock_reserved: number
  tags: string[]
  is_featured: boolean
  position: number
  sales_count: number
  rating_average: number
  rating_count: number
  seo_title: string | null
  seo_description: string | null
  created_at: string
  updated_at: string
}

export interface ProductImage {
  id: string
  product_id: string
  url: string
  alt: string | null
  position: number
  created_at: string
}

export interface Collection {
  id: string
  name: string
  slug: string
  description: string | null
  image_url: string | null
  banner_url: string | null
  position: number
  is_active: boolean
  show_on_home: boolean
  seo_title: string | null
  seo_description: string | null
  created_at: string
  updated_at: string
}

export interface Banner {
  id: string
  title: string
  placement: BannerPlacement
  image_url: string
  image_mobile_url: string | null
  alt: string | null
  link_url: string | null
  open_in_new_tab: boolean
  position: number
  is_active: boolean
  starts_at: string | null
  ends_at: string | null
  created_at: string
  updated_at: string
}

export interface HomepageSection {
  id: string
  type: SectionType
  title: string | null
  subtitle: string | null
  image_url: string | null
  link_url: string | null
  link_label: string | null
  collection_id: string | null
  category_id: string | null
  product_limit: number
  config: Json
  position: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Page {
  id: string
  title: string
  slug: string
  content: string | null
  excerpt: string | null
  seo_title: string | null
  seo_description: string | null
  is_published: boolean
  show_in_footer: boolean
  position: number
  created_at: string
  updated_at: string
}

export interface Setting {
  key: string
  value: Json
  group_name: string
  label: string | null
  is_public: boolean
  updated_at: string
  updated_by: string | null
}

export interface Order {
  id: string
  order_number: number
  user_id: string | null
  customer_email: string
  customer_name: string | null
  customer_phone: string | null
  status: OrderStatus
  payment_status: PaymentStatus
  subtotal_cents: number
  discount_cents: number
  total_cents: number
  coupon_id: string | null
  coupon_code: string | null
  customer_note: string | null
  admin_note: string | null
  paid_at: string | null
  completed_at: string | null
  cancelled_at: string | null
  created_at: string
  updated_at: string
}

export interface OrderItem {
  id: string
  order_id: string
  product_id: string | null
  product_name: string
  product_slug: string | null
  product_image_url: string | null
  unit_price_cents: number
  quantity: number
  total_cents: number
  created_at: string
}

export interface Payment {
  id: string
  order_id: string
  provider: string
  provider_payment_id: string | null
  method: string
  status: PaymentStatus
  amount_cents: number
  qr_code: string | null
  qr_code_text: string | null
  expires_at: string | null
  paid_at: string | null
  created_at: string
  updated_at: string
}

export interface Coupon {
  id: string
  code: string
  description: string | null
  type: CouponType
  value: number
  minimum_order_cents: number
  maximum_discount_cents: number | null
  usage_limit: number | null
  usage_count: number
  per_customer_limit: number
  starts_at: string | null
  expires_at: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Review {
  id: string
  product_id: string
  order_id: string | null
  user_id: string | null
  customer_name: string
  rating: number
  comment: string | null
  is_approved: boolean
  is_verified_purchase: boolean
  admin_reply: string | null
  created_at: string
  updated_at: string
}

export interface DigitalStockItem {
  id: string
  product_id: string
  content: string
  content_type: DigitalContentType
  status: StockItemStatus
  order_item_id: string | null
  reserved_at: string | null
  delivered_at: string | null
  note: string | null
  created_at: string
  updated_at: string
}

export interface Profile {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  phone: string | null
  created_at: string
  updated_at: string
}

export interface AdminLog {
  id: string
  actor_id: string | null
  actor_email: string | null
  action: string
  entity_type: string | null
  entity_id: string | null
  summary: string | null
  metadata: Json
  created_at: string
}

/** Produto com as relações que a vitrine sempre carrega junto. */
export interface ProductWithImages extends Product {
  product_images: ProductImage[]
  categories?: Pick<Category, 'id' | 'name' | 'slug'> | null
}

/** Item do carrinho no cliente. Preço aqui é só para exibição — */
/** o valor cobrado é sempre recalculado no servidor em create_order(). */
export interface CartItem {
  product_id: string
  slug: string
  name: string
  price_cents: number
  compare_at_cents: number | null
  image_url: string | null
  quantity: number
  max_quantity: number
}
