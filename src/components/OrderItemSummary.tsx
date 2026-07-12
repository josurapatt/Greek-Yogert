import { money, paymentMethodLabel } from "../lib";
import type { CartItem } from "../types";
import ToppingPackagingDetails from "./ToppingPackagingDetails";

export default function OrderItemSummary({ item }: { item: CartItem }) {
  const options = Array.isArray(item.selectedOptions)
    ? item.selectedOptions.filter(Boolean)
    : [];
  return (
    <div className="queue-item-detail">
      <strong>
        {item.productName || "สินค้าเดิม"} × {item.quantity}
      </strong>
      {options.length > 0 && <p>• {options.join(", ")}</p>}
      <ToppingPackagingDetails item={item} />
      {item.paymentMethod && (
        <p>• ชำระ {paymentMethodLabel(item.paymentMethod)}</p>
      )}
      {item.priceBreakdown?.premiumIncludedSurcharge ? (
        <small>
          • พรีเมียม +{money(item.priceBreakdown.premiumIncludedSurcharge)}
        </small>
      ) : null}
      {item.priceBreakdown?.extraToppingCharges ? (
        <small>
          • เพิ่มพิเศษ +{money(item.priceBreakdown.extraToppingCharges)}
        </small>
      ) : null}
    </div>
  );
}
