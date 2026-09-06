'use client'

import * as React from 'react'
import type { CartItem } from '@/lib/types/database.types'

/**
 * O carrinho vive no navegador, não no banco: evita uma escrita a cada clique
 * e deixa o visitante montar o pedido sem login. O preço guardado aqui é só
 * para exibição — quem cobra é a RPC create_order, que recalcula tudo no
 * servidor a partir do product_id.
 */

const STORAGE_KEY = 'roblox-store-cart'
const STORAGE_VERSION = 1
const DEFAULT_MAX_QUANTITY = 99

/** Ao adicionar, a quantidade é opcional — o padrão é 1. */
export type CartItemInput = Omit<CartItem, 'quantity'> & { quantity?: number }

interface CartState {
  items: CartItem[]
  isOpen: boolean
  /**
   * Falso até o localStorage ser lido. Vive no reducer, e não num useState
   * separado, para que a hidratação seja UMA transição de estado só — chamar
   * setState dentro do efeito causaria um segundo render e é o que a regra
   * react-hooks/set-state-in-effect aponta.
   */
  isHydrated: boolean
}

type CartAction =
  | { type: 'hydrate'; items: CartItem[] }
  | { type: 'replace'; items: CartItem[] }
  | { type: 'add'; item: CartItemInput; quantity: number }
  | { type: 'remove'; productId: string }
  | { type: 'setQuantity'; productId: string; quantity: number }
  | { type: 'clear' }
  | { type: 'open' }
  | { type: 'close' }
  | { type: 'toggle' }

const initialState: CartState = { items: [], isOpen: false, isHydrated: false }

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** Um teto ausente ou inválido vira 99; zero e negativo significam esgotado. */
function toMaxQuantity(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_MAX_QUANTITY
  const max = Math.trunc(value)
  return max > 0 ? max : 0
}

function toPositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const int = Math.trunc(value)
  return int > 0 ? int : fallback
}

function reducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    /**
     * O storage é lido depois da primeira pintura. Se o visitante já clicou
     * em "adicionar" nesse intervalo, o que está na memória tem que sobreviver
     * — por isso hidratar é mesclar, não substituir.
     */
    case 'hydrate': {
      if (state.items.length === 0) return { ...state, items: action.items, isHydrated: true }

      const merged = [...action.items]
      for (const pending of state.items) {
        const index = merged.findIndex((item) => item.product_id === pending.product_id)
        if (index === -1) {
          merged.push(pending)
          continue
        }
        const current = merged[index]
        merged[index] = {
          ...current,
          quantity: clamp(current.quantity + pending.quantity, 1, current.max_quantity),
        }
      }
      return { ...state, items: merged, isHydrated: true }
    }

    /** Outra aba já gravou o estado completo: aqui é espelho, não soma. */
    case 'replace':
      return { ...state, items: action.items }

    case 'add': {
      const max = toMaxQuantity(action.item.max_quantity)
      if (max <= 0) return state

      const quantity = clamp(action.quantity, 1, max)
      const index = state.items.findIndex((item) => item.product_id === action.item.product_id)

      if (index === -1) {
        const item: CartItem = { ...action.item, max_quantity: max, quantity }
        return { ...state, items: [...state.items, item] }
      }

      const items = [...state.items]
      const current = items[index]
      // Nome, preço e estoque vêm da página que acabou de renderizar: mais
      // frescos que os do storage, que podem ter semanas.
      items[index] = {
        ...current,
        ...action.item,
        max_quantity: max,
        quantity: clamp(current.quantity + quantity, 1, max),
      }
      return { ...state, items }
    }

    case 'remove':
      return { ...state, items: state.items.filter((item) => item.product_id !== action.productId) }

    case 'setQuantity': {
      if (action.quantity <= 0) {
        return {
          ...state,
          items: state.items.filter((item) => item.product_id !== action.productId),
        }
      }
      return {
        ...state,
        items: state.items.map((item) =>
          item.product_id === action.productId
            ? { ...item, quantity: clamp(Math.trunc(action.quantity), 1, item.max_quantity) }
            : item
        ),
      }
    }

    case 'clear':
      return { ...state, items: [] }

    case 'open':
      return { ...state, isOpen: true }

    case 'close':
      return { ...state, isOpen: false }

    case 'toggle':
      return { ...state, isOpen: !state.isOpen }

    default:
      return state
  }
}

