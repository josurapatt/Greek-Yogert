import { granolaFlavorIdsByName, platformExtraToppingIds } from './data'
import type { CartItem, ChannelGroup, ChannelToppingRules, OrderChannel, OrderDraft, PaymentMethod, PriceBreakdown, Product, ShopOrder, Topping, ToppingAvailability, ToppingPackaging } from './types'

const bangkokDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
})

export function businessDate(date = new Date()): string { return bangkokDateFormatter.format(date) }

export function formatThaiDateTime(value?: string): string {
  if (!value) return '-'
  return new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export const orderChannels: OrderChannel[] = ['หน้าร้าน', 'Openchat', 'Lineman', 'Grab']
export const channelLabels: Record<OrderChannel, string> = { 'หน้าร้าน': 'หน้าร้าน', Openchat: 'OpenChat', Lineman: 'LINE MAN', Grab: 'Grab' }
export const paymentMethodLabels: Record<PaymentMethod, string> = { สด: 'สด', โอน: 'โอน', โครงการ: 'โครงการ', Platform: 'Platform' }
export const separatedPackagingAvailabilityId = 'separated-topping-packaging'
export const toppingPackagingLabels: Record<ToppingPackaging, string> = { included: 'ใส่ท็อปปิ้งเลย', separated: 'แยกท็อปปิ้ง' }

export function normalizeToppingPackaging(value?: unknown): ToppingPackaging {
  return value === 'separated' ? 'separated' : 'included'
}

export function isValidToppingPackaging(value?: unknown): boolean {
  return value === undefined || value === 'included' || value === 'separated'
}

export function toppingPackagingLabel(item: Pick<CartItem, 'toppingPackaging' | 'toppingPackagingLabel'>): string {
  return item.toppingPackagingLabel ?? toppingPackagingLabels[normalizeToppingPackaging(item.toppingPackaging)]
}

export function productSupportsSeparatedPackaging(product: Product): boolean {
  return product.supportsSeparatedToppingPackaging !== false
}

export function separatedPackagingAvailabilityError(product: Product, availability: ToppingAvailability = {}): string | null {
  if (availability[separatedPackagingAvailabilityId] === false) return 'แยกท็อปปิ้งหมดชั่วคราว'
  if (!productSupportsSeparatedPackaging(product)) return 'สินค้านี้ไม่รองรับแยกท็อปปิ้ง'
  return null
}

export function packagingSurchargePerUnit(channel: OrderChannel, packaging: ToppingPackaging): number {
  return packaging === 'separated' && getChannelGroup(channel) === 'platform' ? 5 : 0
}

export function paymentMethodLabel(value?: string): string {
  return value && value in paymentMethodLabels ? paymentMethodLabels[value as PaymentMethod] : 'ไม่ระบุ'
}

export function orderPaymentMethods(order: ShopOrder): PaymentMethod[] {
  const lineMethods = order.items.flatMap((item) => item.paymentMethod ? [item.paymentMethod] : [])
  const methods = lineMethods.length ? lineMethods : order.paymentMethods?.length ? order.paymentMethods : order.paymentMethod ? [order.paymentMethod] : []
  return [...new Set(methods)]
}

export function orderPaymentLabel(order: ShopOrder): string {
  const methods = orderPaymentMethods(order)
  return methods.length ? methods.map(paymentMethodLabel).join(' + ') : paymentMethodLabel()
}


export function paymentMethodsForChannel(channel: OrderChannel): PaymentMethod[] {
  return getChannelGroup(channel) === 'platform' ? ['Platform'] : ['สด', 'โอน', 'โครงการ']
}

export function normalizePaymentMethod(channel: OrderChannel, current?: PaymentMethod): PaymentMethod {
  const allowed = paymentMethodsForChannel(channel)
  return current && allowed.includes(current) ? current : allowed[0]
}

export function validatePaymentMethod(channel: OrderChannel, paymentMethod: PaymentMethod): string | null {
  return paymentMethodsForChannel(channel).includes(paymentMethod) ? null : 'วิธีชำระเงินไม่ตรงกับช่องทางการขาย'
}

export function availabilityIdForSelection(product: Product, selectionId: string): string {
  return product.optionMode === 'granola' ? granolaFlavorIdsByName[selectionId] ?? selectionId : selectionId
}

export function isSelectionAvailable(product: Product, selectionId: string, availability: ToppingAvailability = {}): boolean {
  return availability[availabilityIdForSelection(product, selectionId)] !== false
}

export function getChannelGroup(channel: OrderChannel): ChannelGroup {
  return channel === 'Lineman' || channel === 'Grab' ? 'platform' : 'storefront'
}

export function getProductPrice(product: Product, channel: OrderChannel): number {
  if (channel === 'หน้าร้าน') return product.channelPrices?.[channel] ?? product.price
  if (channel === 'Openchat') return product.channelPrices?.Openchat ?? product.channelPrices?.['หน้าร้าน'] ?? product.price
  if (channel === 'Grab') return product.channelPrices?.Grab ?? product.channelPrices?.Lineman ?? product.price
  return product.channelPrices?.Lineman ?? product.price
}

export function getChannelRules(product: Product, channel: OrderChannel): ChannelToppingRules {
  const group = getChannelGroup(channel)
  const configured = product.channelRules?.[group]
  if (configured) return configured
  if (group === 'platform') return {
    allowDuplicateToppings: false, premiumIncludedSurcharge: 10,
    allowedExtraToppingIds: platformExtraToppingIds, extraNormalPrice: 10, extraPremiumPrice: 10,
  }
  return {
    allowDuplicateToppings: true,
    premiumIncludedSurcharge: product.premiumIncludedSurcharge,
    allowedExtraToppingIds: product.availableToppingIds,
    extraNormalPrice: product.extraNormalPrice,
    extraPremiumPrice: product.extraPremiumPrice,
  }
}

export function calculatePriceBreakdown(product: Product, selectedIds: string[], available: Topping[], channel: OrderChannel): PriceBreakdown {
  const basePrice = getProductPrice(product, channel)
  if (product.optionMode !== 'toppings') return { basePrice, premiumIncludedSurcharge: 0, extraToppingCharges: 0, unitPrice: basePrice }
  const rules = getChannelRules(product, channel)
  let premiumIncludedSurcharge = 0
  let extraToppingCharges = 0
  selectedIds.forEach((id, index) => {
    const topping = available.find((entry) => entry.id === id)
    if (!topping) return
    const premium = product.premiumToppingIds ? product.premiumToppingIds.includes(id) : topping.premium
    if (index < product.includedToppings) premiumIncludedSurcharge += premium ? rules.premiumIncludedSurcharge : 0
    else if (rules.allowedExtraToppingIds.includes(id)) extraToppingCharges += premium ? rules.extraPremiumPrice : rules.extraNormalPrice
  })
  return { basePrice, premiumIncludedSurcharge, extraToppingCharges, unitPrice: basePrice + premiumIncludedSurcharge + extraToppingCharges }
}

export function calculateUnitPrice(product: Product, selectedIds: string[], available: Topping[], channel: OrderChannel = 'หน้าร้าน'): number {
  return calculatePriceBreakdown(product, selectedIds, available, channel).unitPrice
}

export function validateSelection(product: Product, selectedIds: string[], channel: OrderChannel = 'หน้าร้าน', availability: ToppingAvailability = {}): string | null {
  if (product.optionMode === 'granola' && selectedIds.length !== 1) return 'กรุณาเลือกรสกราโนล่า 1 รส'
  if (product.optionMode === 'toppings' && selectedIds.length < product.includedToppings) return `กรุณาเลือกท็อปปิ้งอย่างน้อย ${product.includedToppings} อย่าง`
  if (selectedIds.some((id) => !isSelectionAvailable(product, id, availability))) return 'ตัวเลือกที่เลือกหมด กรุณาเลือกใหม่'
  if (product.optionMode === 'toppings') {
    const rules = getChannelRules(product, channel)
    if (!rules.allowDuplicateToppings && new Set(selectedIds).size !== selectedIds.length) return 'ช่องทางนี้ไม่อนุญาตให้เลือกท็อปปิ้งซ้ำ'
    const unsupported = selectedIds.slice(product.includedToppings).find((id) => !rules.allowedExtraToppingIds.includes(id))
    if (unsupported) return 'ช่องทางนี้เพิ่มพิเศษได้เฉพาะกราโนล่าและบิสคอฟ'
  }
  return null
}

export function priceCartItem(item: CartItem, product: Product, channel: OrderChannel, available: Topping[], availability: ToppingAvailability = {}): CartItem {
  const priceBreakdown = calculatePriceBreakdown(product, item.selectedOptionIds, available, channel)
  const packaging = normalizeToppingPackaging(item.toppingPackaging)
  const packagingValueError = isValidToppingPackaging(item.toppingPackaging) ? null : 'รูปแบบท็อปปิ้งไม่ถูกต้อง'
  const packagingError = packaging === 'separated' ? separatedPackagingAvailabilityError(product, availability) : null
  const packagingSurcharge = packagingSurchargePerUnit(channel, packaging)
  const unavailable = item.selectedOptionIds.flatMap((id, index) => isSelectionAvailable(product, id, availability) ? [] : [item.selectedOptions[index] ?? available.find((entry) => entry.id === id)?.name ?? id])
  const validationError = unavailable.length ? `หมด: ${unavailable.join(', ')}` : validateSelection(product, item.selectedOptionIds, channel, availability) ?? packagingValueError ?? packagingError
  const unitPrice = priceBreakdown.unitPrice + packagingSurcharge
  const priced: CartItem = {
    ...item, productName: product.name, basePrice: priceBreakdown.basePrice,
    selectedChannel: channel, priceBreakdown, unitPrice,
    toppingPackaging: packaging, toppingPackagingLabel: toppingPackagingLabels[packaging],
    packagingSurchargePerUnit: packagingSurcharge,
    packagingSurchargeTotal: packagingSurcharge * item.quantity,
    lineTotal: unitPrice * item.quantity,
  }
  if (validationError) priced.validationError = validationError
  else delete priced.validationError
  return priced
}

export function applyCartItemUpdate(item: CartItem, patch: Partial<CartItem>): CartItem {
  const quantity = patch.quantity ?? item.quantity
  const unitPrice = patch.unitPrice ?? item.unitPrice
  const packagingSurcharge = patch.packagingSurchargePerUnit ?? item.packagingSurchargePerUnit ?? 0
  const updated: CartItem = {
    ...item,
    ...patch,
    lineTotal: unitPrice * quantity,
    packagingSurchargeTotal: packagingSurcharge * quantity,
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'validationError') && !patch.validationError) delete updated.validationError
  return updated
}

