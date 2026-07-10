import { initializeApp } from 'firebase/app'
import { doc, getFirestore, Timestamp, writeBatch } from 'firebase/firestore'
import { describe, expect, it } from 'vitest'
import { defaultProducts, normalizeProduct, toppings } from './data'
import { toFirestoreData } from './firestoreData'
import { createOrder, nextLocalQueue, prepareOrderItems } from './lib'
import { buildOrderExportRows, completedSalesSummary } from './reporting'
import type { CartItem, OrderChannel, Product, ShopOrder } from './types'

const firestore = getFirestore(initializeApp({ projectId: 'order-serializer-test' }, 'order-serializer-test'))

const findUndefinedPaths = (value: unknown, path = ''): string[] => {
  if (value === undefined) return [path || '<root>']
  if (Array.isArray(value)) return value.flatMap((entry, index) => findUndefinedPaths(entry, `${path}[${index}]`))
  if (!value || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([key, entry]) => findUndefinedPaths(entry, path ? `${path}.${key}` : key))
}

const cartItem = (product: Product, selectedOptionIds: string[]): CartItem => ({
  id: `cart-${product.id}`,
  productId: product.id,
  productName: product.name,
  basePrice: product.price,
  selectedOptions: selectedOptionIds.map((id) => toppings.find((entry) => entry.id === id)?.name ?? id),
  selectedOptionIds,
  quantity: 1,
  unitPrice: product.price,
})

const orderFor = (
  productId: string,
  channel: OrderChannel,
  selectedOptionIds: string[],
  products = defaultProducts,
  userId: string | null = 'production-user',
): ShopOrder => {
  const product = products.find((entry) => entry.id === productId)
  if (!product) throw new Error(`Missing product ${productId}`)
  const items = prepareOrderItems([cartItem(product, selectedOptionIds)], products, channel, toppings)
  return toFirestoreData(createOrder(
    { customerName: 'ลูกค้า', channel, paymentMethod: channel === 'Lineman' || channel === 'Grab' ? 'Platform' : 'สด', items },
    '20260711-001',
    'Q001',
    userId ?? undefined,
  ))
}

const expectFirestoreAccepts = (order: ShopOrder) => {
  expect(() => writeBatch(firestore).set(doc(firestore, 'orders', order.id), order)).not.toThrow()
  expect(findUndefinedPaths(order)).toEqual([])
}

