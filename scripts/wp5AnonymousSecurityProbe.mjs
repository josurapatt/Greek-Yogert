import { deleteApp, initializeApp } from "firebase/app";
import { deleteUser, getAuth, signInAnonymously } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  query,
} from "firebase/firestore";

const projectId = process.env.CUSTOMER_UAT_FIREBASE_PROJECT_ID;
const apiKey = process.env.CUSTOMER_UAT_FIREBASE_API_KEY;
if (projectId !== "greek-yogert-customer-uat-2026")
  throw new Error("WP5 security probe requires the exact isolated project");
if (projectId === "greek-yogert") throw new Error("Production is prohibited");
if (!apiKey) throw new Error("Missing isolated UAT API key");

async function expectDenied(action) {
  try {
    await action();
  } catch (cause) {
    if (String(cause?.code ?? "").includes("permission-denied")) return;
    throw cause;
  }
  throw new Error("Expected hardened Rules denial");
}

const app = initializeApp({
  apiKey,
  authDomain: `${projectId}.firebaseapp.com`,
  projectId,
});
const auth = getAuth(app);
let user;
try {
  user = (await signInAnonymously(auth)).user;
  const db = getFirestore(app);
  const menu = await getDocs(query(collection(db, "publicMenu"), limit(20)));
  if (menu.empty)
    throw new Error("Public menu is unavailable after restoration");
  await Promise.all([
    expectDenied(() => getDocs(query(collection(db, "products"), limit(1)))),
    expectDenied(() => getDocs(query(collection(db, "orders"), limit(1)))),
    expectDenied(() => getDocs(query(collection(db, "settings"), limit(1)))),
    expectDenied(() => getDocs(query(collection(db, "counters"), limit(1)))),
    expectDenied(() => getDocs(query(collection(db, "users"), limit(1)))),
    expectDenied(() =>
      getDocs(query(collection(db, "customerOrderRequests"), limit(1))),
    ),
    expectDenied(() =>
      getDoc(doc(db, "customerOrderRequests", "another-owner")),
    ),
  ]);
  console.log(
    JSON.stringify({
      status: "passed",
      projectId,
      publicMenu: "readable",
      privateCollections: "denied",
      requestListing: "denied",
      otherOwnerRequest: "denied",
    }),
  );
} finally {
  if (user) await deleteUser(user);
  await deleteApp(app);
}
