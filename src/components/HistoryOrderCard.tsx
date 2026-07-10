import { Link } from "react-router-dom";
import {
  channelLabels,
  formatThaiDateTime,
  money,
  paymentMethodLabel,
} from "../lib";
import type { ShopOrder } from "../types";

export default function HistoryOrderCard({ order }: { order: ShopOrder }) {
  const quantity = order.items.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <Link className="history-row" to={`/orders/${order.id}`}>
      <strong className="queue-small">{order.queueNumber}</strong>
      <div>
        <h3>{order.customerName}</h3>
        <p>
          {formatThaiDateTime(order.createdAt)} •{" "}
          {channelLabels[order.channel] ?? order.channel} • {quantity} ถ้วย •{" "}
          {paymentMethodLabel(order.paymentMethod)}
        </p>
      </div>
      <span className={`status ${order.status}`}>
        {order.status === "completed" ? "พร้อมส่ง" : "ยกเลิก"}
      </span>
      <b>{money(order.total)}</b>
    </Link>
  );
}
