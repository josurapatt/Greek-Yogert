import { Plus, Save } from "lucide-react";
import { useState } from "react";
import "../catalogue.css";
import GlobalPackagingAvailabilityToggle from "../components/GlobalPackagingAvailabilityToggle";
import OptionGroupManager from "../components/OptionGroupManager";
import ProductOptionAssignmentsField from "../components/ProductOptionAssignmentsField";
import { catalogueAdminErrorMessage } from "../catalogueAdmin";
import { normalizeProduct, toppings } from "../data";
import { getChannelRules, getProductPrice, money } from "../lib";
import { productSelectedOptionLimits } from "../customerRequestPolicy";
import {
  fallbackOptionGroups,
  toppingsOptionGroupId,
} from "../optionCatalogue";
import { useData } from "../store";
import type {
  ChannelGroup,
  ChannelToppingRules,
  ChoiceSurchargeChannel,
  OptionChoice,
  OptionGroup,
  OrderChannel,
  Product,
} from "../types";

const blankProduct = (catalogueToppings: OptionChoice[]) =>
  normalizeProduct({
    id: `product-${Date.now()}`,
    name: "สินค้าใหม่",
    price: 0,
    emoji: "🥣",
    description: ["กรีกโยเกิร์ต"],
    optionMode: "none",
    includedToppings: 0,
    maxSelectedOptions: 0,
    granolaOptions: ["กล้วย", "เบอร์รี่รวม", "ช็อกโกแลต", "น้ำผึ้ง"],
    availableToppingIds: catalogueToppings
      .filter((item) => item.active)
      .map((item) => item.id),
    premiumToppingIds: catalogueToppings
      .filter((item) => item.active && item.classification === "premium")
      .map((item) => item.id),
    premiumIncludedSurcharge: 5,
    extraNormalPrice: 10,
    extraPremiumPrice: 15,
    supportsSeparatedToppingPackaging: true,
    optionGroupAssignments: [],
    active: true,
  });

