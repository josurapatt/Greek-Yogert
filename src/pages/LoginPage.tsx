import { LockKeyhole, Mail } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useAuth } from '../store'

export default function LoginPage() {
  const { login, isDemo } = useAuth(); const [email, setEmail] = useState('shop@example.com'); const [password, setPassword] = useState('123456'); const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(''); try { await login(email, password) } catch (reason) { setError(reason instanceof Error ? reason.message : 'เข้าสู่ระบบไม่สำเร็จ') } finally { setBusy(false) } }
  return <main className="login-page"><section className="login-art"><div className="login-logo">Greek<br/><span>&amp; More</span></div><div className="bowl-art">🍓<span>🥣</span>🫐</div><p>รับออเดอร์ไว จัดคิวง่าย<br/>ทุกแก้วพร้อมส่งอย่างมั่นใจ</p></section><section className="login-panel"><form className="login-card" onSubmit={submit}><p className="eyebrow">ยินดีต้อนรับ</p><h1>เข้าสู่ระบบร้าน</h1><p>ใช้บัญชีของพนักงานเพื่อดูและจัดการออเดอร์</p>{isDemo && <div className="notice">ยังไม่ได้ตั้งค่า Firebase — ใช้บัญชีตัวอย่างด้านล่างเพื่อทดลองได้ทันที</div>}<label>อีเมล<div className="input-icon"><Mail/><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div></label><label>รหัสผ่าน<div className="input-icon"><LockKeyhole/><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required /></div></label>{error && <p className="validation">{error}</p>}<button className="primary large" disabled={busy}>{busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}</button><small>ระบบจะจดจำการเข้าสู่ระบบบนอุปกรณ์นี้</small></form></section></main>
}