/** Só entra no carrinho o que ainda parece um item de carrinho. */
function parseItem(value: unknown): CartItem | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>

  if (typeof raw.product_id !== 'string' || raw.product_id.length === 0) return null
  if (typeof raw.name !== 'string') return null
  if (typeof raw.price_cents !== 'number' || !Number.isFinite(raw.price_cents)) return null

  const max = toPositiveInt(raw.max_quantity, DEFAULT_MAX_QUANTITY)

  return {
    product_id: raw.product_id,
    slug: typeof raw.slug === 'string' ? raw.slug : '',
    name: raw.name,
    price_cents: Math.trunc(raw.price_cents),
    compare_at_cents:
      typeof raw.compare_at_cents === 'number' && Number.isFinite(raw.compare_at_cents)
        ? Math.trunc(raw.compare_at_cents)
        : null,
    image_url: typeof raw.image_url === 'string' ? raw.image_url : null,
    quantity: clamp(toPositiveInt(raw.quantity, 1), 1, max),
    max_quantity: max,
  }
}

/** JSON corrompido, storage bloqueado ou versão antiga: carrinho vazio, sem barulho. */
function readStorage(): CartItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []

    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return []

    const payload = parsed as { v?: unknown; items?: unknown }
    if (payload.v !== STORAGE_VERSION || !Array.isArray(payload.items)) return []

    return payload.items
      .map(parseItem)
      .filter((item): item is CartItem => item !== null)
      .slice(0, 100)
  } catch {
    return []
  }
}

function writeStorage(items: CartItem[]): void {
  try {
    const payload = JSON.stringify({ v: STORAGE_VERSION, items })
    // Gravar o que já está lá dispararia o evento `storage` de volta na aba
    // que originou a mudança — e as duas abas ficariam se reescrevendo.
    if (window.localStorage.getItem(STORAGE_KEY) === payload) return
    window.localStorage.setItem(STORAGE_KEY, payload)
  } catch {
    // Modo privado ou cota estourada: o carrinho segue funcionando na memória.
  }
}

export interface CartContextValue {
  items: CartItem[]
  isOpen: boolean
  /** Falso até o localStorage ser lido — não renderize contagens antes disso. */
  isHydrated: boolean
  itemCount: number
  subtotalCents: number
  addItem: (item: CartItemInput, quantity?: number) => void
  removeItem: (productId: string) => void
  updateQuantity: (productId: string, quantity: number) => void
  clear: () => void
  openCart: () => void
  closeCart: () => void
  toggleCart: () => void
}

const CartContext = React.createContext<CartContextValue | null>(null)

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = React.useReducer(reducer, initialState)
  const isHydrated = state.isHydrated

  // Ler no efeito, nunca no render: o servidor não tem localStorage e a
  // hidratação quebraria com HTML diferente do primeiro paint do cliente.
  React.useEffect(() => {
    dispatch({ type: 'hydrate', items: readStorage() })
  }, [])

  // Só grava depois de ter lido. Sem essa guarda, o primeiro render (carrinho
  // vazio, antes da hidratação) apagaria o carrinho salvo.
  React.useEffect(() => {
    if (!isHydrated) return
    writeStorage(state.items)
  }, [state.items, isHydrated])

  // Outra aba mexeu no carrinho: reflete aqui em vez de sobrescrever depois.
  React.useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== STORAGE_KEY) return
      dispatch({ type: 'replace', items: readStorage() })
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const addItem = React.useCallback((item: CartItemInput, quantity?: number) => {
    dispatch({ type: 'add', item, quantity: toPositiveInt(quantity ?? item.quantity, 1) })
  }, [])

  const removeItem = React.useCallback((productId: string) => {
    dispatch({ type: 'remove', productId })
  }, [])

  const updateQuantity = React.useCallback((productId: string, quantity: number) => {
    dispatch({ type: 'setQuantity', productId, quantity })
  }, [])

  const clear = React.useCallback(() => dispatch({ type: 'clear' }), [])
  const openCart = React.useCallback(() => dispatch({ type: 'open' }), [])
  const closeCart = React.useCallback(() => dispatch({ type: 'close' }), [])
  const toggleCart = React.useCallback(() => dispatch({ type: 'toggle' }), [])

  const { items, isOpen } = state

  const itemCount = React.useMemo(
    () => items.reduce((total, item) => total + item.quantity, 0),
    [items]
  )

  const subtotalCents = React.useMemo(
    () => items.reduce((total, item) => total + item.price_cents * item.quantity, 0),
    [items]
  )

  const value = React.useMemo<CartContextValue>(
    () => ({
      items,
      isOpen,
      isHydrated,
      itemCount,
      subtotalCents,
      addItem,
      removeItem,
      updateQuantity,
      clear,
      openCart,
      closeCart,
      toggleCart,
    }),
    [
      items,
      isOpen,
      isHydrated,
      itemCount,
      subtotalCents,
      addItem,
      removeItem,
      updateQuantity,
      clear,
      openCart,
      closeCart,
      toggleCart,
    ]
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): CartContextValue {
  const context = React.useContext(CartContext)
  if (!context) {
    throw new Error('useCart() precisa estar dentro de <CartProvider>. Envolva o layout com ele.')
  }
  return context
}
