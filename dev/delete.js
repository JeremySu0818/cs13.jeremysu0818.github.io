const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const FIRESTORE_COLLECTIONS_TO_DELETE = ['polls', 'chats', 'users', 'albums'];

const students = [
  { name: '王語桐', username: '1301' },
  { name: '吳苡睫', username: '1302' },
  { name: '林千雅', username: '1303' },
  { name: '林子晴', username: '1304' },
  { name: '林欣霓', username: '1305' },
  { name: '張沁言', username: '1306' },
  { name: '陳佩潔', username: '1307' },
  { name: '彭昀軒', username: '1308' },
  { name: '黃牧晨', username: '1309' },
  { name: '黃芯恬', username: '1310' },
  { name: '黃奕茹', username: '1311' },
  { name: '楊心晴', username: '1312' },
  { name: '蔡宜潔', username: '1314' },
  { name: '羅敘初', username: '1315' },
  { name: '王奕棋', username: '1321' },
  { name: '江奕澄', username: '1322' },
  { name: '宋彥樂', username: '1323' },
  { name: '李承恩', username: '1324' },
  { name: '李承睿', username: '1325' },
  { name: '汪英喦', username: '1326' },
  { name: '孟慶安', username: '1327' },
  { name: '林昊緯', username: '1328' },
  { name: '林威良', username: '1329' },
  { name: '許彧睿', username: '1330' },
  { name: '傅子齊', username: '1331' },
  { name: '詹景荃', username: '1332' },
  { name: '鄭淇峰', username: '1333' },
  { name: '賴駿逸', username: '1334' },
  { name: '蘇星泓', username: '1335' },
];

async function cleanup() {
  for (const student of students) {
    const email = student.username + '@cs13.class';
    try {
      const userRecord = await admin.auth().getUserByEmail(email);
      const uid = userRecord.uid;
      await admin.auth().deleteUser(uid);
      console.log('Deleted: ' + student.name + ' (' + student.username + ')');
    } catch (e) {
      console.log('Not found: ' + student.name);
    }
  }

  for (const collectionName of FIRESTORE_COLLECTIONS_TO_DELETE) {
    await deleteCollection(collectionName);
  }
}

async function deleteCollection(collectionName) {
  try {
    await db.recursiveDelete(db.collection(collectionName));
    console.log('Deleted Firestore collection: ' + collectionName);
  } catch (e) {
    console.error(
      'Failed to delete Firestore collection: ' +
        collectionName +
        ' - ' +
        e.message,
    );
    throw e;
  }
}

cleanup()
  .then(() => {
    console.log('Cleanup complete');
  })
  .catch((e) => {
    console.error('Cleanup failed:', e);
    process.exitCode = 1;
  });