export function repriceCartItems(items: CartItem[], products: Product[], channel: OrderChannel, available: Topping[], availability: ToppingAvailability = {}): CartItem[] {
  return items.map((item) => {
    const product = products.find((entry) => entry.id === item.productId)
    return product ? priceCartItem(item, product, channel, available, availability) : { ...item, selectedChannel: channel, validationError: 'ไม่พบสินค้านี้ในเมนูปัจจุบัน' }
  })
}

export function prepareOrderItems(items: CartItem[], products: Product[], channel: OrderChannel, available: Topping[], availability: ToppingAvailability = {}): CartItem[] {
  const priced = repriceCartItems(items, products, channel, available, availability)
  const invalid = priced.find((item) => item.validationError)
  if (invalid) throw new Error(`${invalid.productName}: ${invalid.validationError}`)
  return priced.map((item) => {
    const prepared = { ...item, selectedChannel: channel, lineTotal: item.unitPrice * item.quantity, packagingSurchargeTotal: (item.packagingSurchargePerUnit ?? 0) * item.quantity }
    delete prepared.validationError
    return prepared
  })
}

export function orderTotals(items: CartItem[], discount = 0) {
  const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
  const safeDiscount = Math.max(0, Math.min(discount, subtotal))
  return { subtotal, discount: safeDiscount, total: subtotal - safeDiscount }
}

