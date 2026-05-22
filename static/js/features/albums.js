import { db } from '../core/firebase-init.js';
import { clearCachedQuery, getCachedQuery } from '../core/firestore-cache.js';
import {
  showToast,
  createEmptyState,
  readFileAsDataUrl,
} from '../core/utils.js';

let albumsListener = null;
const PHOTO_INLINE_DATA_URL_LIMIT = 700 * 1024;
const PHOTO_CHUNK_SIZE = 700 * 1024;
const ALBUM_FORM_COLLAPSED_KEY = 'cs13:album-form-collapsed';

export function listenToAlbums(updateCount) {
  if (albumsListener) return;

  albumsListener = db
    .collection('albums')
    .orderBy('createdAt', 'desc')
    .limit(30)
    .onSnapshot(
      (snapshot) => {
        const albums = [];
        snapshot.forEach((doc) => albums.push({ id: doc.id, ...doc.data() }));
        renderAlbums(albums);
        if (updateCount) updateCount('album-count', albums.length);
      },
      () => {
        renderAlbums([]);
      },
    );
}

export function renderAlbums(albums) {
  const containers = [
    document.getElementById('public-album-list'),
    document.getElementById('app-album-list'),
  ].filter(Boolean);

  containers.forEach((container) => {
    container.innerHTML = '';
    if (albums.length === 0) {
      container.appendChild(createEmptyState('目前還沒有相簿...'));
      return;
    }

    albums.forEach((album) => {
      container.appendChild(createAlbumCard(album));
    });
  });
}

export function createAlbumCard(album) {
  const card = document.createElement('article');
  card.className = 'album-card';

  const cover = document.createElement('div');
  cover.className = 'album-cover';
  if (album.coverUrl) {
    const img = document.createElement('img');
    img.src = album.coverUrl;
    img.alt = album.title || '班級相簿';
    cover.appendChild(img);
  } else if (album.coverPhotoId) {
    const img = document.createElement('img');
    img.alt = album.title || '班級相簿';
    cover.appendChild(img);
    loadPhotoUrl(album.id, { id: album.coverPhotoId })
      .then((url) => {
        img.src = url;
      })
      .catch(() => {
        cover.textContent = 'CS13';
      });
  } else {
    cover.textContent = 'CS13';
  }

  const body = document.createElement('div');
  body.className = 'album-body';

  const title = document.createElement('h3');
  title.textContent = album.title || '未命名相簿';

  const desc = document.createElement('p');
  desc.textContent = album.description || '沒有描述...';

  const photos = document.createElement('div');
  photos.className = 'photo-strip';
  loadAlbumPhotos(album.id, photos);

  body.appendChild(title);
  body.appendChild(desc);
  body.appendChild(photos);
  card.appendChild(cover);
  card.appendChild(body);
  return card;
}

export function loadAlbumPhotos(albumId, target) {
  getCachedQuery(
    db
      .collection('albums')
      .doc(albumId)
      .collection('photos')
      .orderBy('createdAt', 'asc')
      .limit(6),
    `album-photos:${albumId}`,
    { ttlMs: 2 * 60 * 1000 },
  )
    .then((photos) => {
      target.innerHTML = '';
      if (photos.length === 0) {
        target.appendChild(createEmptyState('還沒有照片...'));
        return;
      }

      photos.forEach((photo) => {
        const img = document.createElement('img');
        img.alt = photo.caption || '相簿照片';
        target.appendChild(img);

        loadPhotoUrl(albumId, photo)
          .then((url) => {
            img.src = url;
          })
          .catch(() => {
            img.remove();
          });
      });
    })
    .catch(() => {});
}

