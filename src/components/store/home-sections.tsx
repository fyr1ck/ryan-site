import Image from 'next/image'
import Link from 'next/link'
import {
  Award,
  BadgeCheck,
  CircleHelp,
  Clock,
  CreditCard,
  Gift,
  Headphones,
  Heart,
  Lock,
  MessageCircle,
  Package,
  Percent,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Sparkles,
  Star,
  ThumbsUp,
  Truck,
  Users,
  Wallet,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import {
  getCategories,
  getCategoryProducts,
  getCollectionProducts,
  getCollections,
  getFeaturedCategories,
  getFeaturedProducts,
  getRecentReviews,
} from '@/lib/queries/catalog'
import type { StoreSettings } from '@/lib/queries/settings'
import { sanitizeHtml } from '@/lib/sanitize'
import { createClient } from '@/lib/supabase/server'
import type { Banner, BannerPlacement, HomepageSection, Json } from '@/lib/types/database.types'
import { cn, formatDate, initials } from '@/lib/utils'

import { CategoryGrid } from './category-grid'
import { ProductCarousel } from './product-carousel'
import { RatingStars } from './rating-stars'

/**
 * Blocos da home.
 *
 * A home inteira é montada a partir de homepage_sections: a página só passa a
 * lista, e cada tipo sabe buscar o que precisa. Nada é hardcoded — seção sem
 * conteúdo simplesmente não renderiza, em vez de deixar um título órfão ou um
 * estado vazio no meio da vitrine.
 */

/** Espaçamento vertical único, para toda seção respirar igual. */
const SECTION_SPACING = 'py-10 sm:py-14'

const FALLBACK_THUMB = '/placeholders/product-1.svg'

/* -----------------------------------------------------------------------------
 * Leitura do config jsonb
 * -------------------------------------------------------------------------- */

function asRecord(value: Json | null | undefined): Record<string, Json> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, Json>)
    : {}
}

