import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { doc, collection, onSnapshot, setDoc, updateDoc, deleteDoc, getDoc, getDocFromServer, initializeFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, firebaseConfig.firestoreDatabaseId);

export const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = async () => {
  try {
    console.log("Starting signInWithPopup...");
    const result = await signInWithPopup(auth, googleProvider);
    console.log("SignIn successful:", result.user.email);
    return result.user;
  } catch (error: any) {
    console.error("Detailed login error:", error);
    if (error.code === 'auth/popup-blocked') {
      throw new Error("Das Anmeldefenster wurde blockiert. Bitte erlaube Popups für diese Seite.");
    } else if (error.code === 'auth/cancelled-popup-request') {
      throw new Error("Anmeldung abgebrochen.");
    } else if (error.code === 'auth/unauthorized-domain') {
      throw new Error("Diese Domain ist nicht für die Anmeldung autorisiert. Bitte prüfe die Firebase-Konfiguration.");
    }
    throw error;
  }
};

export const logout = () => signOut(auth);

// Test connection
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Firestore client is offline or long-polling is finding a slow connection. Fallback behavior engaged.");
    }
  }
}
testConnection();
