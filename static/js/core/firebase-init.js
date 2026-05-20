const firebaseConfig = {
  apiKey: 'AIzaSyCosLad47n5SXSdkYUx4NRm7xzjJmzz_QA',
  authDomain: 'cs13-91fc7.firebaseapp.com',
  projectId: 'cs13-91fc7',
  storageBucket: 'cs13-91fc7.firebasestorage.app',
  messagingSenderId: '382518050683',
  appId: '1:382518050683:web:a3a0b5e888e790b7c547de',
  measurementId: 'G-DK6THT1QXG',
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

export const auth = firebase.auth();
export const db = firebase.firestore();

db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
