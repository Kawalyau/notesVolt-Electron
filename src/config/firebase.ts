// src/config/firebase.ts
import { initializeApp, getApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore, initializeFirestore, CACHE_SIZE_UNLIMITED } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let app: FirebaseApp;
let firestore: Firestore;

if (typeof window !== 'undefined' && getApps().length === 0) {
  // We are on the client and Firebase has not been initialized.
  app = initializeApp(firebaseConfig);
  firestore = initializeFirestore(app, {
    localCache: { kind: 'persistent' },
  });
} else if (getApps().length === 0) {
  // We are on the server and Firebase has not been initialized.
  app = initializeApp(firebaseConfig);
  firestore = getFirestore(app);
} else {
  // Firebase has already been initialized (either on client or server).
  app = getApp();
  firestore = getFirestore(app);
}


const auth: Auth = getAuth(app);
const storage: FirebaseStorage = getStorage(app);
const functions = getFunctions(app);

export { app, auth, firestore, storage, functions };
