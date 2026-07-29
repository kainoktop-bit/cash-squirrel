# The Cash Squirrel

เครื่องมือติดตามกระแสเงินสด งาน รายรับ รายจ่าย เครดิตเทอม ภาษี และเอกสาร สำหรับฟรีแลนซ์ไทย

## เปิดใช้งานบนเครื่อง

1. ติดตั้ง Node.js 20 หรือใหม่กว่า
2. คัดลอก `.env.example` เป็น `.env.local` แล้วใส่ค่า Supabase Project URL และ publishable key
3. รัน `npm install` และ `npm run dev`

## เตรียม Supabase (ต้องทำก่อน deploy)

1. สร้างโปรเจกต์ใน Supabase
2. ไปที่ **SQL Editor** และรันไฟล์ `20260714_secure_public_launch.sql`
3. ไปที่ **Authentication > URL Configuration**
   - ตั้ง Site URL เป็นโดเมนจริง เช่น `https://YOUR_DOMAIN`
   - เพิ่ม Redirect URLs: `https://YOUR_DOMAIN/app` และ URL preview ของ Vercel หากใช้
4. หากเปิด Google login ให้ตั้ง OAuth redirect URI ตามที่ Supabase แสดงในหน้า Google provider
5. ตรวจว่าตาราง `user_cashflow_data` เปิด Row Level Security แล้ว และไม่มี policy เก่าที่อนุญาต `anon` อ่านทุกแถว

## Deploy ด้วย Vercel

1. สร้าง GitHub repository แล้วอัปโหลดโฟลเดอร์นี้ขึ้นไป
2. เข้า Vercel และเลือก **Add New > Project** จาก repository นั้น
3. Framework preset: **Vite**; Build command: `npm run build`; Output directory: `dist`
4. ที่ **Environment Variables** เพิ่ม `VITE_SUPABASE_URL` และ `VITE_SUPABASE_PUBLISHABLE_KEY`
5. Deploy และเปิด URL ที่ได้เพื่อตรวจ login, เพิ่มงาน, บันทึกใบแจ้งหนี้ และออกจากระบบแล้วเข้าใหม่
6. ผูกโดเมนใน Vercel แล้วกลับไปเพิ่มโดเมนใน Supabase Redirect URLs

## ทำให้ค้นเจอบน Google

1. แก้ `YOUR_DOMAIN` ใน `public/robots.txt` และ `public/sitemap.xml` เป็นโดเมนจริง แล้ว deploy อีกครั้ง
2. เปิด Google Search Console, เพิ่ม property ของโดเมน และยืนยันความเป็นเจ้าของตามขั้นตอน Google
3. ส่ง `https://YOUR_DOMAIN/sitemap.xml` ในเมนู Sitemaps
4. เปิดหน้าแรก `/`, หน้า Privacy `/privacy` และหน้า Terms `/terms` ให้เข้าถึงได้สาธารณะ

## ข้อควรระวังด้านความปลอดภัย

- ห้ามใส่ Supabase `service_role` key ใน `.env.local`, Vercel หรือโค้ดหน้าเว็บ
- ระบบ Google Apps Script เดิมถูกปิดแล้ว เพราะแนวทางเดิมเสี่ยงต่อการเข้าถึงข้อมูลทุกบัญชี
- หากจะทำอีเมลแจ้งเตือนอัตโนมัติ ให้ใช้ Supabase Edge Function/Cron และเก็บ secret ใน Supabase เท่านั้น
- แอปเป็นเครื่องมือช่วยบันทึก ไม่ใช่คำแนะนำด้านภาษีหรือการเงิน
