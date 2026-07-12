export default function PendingBadge({ count }: { count: number }) {
  return count > 0 ? <b className="badge">{count}</b> : null;
}
