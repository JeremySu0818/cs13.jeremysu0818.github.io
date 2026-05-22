export const PHOTO_DATA_URL_LIMIT = 720 * 1024;

export function showToast(message) {
  const toast = document.getElementById('toast-message');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 1800);
}

export function formatTime(timestamp) {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return (
    date.getHours().toString().padStart(2, '0') +
    ':' +
    date.getMinutes().toString().padStart(2, '0')
  );
}

const STUDENT_MAP = {
  '1301': '王語桐',
  '1302': '吳苡睫',
  '1303': '林千雅',
  '1304': '林子晴',
  '1305': '林欣霓',
  '1306': '張沁言',
  '1307': '陳佩潔',
  '1308': '彭昀軒',
  '1309': '黃牧晨',
  '1310': '黃芯恬',
  '1311': '黃奕茹',
  '1312': '楊心晴',
  '1314': '蔡宜潔',
  '1315': '羅敘初',
  '1321': '王奕棋',
  '1322': '江奕澄',
  '1323': '宋彥樂',
  '1324': '李承恩',
  '1325': '李承睿',
  '1326': '汪英喦',
  '1327': '孟慶安',
  '1328': '林昊緯',
  '1329': '林威良',
  '1330': '許彧睿',
  '1331': '傅子齊',
  '1332': '詹景荃',
  '1333': '鄭淇峰',
  '1334': '賴駿逸',
  '1335': '蘇星泓'
};

export function getDisplayName(currentUser) {
  if (!currentUser) return '朋友';
  if (currentUser.displayName) return currentUser.displayName;
  try {
    const cachedName = localStorage.getItem('cs13-user-name:' + currentUser.uid);
    if (cachedName) return cachedName;
  } catch (e) {}
  if (currentUser.email) {
    const username = currentUser.email.split('@')[0];
    if (STUDENT_MAP[username]) {
      return STUDENT_MAP[username];
    }
    return username;
  }
  return '朋友';
}

export function getQuoteText(quote) {
  return typeof quote === 'string' ? quote : quote.text;
}

export function createEmptyState(text) {
  const empty = document.createElement('div');
  empty.className = 'empty-state';
  empty.textContent = text;
  return empty;
}

export function compressImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        try {
          resolve(renderCompressedDataUrl(image));
        } catch (err) {
          reject(err);
        }
      };
      image.onerror = reject;
      image.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function renderCompressedDataUrl(image) {
  let maxSide = 1200;
  let quality = 0.82;
  let dataUrl = '';

  for (let attempt = 0; attempt < 12; attempt++) {
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    canvas.width = width;
    canvas.height = height;
    context.drawImage(image, 0, 0, width, height);
    dataUrl = canvas.toDataURL('image/jpeg', quality);

    if (dataUrl.length <= PHOTO_DATA_URL_LIMIT) {
      return dataUrl;
    }

    if (quality > 0.5) {
      quality -= 0.12;
    } else {
      maxSide = Math.round(maxSide * 0.72);
    }
  }

  if (dataUrl.length > PHOTO_DATA_URL_LIMIT) {
    throw new Error('圖片壓縮後仍然太大，無法上傳:(');
  }

  return dataUrl;
}
