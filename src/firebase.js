// firebase.js
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// 여기에 Firebase 콘솔 설정값 붙여넣기
const firebaseConfig = {
  apiKey: "AIzaSyAJfkcQOx7nJWvjPBZ4-Hm4Ddz-vFS6QM8",
  authDomain: "mafia-c8e92.firebaseapp.com",
  projectId: "mafia-c8e92",
  storageBucket: "mafia-c8e92.firebasestorage.app",
  messagingSenderId: "471373151872",
  appId: "1:471373151872:web:246f8bc2b3a8627cf33065"
};

// Firebase 초기화
const app = initializeApp(firebaseConfig);

// Firestore 인스턴스 생성 및 export
export const db = getFirestore(app);

