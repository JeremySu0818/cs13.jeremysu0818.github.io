export const PHOTO_DATA_URL_LIMIT = 720 * 1024;
export const MAX_PHOTOS_PER_ALBUM = 10;

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

export function getDisplayName(currentUser) {
  return currentUser?.displayName || currentUser?.email || '朋友';
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
