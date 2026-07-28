import { Archive, Plus, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  createStableCatalogueId,
  hardDeleteChoiceDecision,
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
  displayName: "New option group",
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
  name: "New choice",
  active: true,
  displayOrder: index,
  classification: "normal",
  surcharge: 0,
  everUsed: false,
});

function resolveDraftIds(
  draft: OptionGroup,
  catalogue: OptionGroup[],
): OptionGroup {
  const groupIds = catalogue.map((group) => group.id);
  const groupId = draft.id.startsWith("__draft-")
    ? createStableCatalogueId("group", draft.displayName, groupIds)
    : draft.id;
  const choiceIds = new Set(
    catalogue.flatMap((group) => group.choices.map((choice) => choice.id)),
  );
  const choices = draft.choices.map((choice) => {
    if (!choice.id.startsWith("__draft-")) return choice;
    const id = createStableCatalogueId("choice", choice.name, choiceIds);
    choiceIds.add(id);
    return { ...choice, id };
  });
  return { ...draft, id: groupId, choices };
}

export default function OptionGroupManager() {
  const {
    optionGroups: storedOptionGroups,
    products,
    toppingAvailability,
    saveOptionGroup,
    setToppingAvailability,
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
    const decision = hardDeleteChoiceDecision(
      editor.draft.id,
      choice,
      products,
    );
    const action = decision.allowed ? "permanently delete" : "archive";
    if (!window.confirm(`Confirm ${action} for “${choice.name}”?`)) return;
    if (decision.allowed)
      changeGroup(
        "choices",
        editor.draft.choices.filter((entry) => entry.id !== choice.id),
      );
    else changeChoice(choice.id, "active", false);
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
        "Archive the disabled definitions? Existing historical snapshots will be preserved.",
      )
    )
      return;
    try {
      setSaving(true);
      setError("");
      const resolved = resolveDraftIds(editor.draft, optionGroups);
      await saveOptionGroup(resolved, editor.original);
      setEditor(null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to save option group",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="catalogue-panel" aria-labelledby="catalogue-heading">
      <div className="section-heading catalogue-heading">
        <div>
          <h2 id="catalogue-heading">Option groups and toppings</h2>
          <p>
            Definition status and sale availability are separate. Archived
            choices keep their stable IDs for historical snapshots.
          </p>
        </div>
        <button
          className="secondary"
          onClick={() => {
            setError("");
            setEditor({ draft: newGroup() });
          }}
        >
          <Plus /> Add group
        </button>
      </div>
      <div className="catalogue-group-list">
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
                  {group.required ? "Required" : "Optional"} ·{" "}
                  {group.minSelections}–{group.maxSelections} selections ·{" "}
                  {group.choices.length} choices
                </p>
                <small>
                  ID: {group.id} · order {group.displayOrder}
                </small>
              </div>
              <span
                className={`status ${group.active ? "completed" : "cancelled"}`}
              >
                {group.active ? "Active" : "Archived"}
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
                Edit
              </button>
            </article>
          ))}
      </div>

      {editor && (
        <div className="modal-backdrop">
          <section className="modal-card catalogue-editor">
            <h2>
              {editor.original
                ? `Edit ${editor.original.displayName}`
                : "Add option group"}
            </h2>
            <p className="hint">
              IDs are generated once and remain immutable. Display names may be
              changed later.
            </p>
            <div className="form-grid">
              <label>
                Display name
                <input
                  value={editor.draft.displayName}
                  onChange={(event) =>
                    changeGroup("displayName", event.target.value)
                  }
                />
              </label>
              <label>
                Stable ID
                <input
                  disabled
                  value={
                    editor.draft.id.startsWith("__draft-")
                      ? "Generated on save"
                      : editor.draft.id
                  }
                />
              </label>
              <label>
                Display order
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
                Pricing
                <select
                  value={editor.draft.pricingMode}
                  onChange={(event) =>
                    changeGroup(
                      "pricingMode",
                      event.target.value as OptionGroup["pricingMode"],
                    )
                  }
                >
                  <option value="choice-surcharge">Choice surcharge</option>
                  <option value="legacy-topping">Legacy topping pricing</option>
                </select>
              </label>
              <label>
                Minimum selections
                <input
                  min="0"
                  max="10"
                  type="number"
                  value={editor.draft.minSelections}
                  onChange={(event) =>
                    changeGroup("minSelections", Number(event.target.value))
                  }
                />
              </label>
              <label>
                Maximum selections
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
              <label className="inline-check">
                <input
                  checked={editor.draft.active}
                  type="checkbox"
                  onChange={(event) =>
                    changeGroup("active", event.target.checked)
                  }
                />
                Active definition
              </label>
              <label className="inline-check">
                <input
                  checked={editor.draft.required}
                  type="checkbox"
                  onChange={(event) =>
                    changeGroup("required", event.target.checked)
                  }
                />
                Required by default
              </label>
              <label className="inline-check wide">
                <input
                  checked={editor.draft.allowDuplicates}
                  type="checkbox"
                  onChange={(event) =>
                    changeGroup("allowDuplicates", event.target.checked)
                  }
                />
                Allow duplicate selection
              </label>
            </div>

            <div className="catalogue-choice-heading">
              <h3>Choices</h3>
              <button
                className="secondary"
                onClick={() =>
                  changeGroup("choices", [
                    ...editor.draft.choices,
                    newChoice(editor.draft.choices.length),
                  ])
                }
              >
                <Plus /> Add choice
              </button>
            </div>
            <div className="catalogue-choice-list">
              {editor.draft.choices.map((choice) => {
                const available =
                  choice.id.startsWith("__draft-") ||
                  toppingAvailability[choice.availabilityId ?? choice.id] !==
                    false;
                const decision = hardDeleteChoiceDecision(
                  editor.draft.id,
                  choice,
                  products,
                );
                return (
                  <fieldset className="catalogue-choice-card" key={choice.id}>
                    <legend>{choice.name}</legend>
                    <div className="form-grid">
                      <label>
                        Name
                        <input
                          value={choice.name}
                          onChange={(event) =>
                            changeChoice(choice.id, "name", event.target.value)
                          }
                        />
                      </label>
                      <label>
                        Stable ID
                        <input
                          disabled
                          value={
                            choice.id.startsWith("__draft-")
                              ? "Generated on save"
                              : choice.id
                          }
                        />
                      </label>
                      <label>
                        Display order
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
                      <label>
                        Classification
                        <select
                          value={choice.classification}
                          onChange={(event) =>
                            changeChoice(
                              choice.id,
                              "classification",
                              event.target
                                .value as OptionChoice["classification"],
                            )
                          }
                        >
                          <option value="normal">Normal</option>
                          <option value="premium">Premium</option>
                        </select>
                      </label>
                      <label>
                        Choice surcharge
                        <input
                          min="0"
                          max="5000"
                          type="number"
                          value={choice.surcharge}
                          onChange={(event) =>
                            changeChoice(
                              choice.id,
                              "surcharge",
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
                        Active definition
                      </label>
                    </div>
                    <div className="catalogue-choice-actions">
                      <button
                        className="secondary"
                        disabled={choice.id.startsWith("__draft-")}
                        onClick={() =>
                          void setToppingAvailability(
                            choice.availabilityId ?? choice.id,
                            !available,
                          )
                        }
                      >
                        {available ? "On sale" : "Sold out"}
                      </button>
                      <button
                        className={decision.allowed ? "danger" : "secondary"}
                        onClick={() => removeOrArchiveChoice(choice)}
                      >
                        {decision.allowed ? <Trash2 /> : <Archive />}
                        {decision.allowed ? "Delete" : "Archive"}
                      </button>
                    </div>
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
                Cancel
              </button>
              <button
                className="primary"
                disabled={saving}
                onClick={() => void save()}
              >
                <Save /> {saving ? "Saving…" : "Save group"}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
