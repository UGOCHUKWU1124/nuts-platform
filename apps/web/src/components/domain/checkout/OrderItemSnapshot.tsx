import { cn } from "@/lib/util";

const STATUS: Record<string, { label: string; className: string }> = {
  PENDING: { label: "Pending", className: "bg-amber-100 text-amber-800" },
  PROCESSING: { label: "Processing", className: "bg-blue-100 text-blue-800" },
  SHIPPED: { label: "Shipped", className: "bg-indigo-100 text-indigo-800" },
  DELIVERED: { label: "Delivered", className: "bg-green-100 text-green-800" },
  CANCELLED: { label: "Cancelled", className: "bg-red-100 text-red-800" },
};

export function OrderStatusBadge({ status }: { status: string }) {
  const entry = STATUS[status] ?? { label: status, className: "bg-gray-100 text-gray-800" };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        entry.className,
      )}
    >
      {entry.label}
    </span>
  );
}

export function PaymentStatusBadge({ status }: { status: string }) {
  const paid = status.toLowerCase().includes("paid") || status === "SUCCESS";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        paid
          ? "bg-green-100 text-green-800"
          : "bg-amber-100 text-amber-800",
      )}
    >
      {paid ? "Paid" : status}
    </span>
  );
}
