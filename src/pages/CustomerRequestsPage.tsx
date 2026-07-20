import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { db } from "../firebase";
import { customerPaymentMethods } from "../customerOrder";
import { formatThaiDateTime, money } from "../lib";
import { useAuth, useData } from "../store";
import {
  confirmCustomerRequestTransaction,
  rejectCustomerRequestTransaction,
  requestIsStillPending,
} from "../customerRequestActions";
import type { CustomerOrderRequest, StaffPaymentMethod } from "../types";
import { pendingCustomerRequests } from "../customerRequests";
import OrderItemSummary from "../components/OrderItemSummary";
import { customerQrStaffLabel } from "@runtime-config";
import {
  customerConfirmationFailureMessage,
  logCustomerConfirmationFailure,
} from "../customerConfirmationUx";

export default function CustomerRequestsPage() {
  const { user } = useAuth();
  const {
    customerRequests: requests,
    customerRequestsIncomplete,
    dismissCustomerRequest,
  } = useData();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "named" | "with-note">("all");
  const [page, setPage] = useState(1);
  const confirm = async (
    request: CustomerOrderRequest,
    paymentMethod: StaffPaymentMethod,
  ) => {
    if (!db || busy) return;
    try {
      setBusy(request.id);
      await confirmCustomerRequestTransaction(
        db,
        request.id,
        paymentMethod,
        user?.uid,
      );
      dismissCustomerRequest(request.id);
      setMessage("ยืนยันคำขอและสร้างคิวแล้ว");
    } catch (cause) {
      try {
        if (db && !(await requestIsStillPending(db, request.id)))
          dismissCustomerRequest(request.id);
      } catch {
        console.error("Customer request reconciliation failed", {
          requestId: request.id,
        });
      }
      logCustomerConfirmationFailure(request.id, cause);
      setMessage(customerConfirmationFailureMessage(cause));
    } finally {
      setBusy(null);
    }
  };
  const reject = async (request: CustomerOrderRequest) => {
    if (!db || busy) return;
    const reason = window.prompt("เหตุผล (ไม่บังคับ)") ?? undefined;
    try {
      setBusy(request.id);
      await rejectCustomerRequestTransaction(db, request.id, reason, user?.uid);
      dismissCustomerRequest(request.id);
      setMessage("ปฏิเสธคำขอแล้ว");
    } catch (cause) {
      if (db && !(await requestIsStillPending(db, request.id)))
        dismissCustomerRequest(request.id);
      setMessage(cause instanceof Error ? cause.message : "ปฏิเสธไม่สำเร็จ");
    } finally {
      setBusy(null);
    }
  };
  const pending = useMemo(() => pendingCustomerRequests(requests), [requests]);
  const filteredPending = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("th");
    return pending.filter((request) => {
      if (filter === "named" && !request.customerName?.trim()) return false;
      if (filter === "with-note" && !request.customerNote?.trim()) return false;
      if (!needle) return true;
      return [request.id, request.customerName, request.customerNote]
        .filter(Boolean)
        .some((value) =>
          String(value).toLocaleLowerCase("th").includes(needle),
        );
    });
  }, [filter, pending, query]);
  const pageSize = 12;
  const pageCount = Math.max(1, Math.ceil(filteredPending.length / pageSize));
  const visiblePending = filteredPending.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{customerQrStaffLabel}</p>
          <h1>คำขอจากลูกค้า</h1>
          <p>คำขอจะได้รับเลขคิวเมื่อร้านยืนยันเท่านั้น</p>
        </div>
      </div>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {customerRequestsIncomplete && (
        <p className="validation">
          แสดงคำขอที่รอล่าสุดแบบจำกัด อาจมีคำขอเก่ากว่านี้ กรุณาตรวจสอบตัวชี้วัด
        </p>
      )}
      {pending.length > 0 && (
        <div className="filters customer-request-filters">
          <label className="search">
            <Search aria-hidden="true" />
            <input
              aria-label="ค้นหาคำขอ"
              placeholder="ค้นหาชื่อลูกค้า หมายเหตุ หรือรหัสคำขอ"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <label>
            <select
              aria-label="กรองคำขอ"
              value={filter}
              onChange={(event) => {
                setFilter(event.target.value as typeof filter);
                setPage(1);
              }}
            >
              <option value="all">คำขอทั้งหมด</option>
              <option value="named">มีชื่อลูกค้า</option>
              <option value="with-note">มีหมายเหตุ</option>
            </select>
          </label>
        </div>
      )}
      {!pending.length ? (
        <div className="empty">ไม่มีคำขอที่รอยืนยัน</div>
      ) : !filteredPending.length ? (
        <div className="empty">ไม่พบคำขอที่ตรงกับการค้นหาและตัวกรอง</div>
      ) : (
        <>
          <section className="queue-grid">
            {visiblePending.map((request) => (
              <article className="queue-card" key={request.id}>
                <h2>
                  <Link to={`/customer-requests/${request.id}`}>
                    {request.customerName || "ลูกค้าทั่วไป"}
                  </Link>
                </h2>
                <p>
                  {formatThaiDateTime(request.createdAt)} • {request.itemCount}{" "}
                  รายการ • {money(request.total)}
                </p>
                {request.customerNote && (
                  <p>หมายเหตุ: {request.customerNote}</p>
                )}
                {request.items.map((item) => (
                  <OrderItemSummary item={item} key={item.id} />
                ))}
                <div className="button-row">
                  <Link
                    className="secondary"
                    to={`/customer-requests/${request.id}`}
                  >
                    ดูรายละเอียด
                  </Link>
                  {customerPaymentMethods.map((method) => (
                    <button
                      className="primary"
                      disabled={busy === request.id}
                      key={method}
                      onClick={() => void confirm(request, method)}
                    >
                      ยืนยัน • {method}
                    </button>
                  ))}
                  <button
                    className="secondary"
                    disabled={busy === request.id}
                    onClick={() => void reject(request)}
                  >
                    ปฏิเสธ
                  </button>
                </div>
              </article>
            ))}
          </section>
          {pageCount > 1 && (
            <nav className="customer-request-pagination" aria-label="หน้าคำขอ">
              <button
                className="secondary"
                disabled={page === 1}
                onClick={() => setPage((current) => current - 1)}
              >
                ก่อนหน้า
              </button>
              <span aria-live="polite">
                หน้า {page} จาก {pageCount}
              </span>
              <button
                className="secondary"
                disabled={page === pageCount}
                onClick={() => setPage((current) => current + 1)}
              >
                ถัดไป
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
