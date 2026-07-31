import {
  legacyProductOptionGroupAssignments,
  normalizeProductOptionGroupAssignments,
} from "../optionCatalogue";
import type {
  OptionGroup,
  Product,
  ProductOptionGroupAssignment,
} from "../types";

interface Props {
  product: Product;
  optionGroups: OptionGroup[];
  onChange(assignments: ProductOptionGroupAssignment[] | undefined): void;
}

export default function ProductOptionAssignmentsField({
  product,
  optionGroups,
  onChange,
}: Props) {
  const legacyModeLabel =
    product.optionMode === "toppings"
      ? "ท็อปปิ้ง"
      : product.optionMode === "granola"
        ? "รสกราโนล่า"
        : "ไม่มีตัวเลือก";

  if (product.optionGroupAssignments === undefined)
    return (
      <fieldset className="wide assignment-fieldset">
        <legend>กลุ่มตัวเลือกที่ผูกกับสินค้า</legend>
        <p className="hint">
          สินค้าเดิมนี้ยังใช้รูปแบบ {legacyModeLabel} แบบเก่า
          หากต้องการใช้กลุ่มตัวเลือกที่สร้างในแค็ตตาล็อก
          ให้เปลี่ยนมาใช้การผูกกลุ่มด้านล่าง
        </p>
        <button
          className="secondary"
          type="button"
          onClick={() => onChange(legacyProductOptionGroupAssignments(product))}
        >
          เปลี่ยนมาใช้กลุ่มตัวเลือก
        </button>
      </fieldset>
    );

  const assignments = normalizeProductOptionGroupAssignments(
    product.optionGroupAssignments,
  );
  const update = (
    groupId: string,
    patch: Partial<ProductOptionGroupAssignment>,
  ) =>
    onChange(
      assignments.map((assignment) =>
        assignment.groupId === groupId
          ? { ...assignment, ...patch }
          : assignment,
      ),
    );

  return (
    <fieldset className="wide assignment-fieldset">
      <legend>กลุ่มตัวเลือกที่ผูกกับสินค้า</legend>
      <p className="hint">
        เลือกกลุ่มที่ลูกค้าจะเห็นสำหรับสินค้านี้
        การยกเลิกการผูกจะไม่เปลี่ยนกลุ่มหรือข้อมูลประวัติเดิม
      </p>
      <div className="assignment-list">
        {[...optionGroups]
          .sort(
            (left, right) =>
              left.displayOrder - right.displayOrder ||
              left.id.localeCompare(right.id),
          )
          .map((group) => {
            const assignment = assignments.find(
              (entry) => entry.groupId === group.id,
            );
            const assigned = Boolean(assignment);
            const allChoices = assignment?.choiceIds === undefined;
            return (
              <article
                className={`assignment-card ${group.active ? "" : "disabled"}`}
                key={group.id}
              >
                <label className="inline-check">
                  <input
                    checked={assigned}
                    disabled={!group.active && !assigned}
                    type="checkbox"
                    onChange={(event) => {
                      if (
                        !event.target.checked &&
                        !window.confirm(
                          `ยกเลิกการผูก ${group.displayName} ออกจากสินค้านี้หรือไม่? ข้อมูลประวัติเดิมจะไม่เปลี่ยนแปลง`,
                        )
                      )
                        return;
                      onChange(
                        event.target.checked
                          ? [...assignments, { groupId: group.id }]
                          : assignments.filter(
                              (entry) => entry.groupId !== group.id,
                            ),
                      );
                    }}
                  />
                  <strong>{group.displayName}</strong>
                  {!group.active && <small>กลุ่มที่เก็บถาวร</small>}
                </label>
                {assignment && (
                  <details className="assignment-advanced">
                    <summary>ปรับเงื่อนไขเฉพาะสินค้านี้</summary>
                    <div className="assignment-limits">
                      <label>
                        จำเป็นต้องเลือก
                        <input
                          checked={assignment.required ?? group.required}
                          type="checkbox"
                          onChange={(event) =>
                            update(group.id, {
                              required: event.target.checked,
                            })
                          }
                        />
                      </label>
                      <label>
                        จำนวนเลือกขั้นต่ำ
                        <input
                          min="0"
                          max="10"
                          type="number"
                          value={
                            assignment.minSelections ?? group.minSelections
                          }
                          onChange={(event) =>
                            update(group.id, {
                              minSelections: Number(event.target.value),
                            })
                          }
                        />
                      </label>
                      <label>
                        จำนวนเลือกสูงสุด
                        <input
                          min="0"
                          max="10"
                          type="number"
                          value={
                            assignment.maxSelections ?? group.maxSelections
                          }
                          onChange={(event) =>
                            update(group.id, {
                              maxSelections: Number(event.target.value),
                            })
                          }
                        />
                      </label>
                    </div>
                    <label className="inline-check">
                      <input
                        checked={allChoices}
                        type="checkbox"
                        onChange={(event) =>
                          update(group.id, {
                            choiceIds: event.target.checked
                              ? undefined
                              : group.choices
                                  .filter((choice) => choice.active)
                                  .map((choice) => choice.id),
                          })
                        }
                      />
                      อนุญาตตัวเลือกที่เปิดใช้งานทั้งหมด
                    </label>
                    {!allChoices && (
                      <div className="check-grid">
                        {group.choices.map((choice) => {
                          const selected =
                            assignment.choiceIds?.includes(choice.id) ?? false;
                          return (
                            <label
                              className={choice.active ? "" : "disabled"}
                              key={choice.id}
                            >
                              <input
                                checked={selected}
                                disabled={!choice.active && !selected}
                                type="checkbox"
                                onChange={(event) =>
                                  update(group.id, {
                                    choiceIds: event.target.checked
                                      ? [
                                          ...(assignment.choiceIds ?? []),
                                          choice.id,
                                        ]
                                      : (assignment.choiceIds ?? []).filter(
                                          (id) => id !== choice.id,
                                        ),
                                  })
                                }
                              />
                              {choice.name}
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </details>
                )}
              </article>
            );
          })}
      </div>
      <details className="legacy-product-settings">
        <summary>ตัวเลือกสำหรับสินค้าเดิม</summary>
        <p className="hint">
          ใช้เฉพาะเมื่อจำเป็นต้องกลับไปใช้รูปแบบตัวเลือกแบบเก่า
        </p>
        <button
          className="secondary"
          type="button"
          onClick={() => {
            if (
              window.confirm(
                "กลับไปใช้ช่องตัวเลือกสินค้าแบบเดิมหรือไม่? การผูกกลุ่มตัวเลือกปัจจุบันจะถูกลบ",
              )
            )
              onChange(undefined);
          }}
        >
          กลับไปใช้รูปแบบเดิม
        </button>
      </details>
    </fieldset>
  );
}
