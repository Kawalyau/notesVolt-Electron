const admin = require("firebase-admin");

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();
const authAdmin = admin.auth();
const storageAdmin = admin.storage();

const getFirebaseStorageBucketName = () => {
  return process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "zahara-islam-media.firebasestorage.app";
};


module.exports = {
  db,
  authAdmin,
  storageAdmin,
  getFirebaseStorageBucketName,
  admin
};
