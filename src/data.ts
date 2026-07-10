import type { Product, Topping } from './types'

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
const common = { premiumIncludedSurcharge: 5, extraNormalPrice: 10, extraPremiumPrice: 15, active: true }

export const defaultProducts: Product[] = [
  { ...common, id: 'apple-ohlala', name: 'Apple Ohlala', price: 69, emoji: '🍎', description: ['กรีกโยเกิร์ต 1 สกู๊ป (65 กรัม)', 'แอปเปิ้ล', 'น้ำผึ้ง', 'กราโนล่า'], optionMode: 'granola', includedToppings: 0, granolaOptions, availableToppingIds: [] },
  { ...common, id: 'healthy-banana', name: 'Healthy Banana', price: 79, emoji: '🍌', description: ['กรีกโยเกิร์ต 1 สกู๊ป (65 กรัม)', 'กล้วย', 'น้ำผึ้ง', 'บิสคอฟ 1 ชิ้น', 'กราโนล่า'], optionMode: 'granola', includedToppings: 0, granolaOptions, availableToppingIds: [] },
  { ...common, id: 'plain-greek', name: 'Plain Greek', price: 59, emoji: '🥣', description: ['กรีกโยเกิร์ต 1 สกู๊ป (65 กรัม)', 'คอร์นเฟลกส์', 'น้ำผึ้ง'], optionMode: 'none', includedToppings: 0, granolaOptions: [], availableToppingIds: [] },
  { ...common, id: 'size-s', name: 'Size S', price: 89, emoji: '🍨', description: ['กรีกโยเกิร์ต 1 สกู๊ป (65 กรัม)', 'คอร์นเฟลกส์', 'น้ำผึ้ง', 'เลือกท็อปปิ้ง 3 อย่าง'], optionMode: 'toppings', includedToppings: 3, granolaOptions: [], availableToppingIds: allToppings, premiumToppingIds: premiumToppings },
  { ...common, id: 'size-m', name: 'Size M', price: 99, emoji: '🍧', description: ['กรีกโยเกิร์ต 1 สกู๊ป (65 กรัม)', 'คอร์นเฟลกส์', 'น้ำผึ้ง', 'เลือกท็อปปิ้ง 4 อย่าง'], optionMode: 'toppings', includedToppings: 4, granolaOptions: [], availableToppingIds: allToppings, premiumToppingIds: premiumToppings },
]
