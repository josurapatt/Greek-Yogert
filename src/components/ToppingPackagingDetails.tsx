import { money, toppingPackagingLabel } from "../lib";
import type { CartItem } from "../types";

export default function ToppingPackagingDetails({ item }: { item: CartItem }) {
  const perUnit = item.packagingSurchargePerUnit ?? 0;
  const total = item.packagingSurchargeTotal ?? perUnit * item.quantity;
  return (
    <small className="packaging-detail">
      รูปแบบท็อปปิ้ง: {toppingPackagingLabel(item)}
      {perUnit > 0 && (
        <>
          {" "}
          • ค่าบรรจุภัณฑ์ {money(perUnit)}/ถ้วย
          {item.quantity > 1 && ` • รวม ${money(total)}`}
        </>
      )}
    </small>
  );
}
