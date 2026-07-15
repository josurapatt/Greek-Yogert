import { useCallback, useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth, useData } from "../store";
import {
  changeCustomerOrderingControl,
  customerOrderingControlSchemaVersion,
  disabledForReview,
  type PrivateCustomerOrderingControl,
} from "../customerOrderingControl";
import {
  loadOperationalIndicators,
  type OperationalIndicator,
} from "../operationalMonitoring";

export default function CustomerOrderingOperationsPanel() {
  const { user } = useAuth();
  const { products, toppingAvailability, customerRequests } = useData();
  const [control, setControl] = useState<PrivateCustomerOrderingControl | null>(
    null,
  );
  const [controlMalformed, setControlMalformed] = useState(false);
  const [controlMissing, setControlMissing] = useState(false);
  const [indicators, setIndicators] = useState<OperationalIndicator[]>([]);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState(
    "ขณะนี้ร้านปิดรับคำสั่งซื้อใหม่ชั่วคราว กรุณาติดต่อพนักงาน",
  );
  const [confirmedEnable, setConfirmedEnable] = useState(false);
  const [reviewedExtendedDisable, setReviewedExtendedDisable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    if (!db) return;
    try {
      const result = await loadOperationalIndicators(db, {
        pending: customerRequests,
        products,
        availability: toppingAvailability,
      });
      setIndicators(result.indicators);
      setControl(result.control);
    } catch {
      setIndicators((current) => [
        ...current.filter((item) => item.id !== "monitoring-load"),
        {
          id: "monitoring-load",
          label: "การโหลดตัวชี้วัด",
          severity: "critical",
          detail: "โหลดข้อมูลแบบจำกัดไม่สำเร็จ ต้องตรวจสอบด้วยตนเอง",
        },
      ]);
    }
  }, [customerRequests, products, toppingAvailability]);

  useEffect(() => {
    if (!db) return;
    let active = true;
    const stop = onSnapshot(
      doc(db, "settings", "customerOrdering"),
      (snapshot) => {
        if (!active) return;
        if (!snapshot.exists()) {
          setControl(null);
          setControlMissing(true);
          setControlMalformed(false);
          return;
        }
        setControlMissing(false);
        const value = snapshot.data() as PrivateCustomerOrderingControl;
        const valid =
          value.schemaVersion === customerOrderingControlSchemaVersion &&
          typeof value.enabled === "boolean";
        setControl(valid ? value : null);
        setControlMalformed(!valid);
      },
      () => active && setControlMalformed(true),
    );
    void refresh();
    return () => {
      active = false;
      stop();
    };
  }, [refresh]);

  const change = async (enabled: boolean) => {
    if (!db || !user || busy) return;
    if (enabled && !confirmedEnable) {
      setNotice("ต้องยืนยันอย่างชัดเจนก่อนเปิดรับคำสั่งซื้อ");
      return;
    }
    if (enabled && disabledForReview(control) && !reviewedExtendedDisable) {
      setNotice("ปิดรับเกิน 30 นาที ต้องทบทวนตัวชี้วัดก่อนเปิด");
      return;
    }
    try {
      setBusy(true);
      setNotice("");
      await changeCustomerOrderingControl(db, {
        enabled,
        message: enabled ? "" : message,
        reason,
        actorUid: user.uid,
        canManageCustomerOrdering: user.canManageCustomerOrdering === true,
      });
      setReason("");
      setConfirmedEnable(false);
      setReviewedExtendedDisable(false);
      setNotice(
        enabled ? "เปิดรับคำสั่งซื้อของลูกค้าแล้ว" : "ปิดรับคำสั่งซื้อใหม่แล้ว",
      );
      await refresh();
    } catch (cause) {
      setNotice(
        cause instanceof Error ? cause.message : "เปลี่ยนสถานะไม่สำเร็จ",
      );
    } finally {
      setBusy(false);
    }
  };

  const enabled = control?.enabled === true;
  const extended = disabledForReview(control);
  return (
    <section className="settings-card customer-ordering-operations">
      <div>
        <p className="eyebrow">การควบคุม Customer QR</p>
        <h2>{enabled ? "กำลังเปิดรับคำสั่งซื้อ" : "ปิดรับคำสั่งซื้อใหม่"}</h2>
        <p>
          ตัวชี้วัดเป็นข้อมูลช่วยปฏิบัติงานจากคำค้นแบบจำกัด
          ไม่ใช่การแจ้งเตือนแบบรับประกันหรือ rate limit ที่ปลอดภัย
        </p>
      </div>
      {controlMalformed && (
        <p className="validation">
          เอกสารควบคุมไม่ถูกต้อง ระบบลูกค้าต้องปิดรับคำขอใหม่
        </p>
      )}
      {controlMissing && (
        <p className="validation">
          ไม่พบเอกสารควบคุม ระบบลูกค้าปิดรับคำขอใหม่อยู่
          กดปิดรับฉุกเฉินเพื่อสร้างสถานะปิดที่ตรวจสอบได้
        </p>
      )}
      <label>
        เหตุผล (จำเป็น)
        <input
          value={reason}
          maxLength={200}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      {(enabled || controlMissing) && (
        <label>
          ข้อความแจ้งลูกค้า
          <input
            value={message}
            maxLength={160}
            onChange={(event) => setMessage(event.target.value)}
          />
        </label>
      )}
      {!enabled && !controlMissing && !controlMalformed && (
        <>
          <label className="inline-check">
            <input
              type="checkbox"
              checked={confirmedEnable}
              onChange={(event) => setConfirmedEnable(event.target.checked)}
            />
            ยืนยันว่าตรวจสอบเหตุการณ์แล้วและต้องการเปิดรับคำสั่งซื้อ
          </label>
          {extended && (
            <label className="inline-check">
              <input
                type="checkbox"
                checked={reviewedExtendedDisable}
                onChange={(event) =>
                  setReviewedExtendedDisable(event.target.checked)
                }
              />
              ทบทวนตัวชี้วัดหลังปิดรับเกิน 30 นาทีแล้ว
            </label>
          )}
        </>
      )}
      <div className="button-row">
        {enabled || controlMissing ? (
          <button
            className="danger"
            disabled={busy || !reason.trim()}
            onClick={() => void change(false)}
          >
            ปิดรับคำสั่งซื้อฉุกเฉิน
          </button>
        ) : !controlMalformed ? (
          <button
            className="primary"
            disabled={
              busy ||
              !reason.trim() ||
              !confirmedEnable ||
              user?.canManageCustomerOrdering !== true ||
              (extended && !reviewedExtendedDisable)
            }
            onClick={() => void change(true)}
          >
            เปิดรับคำสั่งซื้ออีกครั้ง
          </button>
        ) : null}
        <button
          className="secondary"
          disabled={busy}
          onClick={() => void refresh()}
        >
          อัปเดตตัวชี้วัด
        </button>
      </div>
      {!enabled &&
        !controlMissing &&
        !controlMalformed &&
        user?.canManageCustomerOrdering !== true && (
          <p className="hint">
            บัญชีนี้ปิดรับคำสั่งซื้อได้ แต่ไม่มี capability
            สำหรับเปิดรับอีกครั้ง
          </p>
        )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <div className="operations-indicators">
        {indicators.map((indicator) => (
          <article
            className={`indicator ${indicator.severity}`}
            key={indicator.id}
          >
            <strong>{indicator.label}</strong>
            <span>{indicator.detail}</span>
          </article>
        ))}
      </div>
    </section>
  );
}
