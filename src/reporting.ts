import { channelLabels, paymentMethodLabel } from "./lib";
import type { ShopOrder } from "./types";

export function completedSalesSummary(orders: ShopOrder[]) {
  const completed = orders.filter((order) => order.status === "completed");
  return {
    completed,
    sales: completed.reduce((sum, order) => sum + order.total, 0),
    cups: completed
      .flatMap((order) => order.items)
      .reduce((sum, item) => sum + item.quantity, 0),
  };
}

export function buildOrderExportRows(orders: ShopOrder[]) {
  return orders
    .filter((order) => order.status !== "pending")
    .flatMap((order) =>
      order.items.map((item) => ({
        เลขออเดอร์: order.id,
        เลขคิว: order.queueNumber,
        วันที่และเวลา: order.createdAt,
        ชื่อลูกค้า: order.customerName,
        สินค้า: item.productName,
        "ท็อปปิ้ง/ตัวเลือก": (item.selectedOptions ?? []).join(", "),
        จำนวน: item.quantity,
        ราคาหลัก: item.priceBreakdown?.basePrice ?? item.basePrice,
        ค่าพรีเมียม: item.priceBreakdown?.premiumIncludedSurcharge ?? 0,
        ค่าเพิ่มพิเศษ: item.priceBreakdown?.extraToppingCharges ?? 0,
        ราคาต่อชิ้น: item.unitPrice,
        ยอดรวมรายการ: item.lineTotal ?? item.unitPrice * item.quantity,
        ส่วนลดทั้งออเดอร์: order.discount,
        ยอดสุทธิทั้งออเดอร์: order.total,
        วิธีชำระเงิน: paymentMethodLabel(order.paymentMethod),
        ช่องทางการขาย: channelLabels[order.channel] ?? order.channel,
        สถานะ: order.status === "completed" ? "พร้อมส่ง" : "ยกเลิก",
      })),
    );
}
