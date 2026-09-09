import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  OAuthProvider 
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBqVq_2qMbydQiwiHtlMWUeckNCLNrtwMw",
  authDomain: "asiscate-el-carmen.firebaseapp.com",
  projectId: "asiscate-el-carmen",
  storageBucket: "asiscate-el-carmen.firebasestorage.app",
  messagingSenderId: "191251320428",
  appId: "1:191251320428:web:9f013a641f75a2cff7d249",
  measurementId: "G-LK5D1F37P2"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
export const microsoftProvider = new OAuthProvider('microsoft.com');
