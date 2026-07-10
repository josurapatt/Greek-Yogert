import type { CartItem, OrderDraft, Product, ShopOrder, Topping } from './types'

const bangkokDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
})

export function businessDate(date = new Date()): string { return bangkokDateFormatter.format(date) }

export function formatThaiDateTime(value?: string): string {
  if (!value) return '-'
  return new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export function calculateUnitPrice(product: Product, selectedIds: string[], available: Topping[]): number {
  if (product.optionMode !== 'toppings') return product.price
  return selectedIds.reduce((total, id, index) => {
    const topping = available.find((entry) => entry.id === id)
    if (!topping) return total
    const premium = product.premiumToppingIds ? product.premiumToppingIds.includes(id) : topping.premium
    if (index < product.includedToppings) return total + (premium ? product.premiumIncludedSurcharge : 0)
    return total + (premium ? product.extraPremiumPrice : product.extraNormalPrice)
  }, product.price)
}

export function validateSelection(product: Product, selectedIds: string[]): string | null {
  if (product.optionMode === 'granola' && selectedIds.length !== 1) return 'กรุณาเลือกรสกราโนล่า 1 รส'
  if (product.optionMode === 'toppings' && selectedIds.length < product.includedToppings) return `กรุณาเลือกท็อปปิ้งอย่างน้อย ${product.includedToppings} อย่าง`
  return null
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
  const totals = orderTotals(draft.items, draft.discount)
  return { id, queueNumber, businessDate: businessDate(new Date(now)), customerName: draft.customerName.trim() || 'ลูกค้าทั่วไป', channel: draft.channel, paymentMethod: draft.paymentMethod, status: 'pending', items: draft.items, ...totals, createdAt: now, updatedAt: now, createdBy: userId }
}

export const money = (value: number) => new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 }).format(value)
