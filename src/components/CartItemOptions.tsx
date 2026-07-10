export default function CartItemOptions({ options }: { options: string[] }) {
  return options.length > 0 ? (
    <p className="cart-item-options">{options.join(" • ")}</p>
  ) : null;
}
