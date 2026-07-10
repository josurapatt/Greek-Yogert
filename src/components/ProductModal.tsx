import { Minus, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toppings } from "../data";
import {
  calculatePriceBreakdown,
  channelLabels,
  getChannelGroup,
  getChannelRules,
  money,
  validateSelection,
} from "../lib";
import type { CartItem, OrderChannel, Product } from "../types";

interface Props {
  product: Product;
  channel: OrderChannel;
  initial?: CartItem;
  onClose(): void;
  onSave(item: CartItem): void;
}

export default function ProductModal({
  product,
  channel,
  initial,
  onClose,
  onSave,
}: Props) {
  const [selected, setSelected] = useState<string[]>(
    initial?.selectedOptionIds ?? [],
  );
  const [quantity, setQuantity] = useState(initial?.quantity ?? 1);
  const rules = getChannelRules(product, channel);
  const isPlatform = getChannelGroup(channel) === "platform";
  const error = validateSelection(product, selected, channel);
  const breakdown = useMemo(
    () => calculatePriceBreakdown(product, selected, toppings, channel),
    [product, selected, channel],
  );
  const options = product.availableToppingIds
    .map((id) => toppings.find((item) => item.id === id))
    .filter(Boolean) as typeof toppings;
  const extraOptions = rules.allowedExtraToppingIds
    .map((id) => toppings.find((item) => item.id === id))
    .filter(Boolean) as typeof toppings;
  const includedCount = Math.min(selected.length, product.includedToppings);

  const addTopping = (id: string) =>
    setSelected((rows) => {
      if (!rules.allowDuplicateToppings && rows.includes(id)) return rows;
      return [...rows, id];
    });
  const removeTopping = (id: string) =>
    setSelected((rows) => {
      const index = rows.lastIndexOf(id);
      return index < 0
        ? rows
        : rows.filter((_, rowIndex) => rowIndex !== index);
    });
  const save = () => {
    if (error) return;
    const names =
      product.optionMode === "granola"
        ? selected.map((name) => `กราโนล่ารส${name}`)
        : selected.map(
            (id) => toppings.find((entry) => entry.id === id)?.name ?? id,
          );
    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      productId: product.id,
      productName: product.name,
      basePrice: breakdown.basePrice,
      selectedOptions: names,
      selectedOptionIds: selected,
      selectedChannel: channel,
      quantity,
      unitPrice: breakdown.unitPrice,
      lineTotal: breakdown.unitPrice * quantity,
      priceBreakdown: breakdown,
    });
  };
  const isPremium = (id: string) =>
    product.premiumToppingIds
      ? product.premiumToppingIds.includes(id)
      : Boolean(toppings.find((item) => item.id === id)?.premium);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section className="modal-card">
        <button
          className="icon-button modal-close"
          onClick={onClose}
          aria-label="ปิด"
        >
          <X />
        </button>
        <div className="product-hero">
          <span>{product.emoji}</span>
          <div>
            <p className="eyebrow">{channelLabels[channel]}</p>
            <h2>{product.name}</h2>
            <strong>{money(breakdown.basePrice)}</strong>
          </div>
        </div>
        <ul className="contents-list">
          {product.description.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {product.optionMode === "granola" && (
          <div>
            <h3>
              เลือกรสกราโนล่า <em>จำเป็น</em>
            </h3>
            <div className="choice-grid">
              {product.granolaOptions.map((name) => (
                <button
                  className={
                    selected[0] === name ? "choice selected" : "choice"
                  }
                  key={name}
                  onClick={() => setSelected([name])}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        )}
        {product.optionMode === "toppings" && (
          <div>
            <h3>
              ท็อปปิ้งที่รวมในเมนู{" "}
              <em>เลือก {product.includedToppings} อย่าง</em>
            </h3>
            <p className="hint">
              {rules.allowDuplicateToppings
                ? "เลือกซ้ำได้"
                : "เลือกได้อย่างละ 1 ครั้ง"}{" "}
              • พรีเมียม +{rules.premiumIncludedSurcharge} บาท
            </p>
            <div className="topping-list">
              {options.map((option) => {
                const count = selected.filter((id) => id === option.id).length;
                const includedFull =
                  isPlatform && includedCount >= product.includedToppings;
                return (
                  <div className="topping-row" key={option.id}>
                    <span>
                      {option.name}
                      {isPremium(option.id) && <small> พรีเมียม</small>}
                    </span>
                    <div>
                      <button
                        onClick={() => removeTopping(option.id)}
                        disabled={!count}
                      >
                        <Minus />
                      </button>
                      <b>{count}</b>
                      <button
                        onClick={() => addTopping(option.id)}
                        disabled={
                          includedFull ||
                          (!rules.allowDuplicateToppings && count > 0)
                        }
                      >
                        <Plus />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            {isPlatform && (
              <>
                <h3>
                  เพิ่มพิเศษ <em>+{rules.extraNormalPrice} บาท</em>
                </h3>
                <p className="hint">
                  เพิ่มได้เฉพาะกราโนล่าและบิสคอฟ หลังเลือกท็อปปิ้งในเมนูครบแล้ว
                </p>
                <div className="choice-grid extra-grid">
                  {extraOptions.map((option) => (
                    <button
                      className={
                        selected
                          .slice(product.includedToppings)
                          .includes(option.id)
                          ? "choice selected"
                          : "choice"
                      }
                      key={option.id}
                      disabled={
                        includedCount < product.includedToppings ||
                        selected.includes(option.id)
                      }
                      onClick={() => addTopping(option.id)}
                    >
                      <Plus /> {option.name}
                    </button>
                  ))}
                </div>
              </>
            )}
            {!isPlatform && (
              <p className="hint extra-hint">
                เกินโควตา: ท็อปปิ้งปกติ +{rules.extraNormalPrice} บาท • พรีเมียม
                +{rules.extraPremiumPrice} บาท
              </p>
            )}
            <p className="selection-count">
              เลือกแล้ว {selected.length} อย่าง{" "}
              {selected.length > product.includedToppings &&
                `(${selected.length - product.includedToppings} เพิ่มพิเศษ)`}
            </p>
          </div>
        )}
        <div className="price-breakdown">
          <span>ราคาหลัก {money(breakdown.basePrice)}</span>
          {breakdown.premiumIncludedSurcharge > 0 && (
            <span>พรีเมียม +{money(breakdown.premiumIncludedSurcharge)}</span>
          )}
          {breakdown.extraToppingCharges > 0 && (
            <span>เพิ่มพิเศษ +{money(breakdown.extraToppingCharges)}</span>
          )}
        </div>
        <div className="modal-footer">
          <div className="quantity">
            <button onClick={() => setQuantity(Math.max(1, quantity - 1))}>
              <Minus />
            </button>
            <b>{quantity}</b>
            <button onClick={() => setQuantity(quantity + 1)}>
              <Plus />
            </button>
          </div>
          <button
            className="primary grow"
            disabled={Boolean(error)}
            onClick={save}
          >
            {initial ? "บันทึกการแก้ไข" : "เพิ่มลงตะกร้า"} •{" "}
            {money(breakdown.unitPrice * quantity)}
          </button>
        </div>
        {error && <p className="validation">{error}</p>}
      </section>
    </div>
  );
}
