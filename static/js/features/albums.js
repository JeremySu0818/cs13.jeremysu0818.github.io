import { db } from '../core/firebase-init.js';
import {
  showToast,
  createEmptyState,
  compressImageFile,
  MAX_PHOTOS_PER_ALBUM,
} from '../core/utils.js';

let albumsListener = null;

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
      container.appendChild(
        createEmptyState('目前還沒有相簿...登入後可以建立第一本😀'),
      );
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
  db.collection('albums')
    .doc(albumId)
    .collection('photos')
    .orderBy('createdAt', 'asc')
    .limit(6)
    .get()
    .then((snapshot) => {
      target.innerHTML = '';
      if (snapshot.empty) {
        target.appendChild(createEmptyState('還沒有照片...'));
        return;
      }

      snapshot.forEach((doc) => {
        const photo = doc.data();
        const img = document.createElement('img');
        img.src = photo.url;
        img.alt = photo.caption || '相簿照片';
        target.appendChild(img);
      });
    })
    .catch(() => {});
}

export function setupAlbumForm(currentUser, getDisplayName) {
  const form = document.getElementById('album-form');
  if (!form || form.dataset.bound) return;
  form.dataset.bound = 'true';

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
    const uploadFiles = safeFiles.slice(0, MAX_PHOTOS_PER_ALBUM);

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
      .then((urls) => {
        if (urls[0]) {
          return albumRef.update({ coverUrl: urls[0] });
        }
        return null;
      })
      .then(() => {
        form.reset();
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

export function saveAlbumPhoto(albumId, file, index, currentUser) {
  return compressImageFile(file).then((url) => {
    return db
      .collection('albums')
      .doc(albumId)
      .collection('photos')
      .add({
        url,
        storagePath: '',
        caption: file.name || `photo-${index + 1}`,
        createdBy: currentUser.uid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      })
      .then(() => url);
  });
}
