import { Download, FileJson, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { firebaseReady } from "../firebase";
import { formatThaiDateTime, separatedPackagingAvailabilityId } from "../lib";
import { useAuth, useData } from "../store";

export default function SettingsPage() {
  const {
    products,
    orders,
    toppingAvailability,
    setToppingAvailability,
    importBackup,
  } = useData();
  const { user } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [lastBackup, setLastBackup] = useState(
    localStorage.getItem("gym-last-backup") || "",
  );
  const [message, setMessage] = useState("");

  const backup = () => {
    const createdAt = new Date().toISOString();
    const payload = JSON.stringify(
      { version: 1, createdAt, products, orders },
      null,
      2,
    );
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob([payload], { type: "application/json" }),
    );
    link.download = `greek-more-backup-${createdAt.slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    localStorage.setItem("gym-last-backup", createdAt);
    setLastBackup(createdAt);
    setMessage("สำรองข้อมูลเรียบร้อย");
  };

  const restore = async (file?: File) => {
    if (
      !file ||
      !confirm("นำเข้าข้อมูลจากไฟล์นี้? รายการที่ ID ตรงกันจะถูกแทนที่")
    )
      return;
    try {
      const data = JSON.parse(await file.text());
      await importBackup(data);
      setMessage("นำเข้าข้อมูลเรียบร้อย");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "นำเข้าไม่สำเร็จ");
    } finally {
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="page narrow">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ระบบและข้อมูล</p>
          <h1>ตั้งค่าและสำรองข้อมูล</h1>
        </div>
      </div>
      {message && <div className="notice success">{message}</div>}
      <section className="settings-card">
        <div className="settings-icon pink">🥄</div>
        <div>
          <h2>แยกท็อปปิ้ง</h2>
          <p>เปิดหรือปิดตัวเลือกแยกท็อปปิ้งสำหรับสินค้าทั้งหมด</p>
          <small>ใส่ท็อปปิ้งเลยยังเลือกได้เสมอ</small>
        </div>
        <label className="switch">
          <input
            aria-label="แยกท็อปปิ้งพร้อมขาย"
            type="checkbox"
            checked={
              toppingAvailability[separatedPackagingAvailabilityId] !== false
            }
            onChange={(event) =>
              void setToppingAvailability(
                separatedPackagingAvailabilityId,
                event.target.checked,
              )
            }
          />
          <span />
        </label>
      </section>
      <section className="settings-card">
        <div className="settings-icon">
          <FileJson />
        </div>
        <div>
          <h2>สำรองข้อมูลด้วยตนเอง</h2>
          <p>ดาวน์โหลดสินค้าและออเดอร์ทั้งหมดเป็นไฟล์ JSON เก็บไว้นอกระบบ</p>
          <small>
            สำรองล่าสุด:{" "}
            {lastBackup ? formatThaiDateTime(lastBackup) : "ยังไม่เคยสำรอง"}
          </small>
        </div>
        <button className="primary" onClick={backup}>
          <Download /> ดาวน์โหลด JSON
        </button>
      </section>
      <section className="settings-card">
        <div className="settings-icon pink">
          <Upload />
        </div>
        <div>
          <h2>กู้คืนจากไฟล์สำรอง</h2>
          <p>
            ตรวจสอบว่าเป็นไฟล์จากระบบนี้ก่อนนำเข้า ข้อมูล ID เดิมจะถูกอัปเดต
          </p>
        </div>
        <input
          ref={input}
          hidden
          type="file"
          accept="application/json"
          onChange={(event) => void restore(event.target.files?.[0])}
        />
        <button className="secondary" onClick={() => input.current?.click()}>
          <Upload /> เลือกไฟล์
        </button>
      </section>
      <section className="settings-card account-card">
        <div>
          <h2>สถานะระบบ</h2>
          <p>
            <b>บัญชี:</b> {user?.email}
          </p>
          <p>
            <b>ฐานข้อมูล:</b>{" "}
            {firebaseReady
              ? "Firebase / Firestore (ซิงก์หลายอุปกรณ์)"
              : "โหมดทดลองในเครื่อง (ข้อมูลอยู่ในเบราว์เซอร์นี้)"}
          </p>
          <p>
            <b>เขตเวลา:</b> Asia/Bangkok
          </p>
        </div>
      </section>
      {!firebaseReady && (
        <div className="notice">
          <strong>ก่อนใช้งานจริง:</strong> คัดลอก <code>.env.example</code> เป็น{" "}
          <code>.env.local</code> และใส่ค่า Firebase จากหน้า Project settings
          จากนั้น deploy rules เพื่อป้องกันบุคคลภายนอก
        </div>
      )}
    </div>
  );
}