export function setupAlbumForm(currentUser, getDisplayName) {
  const form = document.getElementById('album-form');
  if (!form || form.dataset.bound) return;
  form.dataset.bound = 'true';
  setupAlbumFormToggle(form);

  const fileInput = document.getElementById('album-files');
  const fileStatus = document.getElementById('file-upload-status');
  if (fileInput && fileStatus) {
    fileInput.addEventListener('change', () => {
      const count = fileInput.files ? fileInput.files.length : 0;
      if (count > 0) {
        fileStatus.textContent = `已選擇 ${count} 張相片`;
      } else {
        fileStatus.textContent = '選擇上傳照片 (可多選)';
      }
    });
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!currentUser) {
      showToast('先登入才能新增相簿 😀 ');
      return;
    }

    const titleInput = document.getElementById('album-title');
    const descInput = document.getElementById('album-description');
    const fileInput = document.getElementById('album-files');
    const files = Array.from(fileInput.files || []);
    const safeFiles = files.filter((file) => file.type.startsWith('image/'));

    if (!titleInput.value.trim() || safeFiles.length === 0) {
      showToast('輸入相簿名稱並選擇照片');
      return;
    }

    const submit = form.querySelector("button[type='submit']");
    submit.disabled = true;
    submit.textContent = '上傳中...';

    const albumRef = db.collection('albums').doc();
    const albumId = albumRef.id;
    const uploadFiles = safeFiles;

    albumRef
      .set({
        title: titleInput.value.trim(),
        description: descInput.value.trim(),
        coverUrl: '',
        createdBy: currentUser.uid,
        createdByName: getDisplayName(currentUser),
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      })
      .then(() => {
        return Promise.all(
          uploadFiles.map((file, index) =>
            saveAlbumPhoto(albumId, file, index, currentUser),
          ),
        );
      })
      .then((photos) => {
        const cover = photos[0];
        if (cover) {
          return albumRef.update({
            coverUrl: cover.url || '',
            coverPhotoId: cover.photoId,
          });
        }
        return null;
      })
      .then(() => {
        form.reset();
        if (fileStatus) {
          fileStatus.textContent = '選擇上傳照片 (可多選)';
        }
        showToast('相簿建立成功！');
      })
      .catch(() => {
        showToast('相簿建立失敗:(');
      })
      .finally(() => {
        submit.disabled = false;
        submit.textContent = '建立相簿';
      });
  });
}

function setupAlbumFormToggle(form) {
  const toggle = document.getElementById('album-form-toggle');
  if (!toggle || toggle.dataset.bound) return;
  toggle.dataset.bound = 'true';

  const setCollapsed = (isCollapsed) => {
    form.classList.toggle('album-form-collapsed', isCollapsed);
    toggle.setAttribute('aria-expanded', String(!isCollapsed));
    toggle.textContent = isCollapsed ? '展開建立區' : '收起建立區';
    localStorage.setItem(ALBUM_FORM_COLLAPSED_KEY, isCollapsed ? 'true' : 'false');
  };

  setCollapsed(localStorage.getItem(ALBUM_FORM_COLLAPSED_KEY) === 'true');

  toggle.addEventListener('click', () => {
    setCollapsed(!form.classList.contains('album-form-collapsed'));
  });
}

export function saveAlbumPhoto(albumId, file, index, currentUser) {
  return readFileAsDataUrl(file).then((dataUrl) => {
    const photoRef = db
      .collection('albums')
      .doc(albumId)
      .collection('photos')
      .doc();

    const basePhoto = {
      storagePath: '',
      caption: file.name || `photo-${index + 1}`,
      createdBy: currentUser.uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    if (dataUrl.length <= PHOTO_INLINE_DATA_URL_LIMIT) {
      return photoRef
        .set({
          ...basePhoto,
          url: dataUrl,
          chunked: false,
        })
        .then(() => {
          clearCachedQuery(`album-photos:${albumId}`);
          return { photoId: photoRef.id, url: dataUrl };
        });
    }

    const chunks = splitText(dataUrl, PHOTO_CHUNK_SIZE);

    return photoRef
      .set({
        ...basePhoto,
        url: '',
        chunked: true,
        chunkCount: chunks.length,
        dataUrlLength: dataUrl.length,
        mimeType: file.type,
      })
      .then(() => savePhotoChunks(photoRef, chunks))
      .then(() => {
        clearCachedQuery(`album-photos:${albumId}`);
        return { photoId: photoRef.id, url: '' };
      });
  });
}

function splitText(text, chunkSize) {
  const chunks = [];
  for (let start = 0; start < text.length; start += chunkSize) {
    chunks.push(text.slice(start, start + chunkSize));
  }
  return chunks;
}

function savePhotoChunks(photoRef, chunks) {
  return Promise.all(
    chunks.map((data, index) =>
      photoRef.collection('chunks').doc(String(index).padStart(5, '0')).set({
        index,
        data,
      }),
    ),
  );
}

function loadPhotoUrl(albumId, photo) {
  if (photo.url) return Promise.resolve(photo.url);

  return db
    .collection('albums')
    .doc(albumId)
    .collection('photos')
    .doc(photo.id)
    .collection('chunks')
    .orderBy('index', 'asc')
    .get()
    .then((snapshot) => {
      let url = '';
      snapshot.forEach((doc) => {
        url += doc.data().data || '';
      });

      if (!url) {
        throw new Error('照片資料不存在');
      }

      return url;
    });
}
