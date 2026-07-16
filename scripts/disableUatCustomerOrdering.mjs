import { randomUUID } from "node:crypto";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const projectId = process.env.CUSTOMER_UAT_FIREBASE_PROJECT_ID;
if (projectId !== "greek-yogert-customer-uat-2026")
  throw new Error(
    "The compatibility interlock requires the exact isolated UAT project",
  );
if (!getApps().length)
  initializeApp({ credential: applicationDefault(), projectId });

const firestore = getFirestore();
const changeId = `wp4-deploy-${randomUUID()}`;
const actorUid = "uat-deployment-interlock";
const reason = "WP4 compatibility deployment interlock";
await firestore.runTransaction(async (transaction) => {
  const privateRef = firestore.doc("settings/customerOrdering");
  const publicRef = firestore.doc("publicSettings/customerOrdering");
  const auditRef = firestore.doc(`customerOrderingAuditEvents/${changeId}`);
  const previous = await transaction.get(privateRef);
  const previousData = previous.data();
  const previousState = !previous.exists
    ? "missing"
    : previousData?.schemaVersion === 1 &&
        typeof previousData.enabled === "boolean"
      ? previousData.enabled
        ? "enabled"
        : "disabled"
      : "malformed";
  const timestamp = FieldValue.serverTimestamp();
  transaction.set(privateRef, {
    schemaVersion: 1,
    enabled: false,
    message: "ปิดรับคำสั่งซื้อใหม่ชั่วคราวระหว่างปรับปรุงระบบ UAT",
    reason,
    updatedAt: timestamp,
    updatedBy: actorUid,
    changeId,
    disabledAt: timestamp,
  });
  transaction.set(publicRef, {
    schemaVersion: 1,
    enabled: false,
    message: "ปิดรับคำสั่งซื้อใหม่ชั่วคราวระหว่างปรับปรุงระบบ UAT",
    updatedAt: timestamp,
    changeId,
  });
  transaction.set(auditRef, {
    eventType: "control_change",
    controlSchemaVersion: 1,
    previousState,
    newState: "disabled",
    actorUid,
    reason,
    occurredAt: timestamp,
    changeId,
  });
});

console.log(
  JSON.stringify({
    status: "disabled",
    projectId,
    changeId,
    controlSchemaVersion: 1,
  }),
);
