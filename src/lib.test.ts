import { describe, expect, it } from 'vitest'
import { defaultProducts, toppings } from './data'
import { calculateUnitPrice, createOrder, nextLocalQueue, validateSelection } from './lib'

describe('pricing and order rules', () => {
  const sizeS = defaultProducts.find((product) => product.id === 'size-s')!
  it('adds premium surcharge within included toppings', () => {
    expect(calculateUnitPrice(sizeS, ['banana', 'strawberry', 'kiwi'], toppings)).toBe(99)
  })
  it('adds correct extra topping prices and supports duplicates', () => {
    expect(calculateUnitPrice(sizeS, ['banana', 'banana', 'banana', 'banana', 'blueberry'], toppings)).toBe(114)
  })
  it('requires the included topping count', () => {
    expect(validateSelection(sizeS, ['banana', 'apple'])).toContain('3')
    expect(validateSelection(sizeS, ['banana', 'apple', 'grape'])).toBeNull()
  })
  it('generates next daily queue and transforms a draft', () => {
    const first = createOrder({ customerName: '', channel: 'หน้าร้าน', paymentMethod: 'สด', items: [] }, '20260710-001', 'Q001')
    expect(nextLocalQueue([{ ...first, businessDate: '2026-07-10' }], '2026-07-10')).toEqual({ sequence: 2, id: '20260710-002', queue: 'Q002' })
    expect(first.customerName).toBe('ลูกค้าทั่วไป')
  })
})
