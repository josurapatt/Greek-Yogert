import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import CustomerOrderingOperationsPanel from "./CustomerOrderingOperationsPanel";

const customerOrderingAnchor = "#customer-ordering";

export default function CustomerOrderingSettingsSection() {
  const location = useLocation();
  const summaryRef = useRef<HTMLElement>(null);
  const anchored = location.hash === customerOrderingAnchor;
  const [expanded, setExpanded] = useState(anchored);

  useEffect(() => {
    if (!anchored) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    const frame = window.requestAnimationFrame(() => {
      summaryRef.current?.scrollIntoView({ block: "start" });
      summaryRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [anchored, location.key]);

  return (
    <section
      className="customer-ordering-settings-section"
      id="customer-ordering"
    >
      <details open={expanded}>
        <summary
          aria-expanded={expanded}
          ref={summaryRef}
          onClick={(event) => {
            event.preventDefault();
            setExpanded((current) => !current);
          }}
        >
          <span>
            <h2>การควบคุม Customer QR</h2>
            <small>
              สถานะการรับคำสั่งซื้อ สิทธิ์ดำเนินการ และตัวชี้วัดการปฏิบัติงาน
            </small>
          </span>
        </summary>
        {expanded && <CustomerOrderingOperationsPanel />}
      </details>
    </section>
  );
}
