// firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage"; // ★ 이 줄 필수!

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyAJfkcQOx7nJWvjPBZ4-Hm4Ddz-vFS6QM8",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "mafia-c8e92.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "mafia-c8e92",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "mafia-c8e92.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "471373151872",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:471373151872:web:246f8bc2b3a8627cf33065"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app); // ★ 이 줄 필수!

export { db, storage }; // ★ storage도 꼭 export 해야 합니다!