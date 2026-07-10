/* oxlint-disable react/only-export-components -- providers and their typed hooks intentionally share this module */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { collection, deleteField, doc, FieldPath, onSnapshot, runTransaction, setDoc, updateDoc } from 'firebase/firestore'
import { auth, db, firebaseReady } from './firebase'
import { defaultProducts, mergeProducts, normalizeProduct, toppings } from './data'
import { toFirestoreData } from './firestoreData'
import { applyCartItemUpdate, businessDate, createOrder, nextLocalQueue, orderTotals, prepareOrderItems, repriceCartItems, validatePaymentMethod } from './lib'
import type { CartItem, OrderChannel, OrderDraft, Product, ShopOrder, ToppingAvailability } from './types'

interface SessionUser { uid: string; email: string }
interface AuthValue { user: SessionUser | null; loading: boolean; isDemo: boolean; login(email: string, password: string): Promise<void>; logout(): Promise<void> }
const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(() => {
    const email = localStorage.getItem('gym-demo-email')
    return !firebaseReady && email ? { uid: 'demo-user', email } : null
  })
  const [loading, setLoading] = useState(firebaseReady)
  useEffect(() => {
    if (!auth) return
    return onAuthStateChanged(auth, (account) => {
      setUser(account ? { uid: account.uid, email: account.email ?? '' } : null)
      setLoading(false)
    })
  }, [])
  const login = async (email: string, password: string) => {
    if (auth) { await signInWithEmailAndPassword(auth, email, password); return }
    if (!email.trim() || password.length < 6) throw new Error('กรุณากรอกอีเมลและรหัสผ่านอย่างน้อย 6 ตัวอักษร')
    localStorage.setItem('gym-demo-email', email.trim())
    setUser({ uid: 'demo-user', email: email.trim() })
  }
  const logout = async () => {
    if (auth) await signOut(auth)
    localStorage.removeItem('gym-demo-email')
    setUser(null)
  }
  return <AuthContext.Provider value={{ user, loading, isDemo: !firebaseReady, login, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error('AuthProvider missing'); return value }

interface DataValue {
  products: Product[]; orders: ShopOrder[]; toppingAvailability: ToppingAvailability; loading: boolean
  submitOrder(draft: OrderDraft): Promise<ShopOrder>
  replaceOrder(id: string, draft: OrderDraft): Promise<void>
  setOrderStatus(id: string, status: ShopOrder['status']): Promise<void>
  saveProduct(product: Product): Promise<void>
  setToppingAvailability(id: string, available: boolean): Promise<void>
  importBackup(data: { products: Product[]; orders: ShopOrder[] }): Promise<void>
}
const DataContext = createContext<DataValue | null>(null)
const PRODUCTS_KEY = 'gym-products-v1'
const ORDERS_KEY = 'gym-orders-v1'
const TOPPING_AVAILABILITY_KEY = 'gym-topping-availability-v1'

const readLocal = <T,>(key: string, fallback: T): T => {
  try { return JSON.parse(localStorage.getItem(key) || '') as T } catch { return fallback }
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [products, setProducts] = useState<Product[]>(() => firebaseReady ? [] : mergeProducts(readLocal(PRODUCTS_KEY, defaultProducts)))
  const [orders, setOrders] = useState<ShopOrder[]>(() => firebaseReady ? [] : readLocal(ORDERS_KEY, []))
  const [toppingAvailability, setAvailability] = useState<ToppingAvailability>(() => firebaseReady ? {} : readLocal(TOPPING_AVAILABILITY_KEY, {}))
  const [loading, setLoading] = useState(Boolean(db))

  useEffect(() => {
    if (!db || !user) { setLoading(false); return }
    const stopProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      const rows = snapshot.docs.map((entry) => entry.data() as Product)
      setProducts(rows.length ? mergeProducts(rows) : defaultProducts.map(normalizeProduct))
      if (!rows.length) defaultProducts.forEach((product) => void setDoc(doc(db!, 'products', product.id), product))
      setLoading(false)
    })
    const stopOrders = onSnapshot(collection(db, 'orders'), (snapshot) => {
      setOrders(snapshot.docs.map((entry) => entry.data() as ShopOrder).sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
    })
    const stopAvailability = onSnapshot(doc(db, 'settings', 'toppingAvailability'), (snapshot) => {
      setAvailability((snapshot.data()?.availability as ToppingAvailability | undefined) ?? {})
    })
    return () => { stopProducts(); stopOrders(); stopAvailability() }
  }, [user])

  useEffect(() => { if (!db) localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products)) }, [products])
  useEffect(() => { if (!db) localStorage.setItem(ORDERS_KEY, JSON.stringify(orders)) }, [orders])
  useEffect(() => { if (!db) localStorage.setItem(TOPPING_AVAILABILITY_KEY, JSON.stringify(toppingAvailability)) }, [toppingAvailability])

  const submitOrder = useCallback(async (draft: OrderDraft) => {
    if (!draft.items.length) throw new Error('ตะกร้าว่าง ไม่สามารถส่งออเดอร์ได้')
    const paymentError = validatePaymentMethod(draft.channel, draft.paymentMethod)
    if (paymentError) throw new Error(paymentError)
    const preparedDraft = { ...draft, items: prepareOrderItems(draft.items, products, draft.channel, toppings, toppingAvailability) }
    if (db) {
      const firestore = db
      const date = businessDate()
      return runTransaction(firestore, async (transaction) => {
        const counterRef = doc(firestore, 'counters', date)
        const counter = await transaction.get(counterRef)
        const sequence = (counter.data()?.lastSequence ?? 0) + 1
        const padded = String(sequence).padStart(3, '0')
        const order = toFirestoreData(createOrder(preparedDraft, `${date.replaceAll('-', '')}-${padded}`, `Q${padded}`, user?.uid))
        transaction.set(counterRef, { lastSequence: sequence, updatedAt: order.createdAt })
        transaction.set(doc(firestore, 'orders', order.id), order)
        return order
      })
    }
    const next = nextLocalQueue(orders)
    const order = createOrder(preparedDraft, next.id, next.queue, user?.uid)
    setOrders((current) => [order, ...current])
    return order
  }, [orders, products, toppingAvailability, user])

  const replaceOrder = async (id: string, draft: OrderDraft) => {
    const current = orders.find((order) => order.id === id)
    if (!current || current.status !== 'pending') throw new Error('แก้ไขได้เฉพาะออเดอร์ที่รอจัดเตรียม')
    const paymentError = validatePaymentMethod(draft.channel, draft.paymentMethod)
    if (paymentError) throw new Error(paymentError)
    const items = prepareOrderItems(draft.items, products, draft.channel, toppings, toppingAvailability)
    const totals = orderTotals(items, draft.discount)
    const patch = toFirestoreData({ customerName: draft.customerName.trim() || 'ลูกค้าทั่วไป', channel: draft.channel, paymentMethod: draft.paymentMethod, items, ...totals, updatedAt: new Date().toISOString() })
    if (db) await updateDoc(doc(db, 'orders', id), patch)
    else setOrders((rows) => rows.map((order) => order.id === id ? { ...order, ...patch } : order))
  }

  const setOrderStatus = async (id: string, status: ShopOrder['status']) => {
    const now = new Date().toISOString()
    const patch: Partial<ShopOrder> = { status, updatedAt: now }
    if (status === 'completed') patch.completedAt = now
    if (status === 'cancelled') patch.cancelledAt = now
    if (status === 'pending') { patch.completedAt = undefined; patch.cancelledAt = undefined }
    if (db) {
      const firebasePatch = status === 'pending' ? { ...patch, completedAt: deleteField(), cancelledAt: deleteField() } : patch
      await setDoc(doc(db, 'orders', id), firebasePatch, { merge: true })
    }
    else setOrders((rows) => rows.map((order) => order.id === id ? { ...order, ...patch } : order))
  }

  const saveProduct = async (product: Product) => {
    const normalized = normalizeProduct(product)
    if (db) await setDoc(doc(db, 'products', normalized.id), normalized)
    else setProducts((rows) => [...rows.filter((entry) => entry.id !== normalized.id), normalized])
  }

  const setToppingAvailability = async (id: string, available: boolean) => {
    if (db) {
      await setDoc(
        doc(db, 'settings', 'toppingAvailability'),
        { availability: { [id]: available }, updatedAt: new Date().toISOString() },
        { mergeFields: [new FieldPath('availability', id), 'updatedAt'] },
      )
    } else setAvailability((current) => ({ ...current, [id]: available }))
  }

  const importBackup = async (data: { products: Product[]; orders: ShopOrder[] }) => {
    if (!Array.isArray(data.products) || !Array.isArray(data.orders)) throw new Error('รูปแบบไฟล์สำรองไม่ถูกต้อง')
    if (db) {
      const firestore = db
      await Promise.all([...data.products.map((product) => setDoc(doc(firestore, 'products', product.id), product)), ...data.orders.map((order) => setDoc(doc(firestore, 'orders', order.id), order))])
    } else { setProducts(data.products); setOrders(data.orders) }
  }

  const value = { products, orders, toppingAvailability, loading, submitOrder, replaceOrder, setOrderStatus, saveProduct, setToppingAvailability, importBackup }
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData() { const value = useContext(DataContext); if (!value) throw new Error('DataProvider missing'); return value }

