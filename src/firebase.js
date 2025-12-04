// firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage"; // ★ 이 줄 필수!

const firebaseConfig = {
  apiKey: "AIzaSyAJfkcQOx7nJWvjPBZ4-Hm4Ddz-vFS6QM8",
  authDomain: "mafia-c8e92.firebaseapp.com",
  projectId: "mafia-c8e92",
  storageBucket: "mafia-c8e92.firebasestorage.app",
  messagingSenderId: "471373151872",
  appId: "1:471373151872:web:246f8bc2b3a8627cf33065"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app); // ★ 이 줄 필수!

export { db, storage }; // ★ storage도 꼭 export 해야 합니다!