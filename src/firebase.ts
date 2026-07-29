import { getApp, getApps, initializeApp } from "firebase/app";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { initializeAppCheckBeforeFirebaseServices } from "@app-check-bootstrap";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Treat the app as production-connected only when the complete web config exists.
// A partial config stays in demo mode instead of creating a misleading half-connected app.
export const firebaseReady = Object.values(config).every((value) =>
  Boolean(value),
);
const app = firebaseReady
  ? getApps().length
    ? getApp()
    : initializeApp(config)
  : null;

// App Check runs after Firebase app creation and before Auth or Firestore.
// The build includes the SDK-backed bootstrap only for the exact isolated UAT.
initializeAppCheckBeforeFirebaseServices(app, {
  VITE_APP_ENVIRONMENT: import.meta.env.VITE_APP_ENVIRONMENT,
  VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  VITE_FIREBASE_APP_CHECK_ENABLED: import.meta.env
    .VITE_FIREBASE_APP_CHECK_ENABLED,
  VITE_FIREBASE_APP_CHECK_PROVIDER: import.meta.env
    .VITE_FIREBASE_APP_CHECK_PROVIDER,
  VITE_FIREBASE_APP_CHECK_SITE_KEY: import.meta.env
    .VITE_FIREBASE_APP_CHECK_SITE_KEY,
});

export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
export const authPersistenceReady = auth
  ? setPersistence(auth, browserLocalPersistence)
  : Promise.resolve();
