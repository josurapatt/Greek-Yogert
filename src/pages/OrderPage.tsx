import { ShoppingBasket } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import ProductModal from '../components/ProductModal'
import { money } from '../lib'
import { useCart, useData } from '../store'
import type { Product } from '../types'

export default function OrderPage() {
  const { products } = useData(); const { items, add } = useCart(); const [selected, setSelected] = useState<Product | null>(null); const active = products.filter((product) => product.active); const count = items.reduce((sum, item) => sum + item.quantity, 0)
  return <div className="page"><div className="page-heading"><div><p className="eyebrow">สร้างออเดอร์</p><h1>เลือกสินค้า</h1><p>แตะสินค้าเพื่อดูรายละเอียดและเลือกตัวเลือก</p></div><Link className="secondary cart-button" to="/cart"><ShoppingBasket/> ตะกร้า {count > 0 && <b>{count}</b>}</Link></div><section className="product-grid">{active.map((product, index) => <button className={`product-card product-${index % 5}`} key={product.id} onClick={() => setSelected(product)}><span className="product-emoji">{product.emoji}</span><div><h2>{product.name}</h2><p>{product.description.slice(0, 2).join(' • ')}</p><strong>{money(product.price)}</strong>{product.optionMode === 'toppings' && <small>เลือก {product.includedToppings} ท็อปปิ้ง</small>}{product.optionMode === 'granola' && <small>เลือกรสกราโนล่า</small>}</div></button>)}</section>{!active.length && <div className="empty">ยังไม่มีสินค้าที่เปิดขาย</div>}{selected && <ProductModal product={selected} onClose={() => setSelected(null)} onSave={(item) => { add(item); setSelected(null) }} />}</div>
}