interface CartValue {
  items: CartItem[]; editingOrder: ShopOrder | null; channel: OrderChannel | null
  add(item: CartItem): void; update(id: string, patch: Partial<CartItem>): void; remove(id: string): void
  duplicate(id: string): void; clear(): void; editOrder(order: ShopOrder, products: Product[], availability?: ToppingAvailability): void
  changeChannel(channel: OrderChannel, products: Product[], availability?: ToppingAvailability): void
  revalidate(products: Product[], availability?: ToppingAvailability): void
}
const CartContext = createContext<CartValue | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => firebaseReady ? [] : readLocal('gym-cart-v1', []))
  const [editingOrder, setEditingOrder] = useState<ShopOrder | null>(null)
  const [channel, setChannel] = useState<OrderChannel | null>(null)
  useEffect(() => {
    if (firebaseReady) localStorage.removeItem('gym-cart-v1')
    else localStorage.setItem('gym-cart-v1', JSON.stringify(items))
  }, [items])
  const add = (item: CartItem) => setItems((rows) => {
    const exact = rows.find((entry) => entry.productId === item.productId && JSON.stringify(entry.selectedOptionIds) === JSON.stringify(item.selectedOptionIds))
    return exact ? rows.map((entry) => entry.id === exact.id ? { ...entry, quantity: entry.quantity + item.quantity, lineTotal: entry.unitPrice * (entry.quantity + item.quantity) } : entry) : [...rows, item]
  })
  const update = (id: string, patch: Partial<CartItem>) => setItems((rows) => rows.map((item) => item.id === id ? applyCartItemUpdate(item, patch) : item))
  const remove = (id: string) => setItems((rows) => rows.filter((item) => item.id !== id))
  const duplicate = (id: string) => setItems((rows) => { const item = rows.find((entry) => entry.id === id); return item ? [...rows, { ...item, id: crypto.randomUUID(), quantity: 1, lineTotal: item.unitPrice }] : rows })
  const clear = () => { setItems([]); setEditingOrder(null); setChannel(null) }
  const editOrder = (order: ShopOrder, products: Product[], availability: ToppingAvailability = {}) => { setItems(repriceCartItems(order.items.map((item) => ({ ...item, id: crypto.randomUUID(), selectedChannel: order.channel })), products, order.channel, toppings, availability)); setEditingOrder(order); setChannel(order.channel) }
  const changeChannel = (nextChannel: OrderChannel, products: Product[], availability: ToppingAvailability = {}) => { setItems((rows) => repriceCartItems(rows, products, nextChannel, toppings, availability)); setChannel(nextChannel) }
  const revalidate = useCallback((products: Product[], availability: ToppingAvailability = {}) => { if (channel) setItems((rows) => repriceCartItems(rows, products, channel, toppings, availability)) }, [channel])
  return <CartContext.Provider value={{ items, editingOrder, channel, add, update, remove, duplicate, clear, editOrder, changeChannel, revalidate }}>{children}</CartContext.Provider>
}

export function useCart() { const value = useContext(CartContext); if (!value) throw new Error('CartProvider missing'); return value }
