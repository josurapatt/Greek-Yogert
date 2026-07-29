import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const productionProject = "greek-yogert";
const maximumChoices = 50;

export type RecoveryInput = {
  projectId: string;
  groupId: string;
  choiceId: string;
  apply?: boolean;
};

type Choice = { active?: unknown; everUsed?: unknown };
type Product = { optionGroupAssignments?: Array<{ groupId?: string; choiceIds?: string[] }> };

export async function recoverCatalogueOverflow(
  input: RecoveryInput,
  firestore = getFirestore(),
) {
  if (!input.projectId || !input.groupId || !input.choiceId)
    throw new Error("project, group, and choice are required");
  if (input.projectId === productionProject)
    throw new Error("Production catalogue recovery is not authorised");
  if (firestore.app.options.projectId !== input.projectId)
    throw new Error("Authenticated project does not match expected project");
  const group = firestore.doc(`optionGroups/${input.groupId}`);
  const choices = await group.collection("choices").get();
  if (choices.size <= maximumChoices) throw new Error("Option group is not overflowed");
  const target = choices.docs.find((entry) => entry.id === input.choiceId);
  if (!target) throw new Error("Specified Choice does not exist");
  const choice = target.data() as Choice;
  if (choice.everUsed !== false || choice.active !== false)
    throw new Error("Specified Choice must be inactive and unused");
  const products = await firestore.collection("products").get();
  const referenced = products.docs.some((entry) => {
    const product = entry.data() as Product;
    return product.optionGroupAssignments?.some(
      (assignment) => assignment.groupId === input.groupId &&
        (assignment.choiceIds === undefined || assignment.choiceIds.includes(input.choiceId)),
    );
  });
  if (referenced) throw new Error("Specified Choice is currently referenced");
  const report = { status: input.apply ? "applied" : "dry-run", projectId: input.projectId, groupId: input.groupId, choiceId: input.choiceId, choicesBefore: choices.size, choicesAfter: choices.size - 1, writesPerformed: input.apply ? 1 : 0 };
  if (!input.apply) return report;
  await firestore.runTransaction(async (transaction) => {
    const current = await transaction.get(group.collection("choices"));
    const currentTarget = current.docs.find((entry) => entry.id === input.choiceId);
    if (current.size <= maximumChoices || !currentTarget || currentTarget.data().everUsed !== false || currentTarget.data().active !== false)
      throw new Error("Recovery state changed; retry dry run");
    transaction.delete(currentTarget.ref);
  });
  const after = await group.collection("choices").get();
  if (after.size > maximumChoices) throw new Error("Recovery postcondition failed");
  return report;
}

function argument(name: string) { const index = process.argv.indexOf(`--${name}`); return index < 0 ? undefined : process.argv[index + 1]; }
async function main() {
  const projectId = argument("project"); const groupId = argument("group"); const choiceId = argument("choice");
  if (!projectId || !groupId || !choiceId) throw new Error("--project, --group, and --choice are required");
  if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId });
  console.log(JSON.stringify(await recoverCatalogueOverflow({ projectId, groupId, choiceId, apply: process.argv.includes("--apply") })));
}
if (process.argv[1]?.includes("runCatalogueOverflowRecovery")) void main();
