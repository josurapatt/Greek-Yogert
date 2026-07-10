import { Plus, Save } from "lucide-react";
import { useState } from "react";
import { normalizeProduct, toppings } from "../data";
import { getChannelRules, getProductPrice, money } from "../lib";
import { useData } from "../store";
import type {
  ChannelGroup,
  ChannelToppingRules,
  OrderChannel,
  Product,
} from "../types";

const blankProduct = () =>
  normalizeProduct({
    id: `product-${Date.now()}`,
    name: "สินค้าใหม่",
    price: 0,
    emoji: "🥣",
    description: ["กรีกโยเกิร์ต"],
    optionMode: "none",
    includedToppings: 0,
    granolaOptions: ["กล้วย", "เบอร์รี่รวม", "ช็อกโกแลต", "น้ำผึ้ง"],
    availableToppingIds: toppings.map((item) => item.id),
    premiumToppingIds: toppings
      .filter((item) => item.premium)
      .map((item) => item.id),
    premiumIncludedSurcharge: 5,
    extraNormalPrice: 10,
    extraPremiumPrice: 15,
    active: true,
  });

export default function ProductsPage() {
  const { products: storedProducts, saveProduct } = useData();
  const products = [...storedProducts];
  const [editing, setEditing] = useState<Product | null>(null);
  const [saved, setSaved] = useState("");
  const change = <K extends keyof Product>(key: K, value: Product[K]) =>
    setEditing((product) => (product ? { ...product, [key]: value } : product));
  const setPrice = (channel: OrderChannel, value: number) =>
    setEditing((product) =>
      product
        ? {
            ...product,
            price: channel === "หน้าร้าน" ? value : product.price,
            channelPrices: { ...product.channelPrices, [channel]: value },
          }
        : product,
    );
  const setRule = <K extends keyof ChannelToppingRules>(
    group: ChannelGroup,
    key: K,
    value: ChannelToppingRules[K],
  ) =>
    setEditing((product) => {
      if (!product) return product;
      const current = getChannelRules(
        product,
        group === "platform" ? "Lineman" : "หน้าร้าน",
      );
      return {
        ...product,
        channelRules: {
          ...product.channelRules,
          [group]: { ...current, [key]: value },
        },
      };
    });
  const save = async () => {
    if (!editing?.name.trim() || editing.price < 0) return;
    await saveProduct(editing);
    setSaved(editing.id);
    setEditing(null);
    setTimeout(() => setSaved(""), 1800);
  };

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">เมนู ราคา และกฎตามช่องทาง</p>
          <h1>จัดการสินค้า</h1>
          <p>ใช้สินค้าเดิมหนึ่งรายการ พร้อมราคาแยกตามช่องทาง</p>
        </div>
        <button className="primary" onClick={() => setEditing(blankProduct())}>
          <Plus /> เพิ่มสินค้า
        </button>
      </div>
      <section className="manage-grid">
        {products
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((product) => (
            <article
              className={`manage-card ${!product.active ? "disabled" : ""}`}
              key={product.id}
            >
              <span className="manage-emoji">{product.emoji}</span>
              <div>
                <h2>{product.name}</h2>
                <p>
                  หน้าร้าน {money(getProductPrice(product, "หน้าร้าน"))} • LINE
                  MAN {money(getProductPrice(product, "Lineman"))} • Grab{" "}
                  {money(getProductPrice(product, "Grab"))}
                </p>
                <strong>
                  {product.optionMode === "toppings"
                    ? `รวม ${product.includedToppings} ท็อปปิ้ง`
                    : product.optionMode === "granola"
                      ? "เลือกรสกราโนล่า"
                      : "ไม่มีตัวเลือกบังคับ"}
                </strong>
                {saved === product.id && (
                  <small className="saved">บันทึกแล้ว</small>
                )}
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={product.active}
                  onChange={() =>
                    void saveProduct({ ...product, active: !product.active })
                  }
                />
                <span />
              </label>
              <button
                className="secondary"
                onClick={() => setEditing(normalizeProduct(product))}
              >
                แก้ไข
              </button>
            </article>
          ))}
      </section>
      {editing &&
        (() => {
          const storefrontRules = getChannelRules(editing, "หน้าร้าน");
          const platformRules = getChannelRules(editing, "Lineman");
          return (
            <div className="modal-backdrop">
              <section className="modal-card product-editor">
                <h2>
                  {editing.name === "สินค้าใหม่"
                    ? "เพิ่มสินค้า"
                    : `แก้ไข ${editing.name}`}
                </h2>
                <div className="form-grid">
                  <label>
                    ชื่อสินค้า
                    <input
                      value={editing.name}
                      onChange={(event) => change("name", event.target.value)}
                    />
                  </label>
                  <label>
                    อีโมจิ
                    <input
                      value={editing.emoji}
                      onChange={(event) => change("emoji", event.target.value)}
                    />
                  </label>
                  <label>
                    ราคาหน้าร้าน
                    <input
                      type="number"
                      min="0"
                      value={getProductPrice(editing, "หน้าร้าน")}
                      onChange={(event) =>
                        setPrice("หน้าร้าน", Number(event.target.value))
                      }
                    />
                  </label>
                  <label>
                    ราคา Openchat
                    <input
                      type="number"
                      min="0"
                      value={getProductPrice(editing, "Openchat")}
                      onChange={(event) =>
                        setPrice("Openchat", Number(event.target.value))
                      }
                    />
                  </label>
                  <label>
                    ราคา LINE MAN
                    <input
                      type="number"
                      min="0"
                      value={getProductPrice(editing, "Lineman")}
                      onChange={(event) =>
                        setPrice("Lineman", Number(event.target.value))
                      }
                    />
                  </label>
                  <label>
                    ราคา Grab
                    <input
                      type="number"
                      min="0"
                      value={getProductPrice(editing, "Grab")}
                      onChange={(event) =>
                        setPrice("Grab", Number(event.target.value))
                      }
                    />
                  </label>
                  <label>
                    รูปแบบตัวเลือก
                    <select
                      value={editing.optionMode}
                      onChange={(event) =>
                        change(
                          "optionMode",
                          event.target.value as Product["optionMode"],
                        )
                      }
                    >
                      <option value="none">ไม่มี</option>
                      <option value="granola">เลือกรสกราโนล่า</option>
                      <option value="toppings">เลือกท็อปปิ้ง</option>
                    </select>
                  </label>
                  {editing.optionMode === "toppings" && (
                    <label>
                      จำนวนท็อปปิ้งที่รวม
                      <input
                        type="number"
                        min="0"
                        value={editing.includedToppings}
                        onChange={(event) =>
                          change("includedToppings", Number(event.target.value))
                        }
                      />
                    </label>
                  )}
                  {editing.optionMode === "granola" && (
                    <label className="wide">
                      รสกราโนล่า (คั่นด้วยจุลภาค)
                      <input
                        value={editing.granolaOptions.join(", ")}
                        onChange={(event) =>
                          change(
                            "granolaOptions",
                            event.target.value
                              .split(",")
                              .map((item) => item.trim())
                              .filter(Boolean),
                          )
                        }
                      />
                    </label>
                  )}
                  <label className="wide">
                    รายละเอียด (หนึ่งบรรทัดต่อรายการ)
                    <textarea
                      rows={3}
                      value={editing.description.join("\n")}
                      onChange={(event) =>
                        change(
                          "description",
                          event.target.value.split("\n").filter(Boolean),
                        )
                      }
                    />
                  </label>
                </div>
                {editing.optionMode === "toppings" && (
                  <>
                    <fieldset className="rule-fieldset">
                      <legend>กฎหน้าร้าน / Openchat</legend>
                      <div className="form-grid">
                        <label>
                          ค่าพรีเมียมในโควตา
                          <input
                            type="number"
                            min="0"
                            value={storefrontRules.premiumIncludedSurcharge}
                            onChange={(event) =>
                              setRule(
                                "storefront",
                                "premiumIncludedSurcharge",
                                Number(event.target.value),
                              )
                            }
                          />
                        </label>
                        <label>
                          ท็อปปิ้งปกติเพิ่ม
                          <input
                            type="number"
                            min="0"
                            value={storefrontRules.extraNormalPrice}
                            onChange={(event) =>
                              setRule(
                                "storefront",
                                "extraNormalPrice",
                                Number(event.target.value),
                              )
                            }
                          />
                        </label>
                        <label>
                          ท็อปปิ้งพรีเมียมเพิ่ม
                          <input
                            type="number"
                            min="0"
                            value={storefrontRules.extraPremiumPrice}
                            onChange={(event) =>
                              setRule(
                                "storefront",
                                "extraPremiumPrice",
                                Number(event.target.value),
                              )
                            }
                          />
                        </label>
                        <label className="inline-check">
                          <input
                            type="checkbox"
                            checked={storefrontRules.allowDuplicateToppings}
                            onChange={(event) =>
                              setRule(
                                "storefront",
                                "allowDuplicateToppings",
                                event.target.checked,
                              )
                            }
                          />{" "}
                          อนุญาตเลือกซ้ำ
                        </label>
                      </div>
                    </fieldset>
                    <fieldset className="rule-fieldset">
                      <legend>กฎ LINE MAN / Grab</legend>
                      <div className="form-grid">
                        <label>
                          ค่าพรีเมียมในโควตา
                          <input
                            type="number"
                            min="0"
                            value={platformRules.premiumIncludedSurcharge}
                            onChange={(event) =>
                              setRule(
                                "platform",
                                "premiumIncludedSurcharge",
                                Number(event.target.value),
                              )
                            }
                          />
                        </label>
                        <label>
                          ราคาเพิ่มพิเศษ
                          <input
                            type="number"
                            min="0"
                            value={platformRules.extraNormalPrice}
                            onChange={(event) => {
                              const value = Number(event.target.value);
                              setRule("platform", "extraNormalPrice", value);
                              setRule("platform", "extraPremiumPrice", value);
                            }}
                          />
                        </label>
                        <label className="inline-check">
                          <input
                            type="checkbox"
                            checked={platformRules.allowDuplicateToppings}
                            onChange={(event) =>
                              setRule(
                                "platform",
                                "allowDuplicateToppings",
                                event.target.checked,
                              )
                            }
                          />{" "}
                          อนุญาตเลือกซ้ำ
                        </label>
                      </div>
                      <p className="hint">ท็อปปิ้งที่อนุญาตให้เพิ่มพิเศษ</p>
                      <div className="check-grid">
                        {toppings.map((topping) => (
                          <label key={topping.id}>
                            <input
                              type="checkbox"
                              checked={platformRules.allowedExtraToppingIds.includes(
                                topping.id,
                              )}
                              onChange={() =>
                                setRule(
                                  "platform",
                                  "allowedExtraToppingIds",
                                  platformRules.allowedExtraToppingIds.includes(
                                    topping.id,
                                  )
                                    ? platformRules.allowedExtraToppingIds.filter(
                                        (id) => id !== topping.id,
                                      )
                                    : [
                                        ...platformRules.allowedExtraToppingIds,
                                        topping.id,
                                      ],
                                )
                              }
                            />
                            <span>{topping.name}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <fieldset>
                      <legend>
                        ท็อปปิ้งที่ขายกับสินค้านี้ (ขาย / พรีเมียม)
                      </legend>
                      <div className="check-grid">
                        {toppings.map((topping) => (
                          <label key={topping.id}>
                            <input
                              type="checkbox"
                              checked={editing.availableToppingIds.includes(
                                topping.id,
                              )}
                              onChange={() =>
                                change(
                                  "availableToppingIds",
                                  editing.availableToppingIds.includes(
                                    topping.id,
                                  )
                                    ? editing.availableToppingIds.filter(
                                        (id) => id !== topping.id,
                                      )
                                    : [
                                        ...editing.availableToppingIds,
                                        topping.id,
                                      ],
                                )
                              }
                            />
                            <span>{topping.name}</span>
                            <input
                              title="พรีเมียม"
                              type="checkbox"
                              checked={editing.premiumToppingIds?.includes(
                                topping.id,
                              )}
                              onChange={() =>
                                change(
                                  "premiumToppingIds",
                                  editing.premiumToppingIds?.includes(
                                    topping.id,
                                  )
                                    ? editing.premiumToppingIds.filter(
                                        (id) => id !== topping.id,
                                      )
                                    : [
                                        ...(editing.premiumToppingIds ?? []),
                                        topping.id,
                                      ],
                                )
                              }
                            />
                            <small>พรีเมียม</small>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  </>
                )}
                <div className="modal-footer">
                  <button
                    className="secondary"
                    onClick={() => setEditing(null)}
                  >
                    ยกเลิก
                  </button>
                  <button className="primary" onClick={() => void save()}>
                    <Save /> บันทึกสินค้า
                  </button>
                </div>
              </section>
            </div>
          );
        })()}
    </div>
  );
}
