import type { ChannelToppingRules, OrderChannel, Product, Topping } from './types'

export const toppings: Topping[] = [
  { id: 'banana', name: 'กล้วย', premium: false },
  { id: 'orange', name: 'ส้ม', premium: false },
  { id: 'dragon-fruit', name: 'แก้วมังกร', premium: false },
  { id: 'apple', name: 'แอปเปิ้ล', premium: false },
  { id: 'grape', name: 'องุ่น', premium: false },
  { id: 'granola-banana', name: 'กราโนล่ารสกล้วย', premium: false },
  { id: 'granola-berry', name: 'กราโนล่ารสเบอร์รี่รวม', premium: false },
  { id: 'granola-chocolate', name: 'กราโนล่ารสช็อกโกแลต', premium: false },
  { id: 'granola-honey', name: 'กราโนล่ารสน้ำผึ้ง', premium: false },
  { id: 'biscoff', name: 'บิสคอฟ', premium: false },
  { id: 'oreo', name: 'โอริโอ้บด', premium: false },
  { id: 'strawberry', name: 'สตรอว์เบอร์รี่', premium: true },
  { id: 'blueberry', name: 'บลูเบอร์รี่', premium: true },
  { id: 'kiwi', name: 'กีวี่', premium: true },
]

const allToppings = toppings.map((topping) => topping.id)
const premiumToppings = toppings.filter((topping) => topping.premium).map((topping) => topping.id)
const granolaOptions = ['กล้วย', 'เบอร์รี่รวม', 'ช็อกโกแลต', 'น้ำผึ้ง']
export const granolaFlavorIdsByName: Record<string, string> = {
  กล้วย: 'granola-banana',
  เบอร์รี่รวม: 'granola-berry',
  ช็อกโกแลต: 'granola-chocolate',
  น้ำผึ้ง: 'granola-honey',
}
const common = { premiumIncludedSurcharge: 5, extraNormalPrice: 10, extraPremiumPrice: 15, active: true }
export const platformExtraToppingIds = ['granola-banana', 'granola-berry', 'granola-chocolate', 'granola-honey', 'biscoff']

const storefrontRules: ChannelToppingRules = {
  allowDuplicateToppings: true,
  premiumIncludedSurcharge: 5,
  allowedExtraToppingIds: allToppings,
  extraNormalPrice: 10,
  extraPremiumPrice: 15,
}

const platformRules: ChannelToppingRules = {
  allowDuplicateToppings: false,
  premiumIncludedSurcharge: 10,
  allowedExtraToppingIds: platformExtraToppingIds,
  extraNormalPrice: 10,
  extraPremiumPrice: 10,
}

const channelConfig = (storefront: number, platform: number) => ({
  channelPrices: { 'หน้าร้าน': storefront, Openchat: storefront, Lineman: platform, Grab: platform } satisfies Record<OrderChannel, number>,
  channelRules: { storefront: storefrontRules, platform: platformRules },
})

export const defaultProducts: Product[] = [
  { ...common, ...channelConfig(69, 89), id: 'apple-ohlala', name: 'Apple Ohlala', price: 69, emoji: '🍎', description: ['กรีกโยเกิร์ต 1 สกู๊ป (65 กรัม)', 'แอปเปิ้ล', 'น้ำผึ้ง', 'กราโนล่า'], optionMode: 'granola', includedToppings: 0, granolaOptions, availableToppingIds: [] },
  { ...common, ...channelConfig(79, 99), id: 'healthy-banana', name: 'Healthy Banana', price: 79, emoji: '🍌', description: ['กรีกโยเกิร์ต 1 สกู๊ป (65 กรัม)', 'กล้วย', 'น้ำผึ้ง', 'บิสคอฟ 1 ชิ้น', 'กราโนล่า'], optionMode: 'granola', includedToppings: 0, granolaOptions, availableToppingIds: [] },
  { ...common, ...channelConfig(59, 79), id: 'plain-greek', name: 'Plain Greek', price: 59, emoji: '🥣', description: ['กรีกโยเกิร์ต 1 สกู๊ป (65 กรัม)', 'คอร์นเฟลกส์', 'น้ำผึ้ง'], optionMode: 'none', includedToppings: 0, granolaOptions: [], availableToppingIds: [] },
  { ...common, ...channelConfig(89, 109), id: 'size-s', name: 'Size S', price: 89, emoji: '🍨', description: ['กรีกโยเกิร์ต 1 สกู๊ป (65 กรัม)', 'คอร์นเฟลกส์', 'น้ำผึ้ง', 'เลือกท็อปปิ้ง 3 อย่าง'], optionMode: 'toppings', includedToppings: 3, granolaOptions: [], availableToppingIds: allToppings, premiumToppingIds: premiumToppings },
  { ...common, ...channelConfig(99, 119), id: 'size-m', name: 'Size M', price: 99, emoji: '🍧', description: ['กรีกโยเกิร์ต 1 สกู๊ป (65 กรัม)', 'คอร์นเฟลกส์', 'น้ำผึ้ง', 'เลือกท็อปปิ้ง 4 อย่าง'], optionMode: 'toppings', includedToppings: 4, granolaOptions: [], availableToppingIds: allToppings, premiumToppingIds: premiumToppings },
  { ...common, ...channelConfig(10, 10), id: 'plain-granola', name: 'กราโนล่าเปล่า', price: 10, emoji: '🥜', description: ['กราโนล่าเปล่า 1 ถ้วย', 'เลือกรสชาติ 1 รส'], optionMode: 'granola', includedToppings: 0, granolaOptions, availableToppingIds: [] },
]

export function normalizeProduct(product: Product): Product {
  const seeded = defaultProducts.find((entry) => entry.id === product.id)
  const basePrice = product.price ?? seeded?.price ?? 0
  const prices = { ...(seeded?.channelPrices ?? {}), ...(product.channelPrices ?? {}) }
  prices['หน้าร้าน'] = product.channelPrices?.['หน้าร้าน'] ?? basePrice
  prices.Openchat = product.channelPrices?.Openchat ?? prices['หน้าร้าน']
  prices.Lineman = product.channelPrices?.Lineman ?? seeded?.channelPrices?.Lineman ?? basePrice
  prices.Grab = product.channelPrices?.Grab ?? seeded?.channelPrices?.Grab ?? prices.Lineman
  return {
    ...(seeded ?? {}), ...product, price: prices['หน้าร้าน'], channelPrices: prices,
    channelRules: {
      storefront: {
        ...storefrontRules, ...(seeded?.channelRules?.storefront ?? {}),
        premiumIncludedSurcharge: product.premiumIncludedSurcharge,
        allowedExtraToppingIds: product.availableToppingIds,
        extraNormalPrice: product.extraNormalPrice,
        extraPremiumPrice: product.extraPremiumPrice,
        ...(product.channelRules?.storefront ?? {}),
      },
      platform: { ...platformRules, ...(seeded?.channelRules?.platform ?? {}), ...(product.channelRules?.platform ?? {}) },
    },
  }
}

export function mergeProducts(products: Product[]): Product[] {
  const rows = products.map(normalizeProduct)
  const ids = new Set(rows.map((product) => product.id))
  return [...rows, ...defaultProducts.filter((product) => !ids.has(product.id)).map(normalizeProduct)]
}