describe('Firestore order serialization regression', () => {
  it('serializes storefront Apple Ohlala at 69 THB', () => {
    const product = defaultProducts.find((entry) => entry.id === 'apple-ohlala')!
    const order = orderFor(product.id, 'หน้าร้าน', [product.granolaOptions[0]])
    expect(order.items[0].unitPrice).toBe(69)
    expectFirestoreAccepts(order)
  })

  it('serializes an Openchat order at storefront pricing', () => {
    const product = defaultProducts.find((entry) => entry.id === 'apple-ohlala')!
    const order = orderFor(product.id, 'Openchat', [product.granolaOptions[0]])
    expect(order.items[0].unitPrice).toBe(69)
    expectFirestoreAccepts(order)
  })

  it('serializes LINE MAN Size S with platform premium pricing', () => {
    const order = orderFor('size-s', 'Lineman', ['strawberry', 'banana', 'orange'])
    expect(order.items[0].priceBreakdown).toEqual({
      basePrice: 109,
      premiumIncludedSurcharge: 10,
      extraToppingCharges: 0,
      unitPrice: 119,
    })
    expectFirestoreAccepts(order)
  })

  it('serializes Grab Size M with platform premium pricing', () => {
    const order = orderFor('size-m', 'Grab', ['strawberry', 'banana', 'orange', 'apple'])
    expect(order.items[0].unitPrice).toBe(129)
    expectFirestoreAccepts(order)
  })

  it('serializes Plain Greek without optional selections', () => {
    const order = orderFor('plain-greek', 'หน้าร้าน', [])
    expect(order.items[0].unitPrice).toBe(59)
    expect(order.items[0].selectedOptionIds).toEqual([])
    expectFirestoreAccepts(order)
  })

  it('serializes Plain Granola with one selected flavor', () => {
    const product = defaultProducts.find((entry) => entry.id === 'plain-granola')!
    const flavor = product.granolaOptions[2]
    const order = orderFor(product.id, 'Grab', [flavor])
    expect(order.items[0].unitPrice).toBe(10)
    expect(order.items[0].selectedOptionIds).toEqual([flavor])
    expectFirestoreAccepts(order)
  })

  it('serializes a platform product with no extra toppings', () => {
    const order = orderFor('size-s', 'Lineman', ['banana', 'orange', 'apple'])
    expect(order.items[0].priceBreakdown?.extraToppingCharges).toBe(0)
    expect(order.items[0].unitPrice).toBe(109)
    expectFirestoreAccepts(order)
  })

  it('serializes a product containing legacy Firestore fields only', () => {
    const legacy = normalizeProduct({
      id: 'legacy-only', name: 'Legacy', price: 42, emoji: '🥣', description: [], optionMode: 'none',
      includedToppings: 0, granolaOptions: [], availableToppingIds: [], premiumIncludedSurcharge: 5,
      extraNormalPrice: 10, extraPremiumPrice: 15, active: true,
    })
    const order = orderFor(legacy.id, 'Grab', [], [...defaultProducts, legacy])
    expect(order.items[0].unitPrice).toBe(42)
    expectFirestoreAccepts(order)
  })

  it('preserves empty optional arrays as empty arrays', () => {
    const order = orderFor('plain-greek', 'Openchat', [])
    expect(order.items[0].selectedOptions).toEqual([])
    expect(order.items[0].selectedOptionIds).toEqual([])
    expectFirestoreAccepts(order)
  })

  it('omits optional fields instead of storing undefined', () => {
    const order = orderFor('plain-greek', 'หน้าร้าน', [], defaultProducts, null)
    expect(order).not.toHaveProperty('createdBy')
    expect(order.items[0]).not.toHaveProperty('validationError')
    expectFirestoreAccepts(order)
  })

  it('recursively omits undefined object fields while preserving Firebase values', () => {
    const timestamp = Timestamp.now()
    const cleaned = toFirestoreData({
      keepZero: 0,
      keepFalse: false,
      optional: undefined,
      nested: { keep: 'value', optional: undefined },
      items: [{ keep: 1, optional: undefined }],
      timestamp,
    })
    expect(cleaned).toEqual({ keepZero: 0, keepFalse: false, nested: { keep: 'value' }, items: [{ keep: 1 }], timestamp })
    expect(cleaned.timestamp).toBe(timestamp)
    expect(findUndefinedPaths(cleaned)).toEqual([])
  })

  it('rejects undefined array entries rather than changing array meaning', () => {
    expect(() => toFirestoreData({ items: ['kept', undefined] })).toThrow('items[1]')
  })

  it('accepts the reported transaction order payload for orders/20260711-001', () => {
    const product = defaultProducts.find((entry) => entry.id === 'apple-ohlala')!
    const order = orderFor(product.id, 'หน้าร้าน', [product.granolaOptions[0]])
    expect(order.id).toBe('20260711-001')
    expect(order.items[0]).not.toHaveProperty('validationError')
    expectFirestoreAccepts(order)
  })

  it('keeps queue identifiers sequential without overwriting an existing order', () => {
    const first = orderFor('plain-greek', 'หน้าร้าน', [])
    const next = nextLocalQueue([{ ...first, businessDate: '2026-07-11' }], '2026-07-11')
    expect(next).toEqual({ sequence: 2, id: '20260711-002', queue: 'Q002' })
  })

  it('keeps resulting orders readable by reports and history snapshots', () => {
    const pending = orderFor('plain-granola', 'Grab', [defaultProducts.find((entry) => entry.id === 'plain-granola')!.granolaOptions[0]])
    const completed: ShopOrder = { ...pending, status: 'completed', completedAt: new Date().toISOString() }
    expect(completedSalesSummary([completed])).toMatchObject({ sales: 10, cups: 1 })
    const rows = buildOrderExportRows([completed])
    expect(rows).toHaveLength(1)
    expect(rows[0]['ยอดรวมรายการ']).toBe(10)
  })
})