export default function ProductsPage() {
  const {
    products: storedProducts,
    optionGroups: storedOptionGroups,
    toppingAvailability,
    saveProduct,
    saveOptionGroup,
    setToppingAvailability,
  } = useData();
  const products = [...storedProducts];
  const optionGroups = storedOptionGroups ?? fallbackOptionGroups;
  const catalogueToppings =
    optionGroups.find((group) => group.id === toppingsOptionGroupId)?.choices ??
    toppings.map((topping, displayOrder) => ({
      id: topping.id,
      name: topping.name,
      active: true,
      displayOrder,
      classification: topping.premium
        ? ("premium" as const)
        : ("normal" as const),
      surcharge: 0,
      availabilityId: topping.id,
      everUsed: true,
    }));
  const [editing, setEditing] = useState<Product | null>(null);
  const [saved, setSaved] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [choiceEditor, setChoiceEditor] = useState<{
    group: OptionGroup;
    choice: OptionChoice;
  } | null>(null);
  const [choiceSaving, setChoiceSaving] = useState(false);
  const [choiceStatusChanging, setChoiceStatusChanging] = useState("");
  const [choiceError, setChoiceError] = useState("");
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
    try {
      setSaving(true);
      setSaveError("");
      productSelectedOptionLimits(editing, optionGroups);
      await saveProduct(editing);
      setSaved(editing.id);
      setEditing(null);
      setTimeout(() => setSaved(""), 1800);
    } catch (cause) {
      setSaveError(
        catalogueAdminErrorMessage(
          cause,
          "ไม่สามารถบันทึกสินค้าได้ กรุณาลองใหม่",
        ),
      );
    } finally {
      setSaving(false);
    }
  };
  const openEditor = (product: Product) => {
    setSaveError("");
    setEditing(normalizeProduct(product));
  };
  const changeChoice = <K extends keyof OptionChoice>(
    key: K,
    value: OptionChoice[K],
  ) =>
    setChoiceEditor((current) =>
      current
        ? { ...current, choice: { ...current.choice, [key]: value } }
        : current,
    );
  const saveChoiceDetails = async () => {
    if (!choiceEditor) return;
    try {
      setChoiceSaving(true);
      setChoiceError("");
      await saveOptionGroup(
        {
          ...choiceEditor.group,
          choices: choiceEditor.group.choices.map((choice) =>
            choice.id === choiceEditor.choice.id ? choiceEditor.choice : choice,
          ),
        },
        choiceEditor.group,
      );
      setChoiceEditor(null);
    } catch (cause) {
      setChoiceError(
        catalogueAdminErrorMessage(
          cause,
          "ไม่สามารถบันทึกรายละเอียดตัวเลือกได้ กรุณาลองใหม่",
        ),
      );
    } finally {
      setChoiceSaving(false);
    }
  };
  const changeChoiceAvailability = async (
    availabilityId: string,
    available: boolean,
  ) => {
    try {
      setChoiceStatusChanging(availabilityId);
      setChoiceError("");
      await setToppingAvailability(availabilityId, available);
    } catch (cause) {
      setChoiceError(
        catalogueAdminErrorMessage(
          cause,
          "ไม่สามารถเปลี่ยนสถานะเปิดขายได้ กรุณาลองใหม่",
        ),
      );
    } finally {
      setChoiceStatusChanging("");
    }
  };
  const setChoiceChannelSurcharge = (
    channel: ChoiceSurchargeChannel,
    value: string,
  ) =>
    setChoiceEditor((current) => {
      if (!current) return current;
      const channelSurcharges = { ...current.choice.channelSurcharges };
      if (value === "") delete channelSurcharges[channel];
      else channelSurcharges[channel] = Number(value);
      return {
        ...current,
        choice: {
          ...current.choice,
          channelSurcharges:
            Object.keys(channelSurcharges).length > 0
              ? channelSurcharges
              : undefined,
        },
      };
    });

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">เมนู ราคา และกฎตามช่องทาง</p>
          <h1>จัดการสินค้า</h1>
          <p>ใช้สินค้าเดิมหนึ่งรายการ พร้อมราคาแยกตามช่องทาง</p>
        </div>
        <button
          className="primary"
          onClick={() => setEditing(blankProduct(catalogueToppings))}
        >
          <Plus /> เพิ่มสินค้า
        </button>
      </div>
      <section className="availability-panel">
        <GlobalPackagingAvailabilityToggle className="global-packaging-summary" />
        <div className="section-heading">
          <h2>สถานะตัวเลือก ท็อปปิ้ง และรสชาติ</h2>
          <p>
            ใช้ร่วมกันทุกช่องทาง กดการ์ดเพื่อแก้ประเภท ราคาเพิ่ม และสถานะเปิดขาย
          </p>
        </div>
        <div className="availability-grid">
          {optionGroups
            .filter((group) => group.active)
            .flatMap((group) =>
              group.choices
                .filter((choice) => choice.active)
                .map((choice) => ({ group, choice })),
            )
            .sort(
              (left, right) =>
                left.group.displayOrder - right.group.displayOrder ||
                left.choice.displayOrder - right.choice.displayOrder ||
                left.choice.id.localeCompare(right.choice.id),
            )
            .map(({ group, choice }) => {
              const availabilityId = choice.availabilityId ?? choice.id;
              const available = toppingAvailability[availabilityId] !== false;
              return (
                <article
                  className={`availability-card ${available ? "available" : "sold-out"}`}
                  key={`${group.id}/${choice.id}`}
                >
                  <button
                    type="button"
                    className="availability-card-editor"
                    onClick={() => {
                      setChoiceError("");
                      setChoiceEditor({
                        group: structuredClone(group),
                        choice: structuredClone(choice),
                      });
                    }}
                  >
                    <span>
                      <strong>{choice.name}</strong>
                      <small>{group.displayName}</small>
                    </span>
                    <span className="availability-card-details">
                      <small>
                        {choice.classification === "premium"
                          ? "พรีเมียม"
                          : "ปกติ"}
                        {choice.surcharge > 0
                          ? ` · +${choice.surcharge} บาท`
                          : ""}
                      </small>
                      <b>{available ? "เปิดขาย" : "หมด"}</b>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="secondary availability-card-toggle"
                    disabled={choiceStatusChanging === availabilityId}
                    onClick={() =>
                      void changeChoiceAvailability(availabilityId, !available)
                    }
                  >
                    {choiceStatusChanging === availabilityId
                      ? "กำลังบันทึก…"
                      : available
                        ? "ปิดขาย"
                        : "เปิดขาย"}
                  </button>
                </article>
              );
            })}
        </div>
        {choiceError && !choiceEditor && (
          <p className="validation" role="alert">
            {choiceError}
          </p>
        )}
      </section>
      <OptionGroupManager />
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
              <button className="secondary" onClick={() => openEditor(product)}>
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
                  <ProductOptionAssignmentsField
                    onChange={(assignments) =>
                      change("optionGroupAssignments", assignments)
                    }
                    optionGroups={optionGroups}
                    product={editing}
                  />
                  {editing.optionGroupAssignments === undefined && (
                    <details className="wide legacy-product-settings">
                      <summary>การตั้งค่าตัวเลือกแบบเดิม</summary>
                      <p className="hint">
                        ใช้สำหรับสินค้าเก่าที่ยังไม่ได้เปลี่ยนมาใช้กลุ่มตัวเลือก
                      </p>
                      <div className="form-grid">
                        <label>
                          รูปแบบตัวเลือกเดิม
                          <select
                            value={editing.optionMode}
                            onChange={(event) =>
                              setEditing((product) => {
                                if (!product) return product;
                                const optionMode = event.target
                                  .value as Product["optionMode"];
                                return {
                                  ...product,
                                  optionMode,
                                  maxSelectedOptions:
                                    optionMode === "none"
                                      ? 0
                                      : optionMode === "granola"
                                        ? 1
                                        : Math.max(
                                            product.includedToppings,
                                            10,
                                          ),
                                };
                              })
                            }
                          >
                            <option value="none">ไม่มี</option>
                            <option value="granola">เลือกรสกราโนล่า</option>
                            <option value="toppings">เลือกท็อปปิ้ง</option>
                          </select>
                        </label>
                        <label className="inline-check">
                          <input
                            type="checkbox"
                            checked={
                              editing.supportsSeparatedToppingPackaging !==
                              false
                            }
                            onChange={(event) =>
                              change(
                                "supportsSeparatedToppingPackaging",
                                event.target.checked,
                              )
                            }
                          />{" "}
                          รองรับแยกท็อปปิ้ง
                        </label>
                        {editing.optionMode === "toppings" && (
                          <label>
                            จำนวนท็อปปิ้งที่รวม
                            <input
                              type="number"
                              min="0"
                              max="10"
                              value={editing.includedToppings}
                              onChange={(event) =>
                                change(
                                  "includedToppings",
                                  Number(event.target.value),
                                )
                              }
                            />
                          </label>
                        )}
                        {editing.optionMode === "toppings" && (
                          <label>
                            จำนวนท็อปปิ้งสูงสุด
                            <input
                              type="number"
                              min={editing.includedToppings}
                              max="10"
                              value={editing.maxSelectedOptions ?? 10}
                              onChange={(event) =>
                                change(
                                  "maxSelectedOptions",
                                  Number(event.target.value),
                                )
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
                      </div>
                    </details>
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
                {editing.optionGroupAssignments === undefined &&
                  editing.optionMode === "toppings" && (
                    <details className="legacy-product-settings">
                      <summary>ราคาและกฎท็อปปิ้งแบบเดิม</summary>
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
                          {catalogueToppings.map((topping) => {
                            const selected =
                              platformRules.allowedExtraToppingIds.includes(
                                topping.id,
                              );
                            return (
                              <label
                                className={topping.active ? "" : "disabled"}
                                key={topping.id}
                              >
                                <input
                                  disabled={!topping.active && !selected}
                                  type="checkbox"
                                  checked={selected}
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
                            );
                          })}
                        </div>
                      </fieldset>
                      <fieldset>
                        <legend>
                          ท็อปปิ้งที่ขายกับสินค้านี้ (ขาย / พรีเมียม)
                        </legend>
                        <div className="check-grid">
                          {catalogueToppings.map((topping) => {
                            const selected =
                              editing.availableToppingIds.includes(topping.id);
                            return (
                              <label
                                className={topping.active ? "" : "disabled"}
                                key={topping.id}
                              >
                                <input
                                  disabled={!topping.active && !selected}
                                  type="checkbox"
                                  checked={selected}
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
                                            ...(editing.premiumToppingIds ??
                                              []),
                                            topping.id,
                                          ],
                                    )
                                  }
                                />
                                <small>พรีเมียม</small>
                              </label>
                            );
                          })}
                        </div>
                      </fieldset>
                    </details>
                  )}
                {saveError && <p className="validation">{saveError}</p>}
                <div className="modal-footer">
                  <button
                    className="secondary"
                    disabled={saving}
                    onClick={() => setEditing(null)}
                  >
                    ยกเลิก
                  </button>
                  <button
                    className="primary"
                    disabled={saving}
                    onClick={() => void save()}
                  >
                    <Save /> {saving ? "กำลังบันทึก…" : "บันทึกสินค้า"}
                  </button>
                </div>
              </section>
            </div>
          );
        })()}
      {choiceEditor &&
        (() => {
          const availabilityId =
            choiceEditor.choice.availabilityId ?? choiceEditor.choice.id;
          const available = toppingAvailability[availabilityId] !== false;
          return (
            <div className="modal-backdrop">
              <section className="modal-card choice-quick-editor">
                <h2>แก้ไข {choiceEditor.choice.name}</h2>
                <p className="hint">กลุ่ม {choiceEditor.group.displayName}</p>
                <div className="form-grid">
                  <label>
                    ประเภทตัวเลือก
                    <select
                      value={choiceEditor.choice.classification}
                      onChange={(event) =>
                        changeChoice(
                          "classification",
                          event.target.value as OptionChoice["classification"],
                        )
                      }
                    >
                      <option value="normal">ปกติ</option>
                      <option value="premium">พรีเมียม</option>
                    </select>
                  </label>
                  <label>
                    ราคาเพิ่มเริ่มต้น
                    <input
                      type="number"
                      min="0"
                      max="5000"
                      value={choiceEditor.choice.surcharge}
                      onChange={(event) =>
                        changeChoice("surcharge", Number(event.target.value))
                      }
                    />
                  </label>
                  {(
                    [
                      ["หน้าร้าน", "ราคาเพิ่มหน้าร้าน"],
                      ["Openchat", "ราคาเพิ่ม OpenChat"],
                      ["Lineman", "ราคาเพิ่ม LINE MAN"],
                      ["Grab", "ราคาเพิ่ม Grab"],
                      ["customerQr", "ราคาเพิ่ม Customer QR"],
                    ] as const
                  ).map(([channel, label]) => (
                    <label key={channel}>
                      {label}
                      <input
                        type="number"
                        min="0"
                        max="5000"
                        value={
                          choiceEditor.choice.channelSurcharges?.[channel] ?? ""
                        }
                        placeholder={`ใช้ค่าเริ่มต้น ${choiceEditor.choice.surcharge} บาท`}
                        onChange={(event) =>
                          setChoiceChannelSurcharge(channel, event.target.value)
                        }
                      />
                    </label>
                  ))}
                </div>
                <div className="choice-sale-state">
                  <span>
                    สถานะเปิดขาย:{" "}
                    <strong>{available ? "เปิดขาย" : "หมด"}</strong>
                  </span>
                  <button
                    type="button"
                    className="secondary"
                    disabled={choiceStatusChanging === availabilityId}
                    onClick={() =>
                      void changeChoiceAvailability(availabilityId, !available)
                    }
                  >
                    {available ? "เปลี่ยนเป็นหมด" : "เปิดขายตัวเลือกนี้"}
                  </button>
                </div>
                <p className="hint">
                  เว้นว่างเพื่อใช้ราคาเพิ่มเริ่มต้น โดย Customer QR จะใช้ราคา
                  หน้าร้านเมื่อไม่ได้กำหนดราคาเฉพาะ
                </p>
                {choiceError && <p className="validation">{choiceError}</p>}
                <div className="modal-footer">
                  <button
                    className="secondary"
                    disabled={choiceSaving}
                    onClick={() => setChoiceEditor(null)}
                  >
                    ยกเลิก
                  </button>
                  <button
                    className="primary"
                    disabled={choiceSaving}
                    onClick={() => void saveChoiceDetails()}
                  >
                    <Save />{" "}
                    {choiceSaving ? "กำลังบันทึก…" : "บันทึกรายละเอียด"}
                  </button>
                </div>
              </section>
            </div>
          );
        })()}
    </div>
  );
}
