import { Archive, Plus, Save } from "lucide-react";
import { useState } from "react";
import {
  catalogueAdminErrorMessage,
  resolveCatalogueDraftIds,
} from "../catalogueAdmin";
import { fallbackOptionGroups } from "../optionCatalogue";
import { useData } from "../store";
import type { OptionChoice, OptionGroup } from "../types";

interface GroupEditor {
  original?: OptionGroup;
  draft: OptionGroup;
}

const newGroup = (): OptionGroup => ({
  id: "__draft-group",
  displayName: "กลุ่มตัวเลือกใหม่",
  active: true,
  displayOrder: 100,
  required: false,
  minSelections: 0,
  maxSelections: 1,
  allowDuplicates: false,
  pricingMode: "choice-surcharge",
  choices: [],
});

const newChoice = (index: number): OptionChoice => ({
  id: `__draft-choice-${index}`,
  name: "ตัวเลือกใหม่",
  active: true,
  displayOrder: index,
  classification: "normal",
  surcharge: 0,
  everUsed: false,
});

export default function OptionGroupManager() {
  const {
    optionGroups: storedOptionGroups,
    catalogueError,
    saveOptionGroup,
  } = useData();
  const optionGroups = storedOptionGroups ?? fallbackOptionGroups;
  const [editor, setEditor] = useState<GroupEditor | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const changeGroup = <Key extends keyof OptionGroup>(
    key: Key,
    value: OptionGroup[Key],
  ) =>
    setEditor((current) =>
      current
        ? { ...current, draft: { ...current.draft, [key]: value } }
        : current,
    );

  const changeChoice = <Key extends keyof OptionChoice>(
    choiceId: string,
    key: Key,
    value: OptionChoice[Key],
  ) =>
    setEditor((current) =>
      current
        ? {
            ...current,
            draft: {
              ...current.draft,
              choices: current.draft.choices.map((choice) =>
                choice.id === choiceId ? { ...choice, [key]: value } : choice,
              ),
            },
          }
        : current,
    );

  const removeOrArchiveChoice = (choice: OptionChoice) => {
    if (!editor) return;
    if (
      !window.confirm(`ยืนยันการเก็บ “${choice.name}” เป็นรายการถาวรหรือไม่?`)
    )
      return;
    changeChoice(choice.id, "active", false);
  };

  const save = async () => {
    if (!editor) return;
    const archivesGroup = editor.original?.active && !editor.draft.active;
    const archivesChoices = editor.original?.choices.some(
      (choice) =>
        choice.active &&
        editor.draft.choices.some(
          (draftChoice) => draftChoice.id === choice.id && !draftChoice.active,
        ),
    );
    if (
      (archivesGroup || archivesChoices) &&
      !window.confirm(
        "เก็บรายการที่ปิดใช้งานเป็นรายการถาวรหรือไม่? ข้อมูลประวัติเดิมจะยังคงอยู่",
      )
    )
      return;
    try {
      setSaving(true);
      setError("");
      const resolved = resolveCatalogueDraftIds(editor.draft, optionGroups);
      await saveOptionGroup(resolved, editor.original);
      setEditor(null);
    } catch (cause) {
      setError(
        catalogueAdminErrorMessage(
          cause,
          "ไม่สามารถบันทึกกลุ่มตัวเลือกได้ กรุณาลองใหม่",
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="catalogue-panel" aria-labelledby="catalogue-heading">
      <div className="section-heading catalogue-heading">
        <div>
          <h2 id="catalogue-heading">กลุ่มตัวเลือกและท็อปปิ้ง</h2>
          <p>
            สถานะการใช้งานแยกจากสถานะเปิดขาย ตัวเลือกที่เก็บถาวรจะยังคง ID
            เดิมไว้สำหรับข้อมูลประวัติ
          </p>
        </div>
        <button
          className="secondary"
          onClick={() => {
            setError("");
            setEditor({ draft: newGroup() });
          }}
        >
          <Plus /> เพิ่มกลุ่มตัวเลือก
        </button>
      </div>
      {catalogueError && (
        <p className="validation" role="alert">
          {catalogueAdminErrorMessage(
            catalogueError,
            "ไม่สามารถโหลดข้อมูลแคตตาล็อกได้ กรุณาลองใหม่",
          )}
        </p>
      )}
      <div className="catalogue-group-list">
        {optionGroups.length === 0 && (
          <p className="hint">ยังไม่มีกลุ่มตัวเลือก</p>
        )}
        {[...optionGroups]
          .sort(
            (left, right) =>
              left.displayOrder - right.displayOrder ||
              left.id.localeCompare(right.id),
          )
          .map((group) => (
            <article
              className={`catalogue-group-card ${group.active ? "" : "disabled"}`}
              key={group.id}
            >
              <div>
                <h3>{group.displayName}</h3>
                <p>
                  {group.required ? "จำเป็นต้องเลือก" : "ไม่จำเป็นต้องเลือก"} ·{" "}
                  เลือก {group.minSelections}–{group.maxSelections} รายการ ·{" "}
                  {group.choices.length} ตัวเลือก
                </p>
              </div>
              <span
                className={`status ${group.active ? "completed" : "cancelled"}`}
              >
                {group.active ? "เปิดใช้งาน" : "เก็บถาวร"}
              </span>
              <button
                className="secondary"
                onClick={() => {
                  setError("");
                  setEditor({
                    original: structuredClone(group),
                    draft: structuredClone(group),
                  });
                }}
              >
                แก้ไข
              </button>
            </article>
          ))}
      </div>

      {editor && (
        <div className="modal-backdrop">
          <section className="modal-card catalogue-editor">
            <h2>
              {editor.original
                ? `แก้ไข ${editor.original.displayName}`
                : "เพิ่มกลุ่มตัวเลือก"}
            </h2>
            <p className="hint">
              ตั้งชื่อ เพิ่มรายการตัวเลือก และกำหนดจำนวนที่ลูกค้าเลือกได้
            </p>
            <div className="form-grid">
              <label>
                ชื่อที่แสดง
                <input
                  value={editor.draft.displayName}
                  onChange={(event) =>
                    changeGroup("displayName", event.target.value)
                  }
                />
              </label>
              <label>
                จำนวนเลือกขั้นต่ำ (0 = ไม่จำเป็น)
                <input
                  min="0"
                  max="10"
                  type="number"
                  value={editor.draft.minSelections}
                  onChange={(event) => {
                    const minimum = Number(event.target.value);
                    changeGroup("minSelections", minimum);
                    changeGroup("required", minimum > 0);
                  }}
                />
              </label>
              <label>
                จำนวนเลือกสูงสุด
                <input
                  min="0"
                  max="10"
                  type="number"
                  value={editor.draft.maxSelections}
                  onChange={(event) =>
                    changeGroup("maxSelections", Number(event.target.value))
                  }
                />
              </label>
              <details className="wide catalogue-advanced">
                <summary>การตั้งค่าขั้นสูง</summary>
                <div className="form-grid">
                  <label>
                    ID ถาวร
                    <input
                      disabled
                      value={
                        editor.draft.id.startsWith("__draft-")
                          ? "ระบบจะสร้างเมื่อบันทึก"
                          : editor.draft.id
                      }
                    />
                  </label>
                  <label>
                    ลำดับการแสดงผล
                    <input
                      min="0"
                      max="10000"
                      type="number"
                      value={editor.draft.displayOrder}
                      onChange={(event) =>
                        changeGroup("displayOrder", Number(event.target.value))
                      }
                    />
                  </label>
                  <label>
                    การกำหนดราคา
                    <select
                      value={editor.draft.pricingMode}
                      onChange={(event) =>
                        changeGroup(
                          "pricingMode",
                          event.target.value as OptionGroup["pricingMode"],
                        )
                      }
                    >
                      <option value="choice-surcharge">
                        ราคาเพิ่มตามตัวเลือก
                      </option>
                      <option value="legacy-topping">
                        ราคาท็อปปิ้งแบบเดิม
                      </option>
                    </select>
                  </label>
                  <label className="inline-check">
                    <input
                      checked={editor.draft.active}
                      type="checkbox"
                      onChange={(event) =>
                        changeGroup("active", event.target.checked)
                      }
                    />
                    {editor.draft.active
                      ? "เปิดใช้งานกลุ่มตัวเลือก"
                      : "กู้คืนกลุ่มตัวเลือก"}
                  </label>
                  <label className="inline-check">
                    <input
                      checked={editor.draft.required}
                      type="checkbox"
                      onChange={(event) =>
                        changeGroup("required", event.target.checked)
                      }
                    />
                    จำเป็นต้องเลือกเป็นค่าเริ่มต้น
                  </label>
                  <label className="inline-check">
                    <input
                      checked={editor.draft.allowDuplicates}
                      type="checkbox"
                      onChange={(event) =>
                        changeGroup("allowDuplicates", event.target.checked)
                      }
                    />
                    อนุญาตให้เลือกซ้ำ
                  </label>
                </div>
              </details>
            </div>

            <div className="catalogue-choice-heading">
              <h3>ตัวเลือก</h3>
              <button
                className="secondary"
                onClick={() =>
                  changeGroup("choices", [
                    ...editor.draft.choices,
                    newChoice(editor.draft.choices.length),
                  ])
                }
              >
                <Plus /> เพิ่มตัวเลือก
              </button>
            </div>
            <div className="catalogue-choice-list">
              {editor.draft.choices.length === 0 && (
                <p className="hint">
                  ยังไม่มีตัวเลือก กด “เพิ่มตัวเลือก” เพื่อเริ่มต้น
                </p>
              )}
              {editor.draft.choices.map((choice) => {
                return (
                  <fieldset className="catalogue-choice-card" key={choice.id}>
                    <legend>{choice.name}</legend>
                    <div className="form-grid">
                      <label>
                        ชื่อตัวเลือก
                        <input
                          value={choice.name}
                          onChange={(event) =>
                            changeChoice(choice.id, "name", event.target.value)
                          }
                        />
                      </label>
                    </div>
                    <details className="catalogue-choice-advanced">
                      <summary>ข้อมูลเพิ่มเติมและการเก็บถาวร</summary>
                      <div className="form-grid">
                        <label>
                          ID ถาวร
                          <input
                            disabled
                            value={
                              choice.id.startsWith("__draft-")
                                ? "ระบบจะสร้างเมื่อบันทึก"
                                : choice.id
                            }
                          />
                        </label>
                        <label>
                          ลำดับการแสดงผล
                          <input
                            min="0"
                            max="10000"
                            type="number"
                            value={choice.displayOrder}
                            onChange={(event) =>
                              changeChoice(
                                choice.id,
                                "displayOrder",
                                Number(event.target.value),
                              )
                            }
                          />
                        </label>
                        <label className="inline-check">
                          <input
                            checked={choice.active}
                            type="checkbox"
                            onChange={(event) =>
                              changeChoice(
                                choice.id,
                                "active",
                                event.target.checked,
                              )
                            }
                          />
                          {choice.active
                            ? "เปิดใช้งานตัวเลือก"
                            : "กู้คืนตัวเลือก"}
                        </label>
                      </div>
                      <button
                        className="secondary"
                        onClick={() => removeOrArchiveChoice(choice)}
                      >
                        <Archive />
                        เก็บถาวร
                      </button>
                    </details>
                  </fieldset>
                );
              })}
            </div>
            {error && <p className="validation">{error}</p>}
            <div className="modal-footer">
              <button
                className="secondary"
                disabled={saving}
                onClick={() => setEditor(null)}
              >
                ยกเลิก
              </button>
              <button
                className="primary"
                disabled={saving}
                onClick={() => void save()}
              >
                <Save /> {saving ? "กำลังบันทึก…" : "บันทึกกลุ่มตัวเลือก"}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
