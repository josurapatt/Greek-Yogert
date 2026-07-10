import { Minus, Plus, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toppings } from '../data'
import { calculateUnitPrice, money, validateSelection } from '../lib'
import type { CartItem, Product } from '../types'

export default function ProductModal({ product, initial, onClose, onSave }: { product: Product; initial?: CartItem; onClose(): void; onSave(item: CartItem): void }) {
  const [selected, setSelected] = useState<string[]>(initial?.selectedOptionIds ?? [])
  const [quantity, setQuantity] = useState(initial?.quantity ?? 1)
  const error = validateSelection(product, selected)
  const price = useMemo(() => calculateUnitPrice(product, selected, toppings), [product, selected])
  const options = product.availableToppingIds.map((id) => toppings.find((item) => item.id === id)).filter(Boolean) as typeof toppings
  const addTopping = (id: string) => setSelected((rows) => [...rows, id])
  const removeTopping = (id: string) => setSelected((rows) => { const index = rows.lastIndexOf(id); return index < 0 ? rows : rows.filter((_, rowIndex) => rowIndex !== index) })
  const save = () => {
    if (error) return
    const names = product.optionMode === 'granola' ? selected.map((name) => `กราโนล่ารส${name}`) : selected.map((id) => toppings.find((entry) => entry.id === id)?.name ?? id)
    onSave({ id: initial?.id ?? crypto.randomUUID(), productId: product.id, productName: product.name, basePrice: product.price, selectedOptions: names, selectedOptionIds: selected, quantity, unitPrice: price })
  }
  const isPremium = (id: string) => product.premiumToppingIds ? product.premiumToppingIds.includes(id) : Boolean(toppings.find((item) => item.id === id)?.premium)
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal-card">
    <button className="icon-button modal-close" onClick={onClose} aria-label="ปิด"><X /></button>
    <div className="product-hero"><span>{product.emoji}</span><div><p className="eyebrow">รายละเอียดสินค้า</p><h2>{product.name}</h2><strong>{money(product.price)}</strong></div></div>
    <ul className="contents-list">{product.description.map((line) => <li key={line}>{line}</li>)}</ul>
    {product.optionMode === 'granola' && <div><h3>เลือกรสกราโนล่า <em>จำเป็น</em></h3><div className="choice-grid">{product.granolaOptions.map((name) => <button className={selected[0] === name ? 'choice selected' : 'choice'} key={name} onClick={() => setSelected([name])}>{name}</button>)}</div></div>}
    {product.optionMode === 'toppings' && <div><h3>เลือกท็อปปิ้ง <em>รวม {product.includedToppings} อย่าง</em></h3><p className="hint">เลือกซ้ำได้ • พรีเมียม +{product.premiumIncludedSurcharge} บาทในโควตา • เกินโควตา +{product.extraNormalPrice}/+{product.extraPremiumPrice} บาท</p><div className="topping-list">{options.map((option) => { const count = selected.filter((id) => id === option.id).length; return <div className="topping-row" key={option.id}><span>{option.name}{isPremium(option.id) && <small> พรีเมียม</small>}</span><div><button onClick={() => removeTopping(option.id)} disabled={!count}><Minus /></button><b>{count}</b><button onClick={() => addTopping(option.id)}><Plus /></button></div></div>})}</div><p className="selection-count">เลือกแล้ว {selected.length} อย่าง {selected.length > product.includedToppings && `(${selected.length - product.includedToppings} เพิ่มเติม)`}</p></div>}
    <div className="modal-footer"><div className="quantity"><button onClick={() => setQuantity(Math.max(1, quantity - 1))}><Minus /></button><b>{quantity}</b><button onClick={() => setQuantity(quantity + 1)}><Plus /></button></div><button className="primary grow" disabled={Boolean(error)} onClick={save}>{initial ? 'บันทึกการแก้ไข' : 'เพิ่มลงตะกร้า'} • {money(price * quantity)}</button></div>
    {error && <p className="validation">{error}</p>}
  </section></div>
}
