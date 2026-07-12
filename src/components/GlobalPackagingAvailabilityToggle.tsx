import { separatedPackagingAvailabilityId } from "../lib";
import { useData } from "../store";

export default function GlobalPackagingAvailabilityToggle({
  className = "",
}: {
  className?: string;
}) {
  const { toppingAvailability, setToppingAvailability } = useData();
  const available =
    toppingAvailability[separatedPackagingAvailabilityId] !== false;

  return (
    <div className={`global-packaging-control ${className}`.trim()}>
      <div>
        <strong>แยกท็อปปิ้ง</strong>
        <p>เปิดหรือปิดตัวเลือกแยกท็อปปิ้งสำหรับสินค้าทั้งหมด</p>
        <small>ใส่ท็อปปิ้งเลยยังเลือกได้เสมอ</small>
        <span className={available ? "available" : "sold-out"}>
          {available ? "เปิดใช้งาน" : "หมด"}
        </span>
      </div>
      <label className="switch">
        <input
          aria-label="แยกท็อปปิ้งพร้อมขาย"
          type="checkbox"
          checked={available}
          onChange={(event) =>
            void setToppingAvailability(
              separatedPackagingAvailabilityId,
              event.target.checked,
            )
          }
        />
        <span />
      </label>
    </div>
  );
}
