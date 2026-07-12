# GreekYogurtOrderApp

ระบบรับและจัดการออเดอร์สำหรับร้าน Greek & More ใช้งานผ่านเบราว์เซอร์บน iPad, Android และคอมพิวเตอร์ รองรับ Firebase Authentication, Firestore real-time sync, Excel export และ JSON backup โดยไม่ใช้ Cloud Functions หรือ Firebase Storage

## ฟังก์ชันหลัก

- ล็อกอินและจดจำอุปกรณ์ด้วย Firebase Email/Password
- รับออเดอร์หลายแก้ว เลือกกราโนล่า/ท็อปปิ้งซ้ำได้ แก้ไข ทำสำเนา และปรับจำนวน
- คำนวณท็อปปิ้งพรีเมียมในโควตา +5 บาท และรายการเกินโควตา +10/+15 บาท
- เลขคิวรายวัน `Q001` และเลขออเดอร์ `YYYYMMDD-001` สร้างด้วย Firestore transaction
- คิวเรียลไทม์ พร้อมเสียงแจ้งเตือนแบบ opt-in
- พร้อมส่ง ยกเลิก เรียกคืนเข้าคิว และแก้ไขออเดอร์ที่ยังไม่เสร็จ
- ประวัติ รายงานช่วงวันที่ Excel export และ JSON backup/restore
- จัดการสินค้า ราคา สถานะ ตัวเลือก จำนวนที่รวม ค่าบวก และท็อปปิ้งพรีเมียม
- เขตเวลาในการตัดวันและแสดงผลเป็น `Asia/Bangkok`

## โครงสร้างสำคัญ

```text
src/
  components/       Layout และหน้าต่างปรับแต่งสินค้า
  pages/            หน้าจอการทำงานทั้งหมด
  data.ts           เมนูและท็อปปิ้งเริ่มต้น
  firebase.ts       Firebase initialization
  store.tsx         auth, real-time data และ cart state
  lib.ts            ราคา คิว วันเวลา และ order transformation
  lib.test.ts       ทดสอบกฎธุรกิจสำคัญ
firestore.rules     กฎการเข้าถึง (ต้องล็อกอิน, ห้าม hard delete)
firebase.json       Firestore และ Hosting configuration
```

## รันในเครื่องทันที

ต้องใช้ Node.js 20+ และ pnpm

```bash
pnpm install
pnpm dev
```

Customer QR Ordering ใช้ค่าคอนฟิกแบบ fail-closed สองค่าใน `.env.local`:

```text
VITE_APP_ENVIRONMENT=local
VITE_CUSTOMER_QR_ENABLED=false
```

- Local development: ต้องกำหนด `local` และเลือก `true` หรือ `false` อย่างชัดเจน ค่าที่หายไปหรือไม่ถูกต้องจะปิด Customer QR
- Customer QR UAT: workflow กำหนด `customer-qr-uat` และ `true` อย่างชัดเจน พร้อมใช้ Firebase configuration ของ UAT
- Production: workflow กำหนด `production` และ `false`; การเปิดใช้งานในอนาคตต้องผ่านการอนุมัติ Production แยกต่างหาก

ห้าม commit `.env.local` หรือ Firebase credentials จริง

เปิด URL ที่ Vite แสดง หากยังไม่มี `.env.local` ระบบจะเข้าโหมดทดลองและเก็บข้อมูลใน `localStorage` ใช้ `shop@example.com` / `123456` เพื่อทดลองได้ โหมดนี้ไม่ซิงก์ข้ามอุปกรณ์และไม่ควรใช้เป็นฐานข้อมูลร้านจริง

ตรวจสอบก่อนส่งขึ้นระบบ:

```bash
pnpm test
pnpm build
pnpm lint
```

## ตั้งค่า Firebase (แผน Spark / free tier)

