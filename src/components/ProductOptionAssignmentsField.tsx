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
  if (product.optionGroupAssignments === undefined)
    return (
      <fieldset className="wide assignment-fieldset">
        <legend>Configurable option groups</legend>
        <p className="hint">
          This Product still uses its legacy {product.optionMode} configuration.
          Convert it only when you need explicit group assignments.
        </p>
        <button
          className="secondary"
          type="button"
          onClick={() => onChange(legacyProductOptionGroupAssignments(product))}
        >
          Configure groups
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
      <legend>Configurable option groups</legend>
      <p className="hint">
        Removing an assignment never resets the group or its historical
        lifecycle.
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
                          `Remove ${group.displayName} from this Product? Historical snapshots will remain unchanged.`,
                        )
                      )
                        return;
                      onChange(
                        event.target.checked
                          ? [
                              ...assignments,
                              {
                                groupId: group.id,
                                required: group.required,
                                minSelections: group.minSelections,
                                maxSelections: group.maxSelections,
                              },
                            ]
                          : assignments.filter(
                              (entry) => entry.groupId !== group.id,
                            ),
                      );
                    }}
                  />
                  <strong>{group.displayName}</strong>
                  {!group.active && <small>Archived group</small>}
                </label>
                {assignment && (
                  <>
                    <div className="assignment-limits">
                      <label>
                        Required
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
                        Min
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
                        Max
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
                      Allow all active choices
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
                  </>
                )}
              </article>
            );
          })}
      </div>
      <button
        className="secondary"
        type="button"
        onClick={() => {
          if (
            window.confirm(
              "Return to the legacy Product option fields? Current explicit assignments will be removed.",
            )
          )
            onChange(undefined);
        }}
      >
        Use legacy Product fields
      </button>
    </fieldset>
  );
}
