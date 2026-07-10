export type OrderStatus = 'pending' | 'completed' | 'cancelled'
export type OrderChannel = 'หน้าร้าน' | 'Openchat' | 'Lineman' | 'Grab'
export type PaymentMethod = 'สด' | 'โอน' | 'โครงการ' | 'Platform'
export type OptionMode = 'none' | 'granola' | 'toppings'

export interface Topping { id: string; name: string; premium: boolean }

export interface Product {
  id: string; name: string; price: number; emoji: string; description: string[]
  optionMode: OptionMode; includedToppings: number; granolaOptions: string[]
  availableToppingIds: string[]; premiumToppingIds?: string[]; premiumIncludedSurcharge: number
  extraNormalPrice: number; extraPremiumPrice: number; active: boolean
}

export interface CartItem {
  id: string; productId: string; productName: string; basePrice: number
  selectedOptions: string[]; selectedOptionIds: string[]; quantity: number; unitPrice: number
}

export interface ShopOrder {
  id: string; queueNumber: string; businessDate: string; customerName: string
  channel: OrderChannel; paymentMethod: PaymentMethod; status: OrderStatus
  items: CartItem[]; subtotal: number; discount: number; total: number
  createdAt: string; updatedAt: string; completedAt?: string; cancelledAt?: string; createdBy?: string
}

export interface OrderDraft {
  customerName: string; channel: OrderChannel; paymentMethod: PaymentMethod
  items: CartItem[]; discount?: number
}
