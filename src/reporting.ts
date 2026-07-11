import { channelLabels, orderPaymentLabel, paymentMethodLabel } from "./lib";
import type { OrderChannel, ShopOrder } from "./types";

export const reportChannels: OrderChannel[] = [
  "หน้าร้าน",
  "Lineman",
  "Grab",
  "Openchat",
];

export const salesChannelColors: Record<OrderChannel, string> = {
  หน้าร้าน: "#7161ad",
  Lineman: "#56a66f",
  Grab: "#e5b83f",
  Openchat: "#5797bd",
};

export interface ChannelSalesValue {
  channel: OrderChannel;
  sales: number;
  orderCount: number;
}

export interface HourlyChannelSales {
  hour: number;
  label: string;
  channels: Record<OrderChannel, number>;
  total: number;
}

const emptyChannelAmounts = (): Record<OrderChannel, number> => ({
  หน้าร้าน: 0,
  Lineman: 0,
  Grab: 0,
  Openchat: 0,
});

export function normalizeSalesChannel(value: unknown): OrderChannel | null {
  if (typeof value !== "string") return null;
  const compact = value
    .trim()
    .toLocaleLowerCase("en")
    .replace(/[\s_-]+/g, "");
  if (value.trim() === "หน้าร้าน" || compact === "storefront")
    return "หน้าร้าน";
  if (compact === "lineman") return "Lineman";
  if (compact === "grab") return "Grab";
  if (compact === "openchat") return "Openchat";
  return null;
}

const bangkokHourFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Bangkok",
  hour: "2-digit",
  hourCycle: "h23",
});

export function bangkokHour(value: string): number | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const hour = Number(bangkokHourFormatter.format(date));
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : null;
}

export function aggregateSalesChannels(orders: ShopOrder[]) {
  const completed = orders.filter((order) => order.status === "completed");
  const summary = Object.fromEntries(
    reportChannels.map((channel) => [
      channel,
      { channel, sales: 0, orderCount: 0 },
    ]),
  ) as Record<OrderChannel, ChannelSalesValue>;
  const byHour = new Map<number, Record<OrderChannel, number>>();
  const unknown = { sales: 0, orderCount: 0 };

  completed.forEach((order) => {
    const total = Number.isFinite(order.total) ? order.total : 0;
    const channel = normalizeSalesChannel(order.channel);
    if (!channel) {
      unknown.sales += total;
      unknown.orderCount += 1;
      return;
    }
    summary[channel].sales += total;
    summary[channel].orderCount += 1;
    const hour = bangkokHour(order.createdAt);
    if (hour === null) return;
    const amounts = byHour.get(hour) ?? emptyChannelAmounts();
    amounts[channel] += total;
    byHour.set(hour, amounts);
  });

  const hourly: HourlyChannelSales[] = [...byHour.entries()]
    .sort(([left], [right]) => left - right)
    .map(([hour, channels]) => ({
      hour,
      label: `${String(hour).padStart(2, "0")}:00–${String(hour).padStart(2, "0")}:59`,
      channels,
      total: reportChannels.reduce(
        (sum, channel) => sum + channels[channel],
        0,
      ),
    }));

  return {
    channels: reportChannels.map((channel) => summary[channel]),
    hourly,
    unknown,
  };
}

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
        วิธีชำระเงิน: item.paymentMethod
          ? paymentMethodLabel(item.paymentMethod)
          : orderPaymentLabel(order),
        ช่องทางการขาย: channelLabels[order.channel] ?? order.channel,
        สถานะ: order.status === "completed" ? "พร้อมส่ง" : "ยกเลิก",
      })),
    );
}