/** String não vazia de uma chave do config, ou null. */
function configText(config: Json, key: string): string | null {
  const value = asRecord(config)[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/** config.items normalizado — sempre um array de objetos. */
function configItems(config: Json): Record<string, Json>[] {
  const items = asRecord(config).items
  return Array.isArray(items) ? items.map(asRecord) : []
}

/** Primeiro campo preenchido entre os apelidos aceitos para a mesma coisa. */
function itemText(item: Record<string, Json>, ...keys: string[]): string {
  for (const key of keys) {
    const value = item[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

/**
 * Só caminho interno ou http(s). O link vem do painel e vai para href:
 * um "javascript:" plantado ali executaria em todo visitante da home.
 */
function safeHref(value: string | null | undefined): string | null {
  const raw = (value ?? '').trim()
  if (!raw) return null
  if (raw.startsWith('/')) return raw
  if (/^https?:\/\//i.test(raw)) return raw
  return null
}

function isExternal(href: string): boolean {
  return /^https?:\/\//i.test(href)
}

/* -----------------------------------------------------------------------------
 * Banners
 * -------------------------------------------------------------------------- */

/**
 * Banners de um placement, ativos e dentro da janela de datas.
 *
 * O filtro é refeito aqui mesmo o RLS já respeitando a janela: quem está
 * logado como admin cai na policy de leitura total e enxergaria banner
 * agendado ou desativado na home. A vitrine não pode depender de quem olha.
 */
async function getActiveBanners(placement: BannerPlacement): Promise<Banner[]> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('banners')
    .select('*')
    .eq('placement', placement)
    .eq('is_active', true)
    .order('position')

  const now = Date.now()

  return ((data as Banner[]) ?? []).filter((banner) => {
    const started = !banner.starts_at || Date.parse(banner.starts_at) <= now
    const running = !banner.ends_at || Date.parse(banner.ends_at) > now
    return started && running
  })
}

interface BannerMediaProps {
  banner: Banner
  /** Aspecto do celular e do desktop — o hero é mais alto que o do meio. */
  mobileAspect: string
  desktopAspect: string
  priority?: boolean
}

/**
 * Arte diferente por tela.
 *
 * Não é a mesma imagem recortada: são dois arquivos, um vertical para o
 * celular e um panorâmico para o desktop. Por isso as duas <Image> com
 * hidden/md:block — `display:none` tira o par escondido também da árvore de
 * acessibilidade, então o leitor de tela anuncia o banner uma vez só.
 */
function BannerMedia({ banner, mobileAspect, desktopAspect, priority }: BannerMediaProps) {
  const alt = banner.alt || banner.title
  const mobileSrc = banner.image_mobile_url || banner.image_url
  const desktopSrc = banner.image_url

  return (
    <>
      <span
        className={cn(
          'relative block w-full overflow-hidden rounded-2xl bg-muted md:hidden',
          mobileAspect
        )}
      >
        <Image
          src={mobileSrc}
          alt={alt}
          fill
          priority={priority}
          sizes="100vw"
          unoptimized={mobileSrc.endsWith('.svg')}
          className="object-cover"
        />
      </span>

      <span
        className={cn(
          'relative hidden w-full overflow-hidden rounded-2xl bg-muted md:block',
          desktopAspect
        )}
      >
        <Image
          src={desktopSrc}
          alt={alt}
          fill
          priority={priority}
          sizes="(min-width: 1280px) 1280px, 100vw"
          unoptimized={desktopSrc.endsWith('.svg')}
          className="object-cover"
        />
      </span>
    </>
  )
}

function BannerBlock(props: BannerMediaProps) {
  const href = safeHref(props.banner.link_url)
  const media = <BannerMedia {...props} />

  if (!href) {
    return <div className="w-full">{media}</div>
  }

  const focusRing =
    'block rounded-2xl transition-opacity hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'

  if (isExternal(href) || props.banner.open_in_new_tab) {
    return (
      <a
        href={href}
        target={props.banner.open_in_new_tab ? '_blank' : undefined}
        rel="noopener noreferrer"
        className={focusRing}
      >
        {media}
      </a>
    )
  }

  return (
    <Link href={href} className={focusRing}>
      {media}
    </Link>
  )
}

/* -----------------------------------------------------------------------------
 * Ícones das features
 * -------------------------------------------------------------------------- */

const FEATURE_ICONS: Record<string, LucideIcon> = {
  award: Award,
  'badge-check': BadgeCheck,
  clock: Clock,
  'credit-card': CreditCard,
  gift: Gift,
  headphones: Headphones,
  heart: Heart,
  'help-circle': CircleHelp,
  lock: Lock,
  'message-circle': MessageCircle,
  package: Package,
  percent: Percent,
  'refresh-cw': RefreshCw,
  rocket: Rocket,
  shield: ShieldCheck,
  'shield-check': ShieldCheck,
  sparkles: Sparkles,
  star: Star,
  support: Headphones,
  'thumbs-up': ThumbsUp,
  truck: Truck,
  users: Users,
  wallet: Wallet,
  zap: Zap,
}

/** Aceita "shield-check", "shieldCheck", "ShieldCheck" ou "shield_check". */
function featureIcon(name: string): LucideIcon {
  const key = name
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase()

  return FEATURE_ICONS[key] ?? Sparkles
}

/* -----------------------------------------------------------------------------
 * Casca das seções
 * -------------------------------------------------------------------------- */

function Section({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('container-store', SECTION_SPACING, className)}>{children}</section>
  )
}

function SectionHeading({
  title,
  subtitle,
  align = 'left',
}: {
  title?: string | null
  subtitle?: string | null
  align?: 'left' | 'center'
}) {
  if (!title && !subtitle) return null

  return (
    <div className={cn('mb-5 flex flex-col gap-1', align === 'center' && 'items-center text-center')}>
      {title && <h2 className="text-xl font-bold sm:text-2xl">{title}</h2>}
      {subtitle && <p className="text-sm text-muted-foreground sm:text-base">{subtitle}</p>}
    </div>
  )
}

/* -----------------------------------------------------------------------------
 * Seções por tipo
 * -------------------------------------------------------------------------- */

async function HeroSection({ first }: { first: boolean }) {
  const [banner] = await getActiveBanners('home_hero')
  if (!banner) return null

  return (
    <Section className={first ? 'pt-4 pb-10 sm:pt-6 sm:pb-14' : undefined}>
      <BannerBlock
        banner={banner}
        mobileAspect="aspect-[4/3]"
        desktopAspect="md:aspect-[4/1]"
        priority={first}
      />
    </Section>
  )
}

async function BannerSection({ section }: { section: HomepageSection }) {
  const [banner] = await getActiveBanners('home_middle')
  if (!banner) return null

  return (
    <Section>
      <SectionHeading title={section.title} subtitle={section.subtitle} />
      <BannerBlock banner={banner} mobileAspect="aspect-[3/2]" desktopAspect="md:aspect-[5/1]" />
    </Section>
  )
}

async function CategoriesSection({ section }: { section: HomepageSection }) {
  const categories = await getFeaturedCategories()
  if (categories.length === 0) return null

  return (
    <Section>
      <SectionHeading title={section.title} subtitle={section.subtitle} />
      <CategoryGrid categories={categories} />
    </Section>
  )
}

async function CollectionSection({ section }: { section: HomepageSection }) {
  if (!section.collection_id) return null

  const [products, collections] = await Promise.all([
    getCollectionProducts(section.collection_id, section.product_limit),
    getCollections(),
  ])

  if (products.length === 0) return null

  const collection = collections.find((item) => item.id === section.collection_id)

  return (
    <Section>
      <ProductCarousel
        title={section.title || collection?.name || 'Coleção'}
        subtitle={section.subtitle ?? undefined}
        products={products}
        viewAllHref={collection ? `/colecao/${collection.slug}` : undefined}
      />
    </Section>
  )
}

async function ProductsSection({ section }: { section: HomepageSection }) {
  // Sem categoria a seção vira a vitrine dos destaques — é o que o painel
  // entrega quando o admin cria um carrossel sem escolher categoria.
  const products = section.category_id
    ? await getCategoryProducts(section.category_id, section.product_limit)
    : await getFeaturedProducts(section.product_limit)

  if (products.length === 0) return null

  const category = section.category_id
    ? (await getCategories()).find((item) => item.id === section.category_id)
    : undefined

  return (
    <Section>
      <ProductCarousel
        title={section.title || category?.name || 'Destaques'}
        subtitle={section.subtitle ?? undefined}
        products={products}
        viewAllHref={category ? `/categoria/${category.slug}` : '/produtos'}
      />
    </Section>
  )
}

function FeaturesSection({ section }: { section: HomepageSection }) {
  const items = configItems(section.config)
    .map((item) => ({
      icon: itemText(item, 'icon'),
      title: itemText(item, 'title', 'label'),
      text: itemText(item, 'text', 'description'),
    }))
    .filter((item) => item.title || item.text)

  if (items.length === 0) return null

  return (
    <Section>
      <SectionHeading title={section.title} subtitle={section.subtitle} />

      <ul className="grid gap-3 sm:grid-cols-3">
        {items.map((item, index) => {
          const Icon = featureIcon(item.icon)

          return (
            <li
              key={`${item.title}-${index}`}
              className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 sm:p-5"
            >
              <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-5" aria-hidden />
              </span>
              {item.title && <p className="text-sm font-semibold sm:text-base">{item.title}</p>}
              {item.text && (
                <p className="text-sm leading-relaxed text-muted-foreground">{item.text}</p>
              )}
            </li>
          )
        })}
      </ul>
    </Section>
  )
}

/** Capa de cada produto citado nos depoimentos, numa consulta só. */
async function productThumbnails(slugs: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(slugs)]
  if (unique.length === 0) return new Map()

  const supabase = await createClient()
  const { data } = await supabase
    .from('products')
    .select('slug, product_images (url, position)')
    .eq('status', 'active')
    .in('slug', unique)

  const rows =
    (data as unknown as { slug: string; product_images: { url: string; position: number }[] | null }[]) ??
    []

  const map = new Map<string, string>()
  for (const row of rows) {
    const cover = [...(row.product_images ?? [])].sort((a, b) => a.position - b.position)[0]
    if (cover?.url) map.set(row.slug, cover.url)
  }

  return map
}

async function ReviewsSection({
  section,
  settings,
}: {
  section: HomepageSection
  settings: StoreSettings
}) {
  // O painel pode desligar os depoimentos sem precisar apagar a seção.
  if (!settings.show_reviews_home) return null

  const reviews = await getRecentReviews(section.product_limit)
  if (reviews.length === 0) return null

  const thumbs = await productThumbnails(
    reviews.map((review) => review.products?.slug).filter((slug): slug is string => Boolean(slug))
  )

  return (
    <Section>
      <SectionHeading title={section.title} subtitle={section.subtitle} />

      <ul className="snap-row [grid-auto-columns:85%] sm:[grid-auto-columns:48%] lg:[grid-auto-columns:32%]">
        {reviews.map((review) => {
          const product = review.products
          const thumb = (product && thumbs.get(product.slug)) || FALLBACK_THUMB

          return (
            <li key={review.id} className="w-full">
              <figure className="flex h-full flex-col gap-3 rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                    {initials(review.customer_name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{review.customer_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(review.created_at)}
                    </p>
                  </div>
                  <RatingStars rating={review.rating} />
                </div>

                <blockquote className="flex-1 text-sm leading-relaxed text-muted-foreground">
                  {review.comment}
                </blockquote>

                {product && (
                  <figcaption>
                    <Link
                      href={`/produto/${product.slug}`}
                      className="flex items-center gap-2 rounded-lg border border-border bg-background/40 p-2 transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="relative size-10 shrink-0 overflow-hidden rounded-md bg-muted">
                        <Image
                          src={thumb}
                          alt=""
                          fill
                          sizes="40px"
                          unoptimized={thumb.endsWith('.svg')}
                          className="object-cover"
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium">{product.name}</span>
                        <span className="block text-[11px] text-muted-foreground">
                          Ver produto
                        </span>
                      </span>
                    </Link>
                  </figcaption>
                )}
              </figure>
            </li>
          )
        })}
      </ul>
    </Section>
  )
}

function FaqSection({ section }: { section: HomepageSection }) {
  const items = configItems(section.config)
    .map((item) => ({
      question: itemText(item, 'q', 'question', 'title'),
      answer: itemText(item, 'a', 'answer', 'text'),
    }))
    .filter((item) => item.question && item.answer)

  if (items.length === 0) return null

  return (
    <Section>
      <SectionHeading title={section.title} subtitle={section.subtitle} />

      <Accordion
        type="single"
        collapsible
        className="mx-auto w-full max-w-3xl rounded-xl border border-border bg-card/40 px-4"
      >
        {items.map((item, index) => (
          <AccordionItem key={`${item.question}-${index}`} value={`faq-${index}`} className="last:border-b-0">
            <AccordionTrigger>{item.question}</AccordionTrigger>
            <AccordionContent>{item.answer}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </Section>
  )
}

function CtaSection({ section }: { section: HomepageSection }) {
  const href = safeHref(configText(section.config, 'link_url') ?? section.link_url)
  const label = configText(section.config, 'link_label') ?? section.link_label ?? 'Ver produtos'

  if (!section.title && !section.subtitle && !href) return null

  return (
    <Section>
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card px-5 py-10 text-center sm:px-8 sm:py-14">
        {section.title && <h2 className="text-xl font-bold sm:text-2xl">{section.title}</h2>}
        {section.subtitle && (
          <p className="max-w-xl text-sm text-muted-foreground sm:text-base">{section.subtitle}</p>
        )}
        {href && (
          <Button asChild size="lg">
            {isExternal(href) ? (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {label}
              </a>
            ) : (
              <Link href={href}>{label}</Link>
            )}
          </Button>
        )}
      </div>
    </Section>
  )
}

function TextSection({ section }: { section: HomepageSection }) {
  // O HTML vem do painel: sanitizado antes de chegar ao dangerouslySetInnerHTML.
  const html = sanitizeHtml(
    configText(section.config, 'html') ?? configText(section.config, 'content')
  )

  if (!html && !section.title) return null

  return (
    <Section>
      <SectionHeading title={section.title} subtitle={section.subtitle} />
      {html && (
        <div className="prose-store max-w-3xl" dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </Section>
  )
}

/* -----------------------------------------------------------------------------
 * Dispatcher
 * -------------------------------------------------------------------------- */

async function HomeSection({
  section,
  settings,
  first,
}: {
  section: HomepageSection
  settings: StoreSettings
  first: boolean
}) {
  switch (section.type) {
    case 'hero':
      return <HeroSection first={first} />
    case 'banner':
      return <BannerSection section={section} />
    case 'categories':
      return <CategoriesSection section={section} />
    case 'collection':
      return <CollectionSection section={section} />
    case 'products':
      return <ProductsSection section={section} />
    case 'features':
      return <FeaturesSection section={section} />
    case 'reviews':
      return <ReviewsSection section={section} settings={settings} />
    case 'faq':
      return <FaqSection section={section} />
    case 'cta':
      return <CtaSection section={section} />
    case 'text':
      return <TextSection section={section} />
    default:
      return null
  }
}

export interface HomeSectionsProps {
  /** Já filtradas por is_active e ordenadas por position. */
  sections: HomepageSection[]
  settings: StoreSettings
}

export function HomeSections({ sections, settings }: HomeSectionsProps) {
  return (
    <>
      {sections.map((section, index) => (
        <HomeSection
          key={section.id}
          section={section}
          settings={settings}
          first={index === 0}
        />
      ))}
    </>
  )
}
