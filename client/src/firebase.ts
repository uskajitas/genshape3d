import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyBEjOpHINdKYzUljkJu7XUJysB0O0GrAo0',
  authDomain: 'uskajitas-a4844.firebaseapp.com',
  projectId: 'uskajitas-a4844',
  storageBucket: 'uskajitas-a4844.firebasestorage.app',
  messagingSenderId: '681192597057',
  appId: '1:681192597057:web:33615caa5348c9e081c8c0',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = () => signInWithPopup(auth, googleProvider);
export const signInWithEmail = (email: string, password: string) => signInWithEmailAndPassword(auth, email, password);
export const signUpWithEmail = (email: string, password: string) => createUserWithEmailAndPassword(auth, email, password);
export const signOutUser = () => signOut(auth);
