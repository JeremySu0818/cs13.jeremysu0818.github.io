const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const students = [
  { name: '王語桐', username: '1301', password: 'initpw1234' },
  { name: '吳苡睫', username: '1302', password: 'initpw1234' },
  { name: '林千雅', username: '1303', password: 'initpw1234' },
  { name: '林子晴', username: '1304', password: 'initpw1234' },
  { name: '林欣霓', username: '1305', password: 'initpw1234' },
  { name: '張沁言', username: '1306', password: 'initpw1234' },
  { name: '陳佩潔', username: '1307', password: 'initpw1234' },
  { name: '彭昀軒', username: '1308', password: 'initpw1234' },
  { name: '黃牧晨', username: '1309', password: 'initpw1234' },
  { name: '黃芯恬', username: '1310', password: 'initpw1234' },
  { name: '黃奕茹', username: '1311', password: 'initpw1234' },
  { name: '楊心晴', username: '1312', password: 'initpw1234' },
  { name: '蔡宜潔', username: '1314', password: 'initpw1234' },
  { name: '羅敘初', username: '1315', password: 'initpw1234' },
  { name: '王奕棋', username: '1321', password: 'initpw1234' },
  { name: '江奕澄', username: '1322', password: 'initpw1234' },
  { name: '宋彥樂', username: '1323', password: 'initpw1234' },
  { name: '李承恩', username: '1324', password: 'initpw1234' },
  { name: '李承睿', username: '1325', password: 'initpw1234' },
  { name: '汪英喦', username: '1326', password: 'initpw1234' },
  { name: '孟慶安', username: '1327', password: 'initpw1234' },
  { name: '林昊緯', username: '1328', password: 'initpw1234' },
  { name: '林威良', username: '1329', password: 'initpw1234' },
  { name: '許彧睿', username: '1330', password: 'initpw1234' },
  { name: '傅子齊', username: '1331', password: 'initpw1234' },
  { name: '詹景荃', username: '1332', password: 'initpw1234' },
  { name: '鄭淇峰', username: '1333', password: 'initpw1234' },
  { name: '賴駿逸', username: '1334', password: 'initpw1234' },
  { name: '蘇星泓', username: '1335', password: 'initpw1234' },
];

async function initializeGlobalChat() {
  const chatRef = db.collection('chats').doc('global_class_chat');
  const doc = await chatRef.get();
  if (!doc.exists) {
    await chatRef.set({
      chatId: 'global_class_chat',
      name: '全班群組😀',
      isGroup: true,
      isGlobal: true,
      members: [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
}

async function createUsers() {
  await initializeGlobalChat();
  const chatRef = db.collection('chats').doc('global_class_chat');

  for (const student of students) {
    try {
      const email = student.username + '@cs13.class';
      const userRecord = await admin.auth().createUser({
        email: email,
        password: student.password,
        displayName: student.name,
      });

      await db.collection('users').doc(userRecord.uid).set({
        uid: userRecord.uid,
        name: student.name,
        username: student.username,
        authEmail: email,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await chatRef.update({
        members: admin.firestore.FieldValue.arrayUnion(userRecord.uid),
      });

      console.log('Success: ' + student.name);
    } catch (error) {
      console.error('Error: ' + student.name + ' - ' + error.message);
    }
  }
}

createUsers();