1. สร้างโปรเจกต์ที่ [Firebase Console](https://console.firebase.google.com/)
2. เปิด **Authentication > Sign-in method > Email/Password**
3. เปิด **Firestore Database** และเลือก location ใกล้ผู้ใช้ เช่น `asia-southeast1`
4. เพิ่ม Web app ใน Project settings แล้วคัดลอกค่า config
5. คัดลอก `.env.example` เป็น `.env.local` และใส่ค่าทั้งหมด
6. คัดลอก `.firebaserc.example` เป็น `.firebaserc` แล้วเปลี่ยน project id
7. ใน **Authentication > Users** กด Add user สร้างบัญชีร้าน 2 บัญชี (อย่าใส่รหัสผ่านจริงใน source code)
8. deploy rules ก่อนใช้งานจริง:

```bash
pnpm dlx firebase-tools login
pnpm dlx firebase-tools deploy --only firestore:rules,firestore:indexes
```

หลังล็อกอินครั้งแรก ระบบจะ seed สินค้าเริ่มต้นไปที่ collection `products` อัตโนมัติ ทั้งสองบัญชีมีสิทธิ์เท่ากันตามขอบเขตปัจจุบัน ผู้ที่ไม่ล็อกอินอ่านหรือแก้ข้อมูลไม่ได้

## Data model

- `products/{productId}`: ราคา สถานะ รายละเอียด ตัวเลือก ค่าบวก และรายการท็อปปิ้ง
- `orders/{YYYYMMDD-sequence}`: snapshot รายการสินค้า ราคา ลูกค้า ช่องทาง การชำระ สถานะ และเวลา ISO
- `counters/{YYYY-MM-DD}`: sequence ล่าสุด ใช้ transaction กันเลขคิวชนกัน
- `users/{uid}` และ `settings/*`: เผื่อข้อมูลผู้ใช้/ร้านในระยะถัดไป

รายการสินค้า (`orderItems`) ฝังเป็น snapshot ใน order เพื่อให้ประวัติยังคงราคา/ชื่อ ณ เวลาขาย และทำให้การอ่านคิวครั้งเดียวจบ เหมาะกับปริมาณร้านขนาดเล็ก

## Deploy Hosting

```bash
pnpm build
pnpm dlx firebase-tools deploy --only hosting
```

Firebase Hosting จะใช้ `dist/` และ rewrite ทุก route กลับ `index.html`

## Deploy แบบไม่ต้องติดตั้ง Node.js บนเครื่องร้าน

ใช้ workflow `Deploy Greek & More to Firebase` ใน GitHub Actions ซึ่ง build และ deploy บน GitHub runner โดยตรง เหมาะสำหรับ iPad/มือถือและเครื่อง Windows ที่ไม่มีสิทธิ์ติดตั้งโปรแกรม ดูขั้นตอนแบบละเอียดใน [DEPLOYMENT_BROWSER.md](./DEPLOYMENT_BROWSER.md)

Workflow นี้เป็น manual-only เพื่อป้องกันการ deploy โดยไม่ตั้งใจ ต้องเพิ่ม GitHub Actions secrets สำหรับ Firebase web config และ service-account JSON ก่อน จากนั้นกด **Actions → Deploy Greek & More to Firebase → Run workflow** ในเบราว์เซอร์

## ขั้นตอนใช้งานร้านที่แนะนำ

1. ทดสอบทั้ง 2 บัญชีบน iPad และ Samsung พร้อมกัน
2. เปิดเสียงแจ้งเตือนจากหน้าคิวหนึ่งครั้งต่ออุปกรณ์ (ข้อจำกัด autoplay ของเบราว์เซอร์)
3. ทดลองสั่ง/แก้ไข/ยกเลิก/เรียกคืน และตรวจยอดรายงาน
4. ดาวน์โหลด JSON backup เป็นประจำ เช่น หลังปิดร้านทุกวัน

## ข้อจำกัดปัจจุบัน

- โหมด Firebase ต้องมีอินเทอร์เน็ต; Firestore SDK อาจ cache ข้อมูล แต่แอปยังไม่ได้แสดงสถานะ offline/conflict โดยเฉพาะ
- เสียงต้องได้รับการแตะเปิดจากผู้ใช้บนแต่ละอุปกรณ์
- การ import JSON จำนวนมากทำแบบตรงไปตรงมา เหมาะกับร้านขนาดเล็ก หากข้อมูลโตมากควรแบ่ง batch
- กฎ Firestore ให้ผู้ใช้ร้านที่ล็อกอินแล้วมีสิทธิ์เท่ากันตาม requirement ปัจจุบัน
