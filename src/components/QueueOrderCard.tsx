import { Clock } from "lucide-react";
import { Link } from "react-router-dom";
import {
  channelLabels,
  formatThaiDateTime,
  money,
  paymentMethodLabel,
} from "../lib";
import type { ShopOrder } from "../types";
import OrderItemSummary from "./OrderItemSummary";

export default function QueueOrderCard({ order }: { order: ShopOrder }) {
  const quantity = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const orderTime = formatThaiDateTime(order.createdAt)
    .split(" ")
    .slice(-1)
    .join(" ");
  return (
    <Link className="queue-card detailed" to={`/orders/${order.id}`}>
      <div className="queue-top">
        <strong>{order.queueNumber}</strong>
        <span>รอจัดเตรียม</span>
      </div>
      <h2>{order.customerName}</h2>
      <div className="queue-order-items">
        {order.items.map((item) => (
          <OrderItemSummary item={item} key={item.id} />
        ))}
      </div>
      <footer className="queue-detail-footer">
        <span>
          <Clock /> {orderTime}
        </span>
        <span>{channelLabels[order.channel] ?? order.channel}</span>
        <span>{paymentMethodLabel(order.paymentMethod)}</span>
        <span>{quantity} ถ้วย</span>
        <strong>{money(order.total)}</strong>
      </footer>
    </Link>
  );
}