export function nextLocalQueue(orders: ShopOrder[], date = businessDate()): { sequence: number; id: string; queue: string } {
  const sequence = orders.filter((order) => order.businessDate === date)
    .reduce((max, order) => Math.max(max, Number(order.queueNumber.replace(/\D/g, '')) || 0), 0) + 1
  const padded = String(sequence).padStart(3, '0')
  return { sequence, id: `${date.replaceAll('-', '')}-${padded}`, queue: `Q${padded}` }
}

export function createOrder(draft: OrderDraft, id: string, queueNumber: string, userId?: string): ShopOrder {
  const now = new Date().toISOString()
  const items = draft.items.map((item) => {
    const packaging = normalizeToppingPackaging(item.toppingPackaging)
    const packagingSurcharge = item.packagingSurchargePerUnit ?? packagingSurchargePerUnit(draft.channel, packaging)
    const snapshot = { ...item, selectedChannel: item.selectedChannel ?? draft.channel, toppingPackaging: packaging, toppingPackagingLabel: item.toppingPackagingLabel ?? toppingPackagingLabels[packaging], packagingSurchargePerUnit: packagingSurcharge, packagingSurchargeTotal: packagingSurcharge * item.quantity, lineTotal: item.unitPrice * item.quantity }
    delete snapshot.validationError
    if (snapshot.priceBreakdown === undefined) delete snapshot.priceBreakdown
    return snapshot
  })
  const totals = orderTotals(items, draft.discount)
  const order: ShopOrder = { id, queueNumber, businessDate: businessDate(new Date(now)), customerName: draft.customerName.trim() || 'ลูกค้าทั่วไป', channel: draft.channel, paymentMethod: draft.paymentMethod, status: 'pending', items, ...totals, createdAt: now, updatedAt: now }
  if (userId) order.createdBy = userId
  return order
}

export const money = (value: number) => new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 }).format(value)
