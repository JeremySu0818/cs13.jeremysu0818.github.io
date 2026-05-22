import { db } from '../core/firebase-init.js';
import { clearCachedQuery, getCachedQuery } from '../core/firestore-cache.js';
import {
  showToast,
  createEmptyState,
  readFileAsDataUrl,
} from '../core/utils.js';

let albumsListener = null;
let albumActionUser = null;
let editingAlbumId = '';
let editingAlbumPhotos = [];
let editAlbumRemoveIds = [];
let editAlbumNewFiles = [];
let editAlbumNewPreviews = [];
let albumUsers = [];
let selectedAlbumCollaborators = [];
let selectedEditAlbumCollaborators = [];
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

function refreshAlbums() {
  return db
    .collection('albums')
    .orderBy('createdAt', 'desc')
    .limit(30)
    .get()
    .then((snapshot) => {
      const albums = [];
      snapshot.forEach((doc) => albums.push({ id: doc.id, ...doc.data() }));
      renderAlbums(albums);
    });
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

  if (canManageAlbum(album)) {
    const actionWrap = document.createElement('div');
    actionWrap.className = 'album-action-wrap';
    const menuButton = createAlbumMenuButton();
    const menu = createAlbumActionMenu(album);
    actionWrap.appendChild(menuButton);
    actionWrap.appendChild(menu);
    card.appendChild(actionWrap);

    menuButton.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAlbumMenus(menu);
      const isOpen = menu.classList.toggle('active');
      menuButton.setAttribute('aria-expanded', String(isOpen));
    });
  }

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
  albumActionUser = currentUser;
  setupAlbumFormToggle(form);
  setupAlbumEditModal(currentUser);
  setupAlbumMenuClose();
  loadAlbumUsers(currentUser);

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
      showToast('先登入才能新增相簿😀');
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
        collaborators: withoutCurrentUser(selectedAlbumCollaborators, currentUser),
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
        selectedAlbumCollaborators = [];
        renderAlbumCollaboratorList(
          document.getElementById('album-collaborator-list'),
          currentUser,
          selectedAlbumCollaborators,
          (next) => {
            selectedAlbumCollaborators = withoutCurrentUser(next, currentUser);
          },
        );
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

function canManageAlbum(album) {
  if (!albumActionUser) return false;
  const collaborators = album.collaborators || [];
  const identityIds = getCurrentUserIdentityIds(albumActionUser);
  return identityIds.has(album.createdBy) || collaborators.some((uid) => identityIds.has(uid));
}

function loadAlbumUsers(currentUser) {
  db.collection('users')
    .orderBy('username')
    .get()
    .then((snapshot) => {
      albumUsers = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        albumUsers.push({ ...data, uid: doc.id, authUid: data.uid });
      });
      renderAlbumCollaboratorList(
        document.getElementById('album-collaborator-list'),
        currentUser,
        selectedAlbumCollaborators,
        (next) => {
          selectedAlbumCollaborators = withoutCurrentUser(next, currentUser);
        },
      );
    });
}

function renderAlbumCollaboratorList(container, currentUser, selected, onChange) {
  if (!container || !currentUser) return;
  container.innerHTML = '';
  const safeSelected = withoutCurrentUser(selected, currentUser);

  albumUsers
    .filter((user) => !isCurrentUserRecord(user, currentUser))
    .forEach((user) => {
      const item = document.createElement('div');
      item.className = 'student-select-item';
      if (safeSelected.includes(user.uid)) item.classList.add('selected');

      const checkbox = document.createElement('div');
      checkbox.className = 'checkbox-custom';
      checkbox.innerHTML =
        '<svg class="checkbox-icon" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';

      const name = document.createElement('span');
      name.className = 'student-select-name';
      name.textContent = user.name || user.username || '同學';

      item.appendChild(checkbox);
      item.appendChild(name);

      item.addEventListener('click', () => {
        const next = safeSelected.includes(user.uid)
          ? safeSelected.filter((uid) => uid !== user.uid)
          : [...safeSelected, user.uid];
        const cleanNext = withoutCurrentUser(next, currentUser);
        onChange(cleanNext);
        renderAlbumCollaboratorList(container, currentUser, cleanNext, onChange);
      });

      container.appendChild(item);
    });
}

function withoutCurrentUser(ids, currentUser) {
  const identityIds = getCurrentUserIdentityIds(currentUser);
  return (ids || []).filter((uid) => !identityIds.has(uid));
}

function getCurrentUserIdentityIds(currentUser) {
  const ids = new Set([currentUser.uid]);
  albumUsers.forEach((user) => {
    if (isCurrentUserRecord(user, currentUser)) {
      ids.add(user.uid);
      if (user.authUid) ids.add(user.authUid);
    }
  });
  return ids;
}

function isCurrentUserRecord(user, currentUser) {
  return (
    user.uid === currentUser.uid ||
    user.authUid === currentUser.uid ||
    (currentUser.email && (user.authEmail === currentUser.email || user.email === currentUser.email))
  );
}

function setupAlbumFormToggle(form) {
  const shell = document.getElementById('album-form-shell');
  const toggle = document.getElementById('album-form-toggle');
  if (!toggle || toggle.dataset.bound) return;
  toggle.dataset.bound = 'true';

  const setCollapsed = (isCollapsed) => {
    shell.classList.toggle('album-form-collapsed', isCollapsed);
    toggle.setAttribute('aria-expanded', String(!isCollapsed));
    toggle.textContent = isCollapsed ? '展開建立區' : '收起建立區';
    localStorage.setItem(ALBUM_FORM_COLLAPSED_KEY, isCollapsed ? 'true' : 'false');
  };

  setCollapsed(localStorage.getItem(ALBUM_FORM_COLLAPSED_KEY) === 'true');

  toggle.addEventListener('click', () => {
    setCollapsed(!shell.classList.contains('album-form-collapsed'));
  });
}

function setupAlbumMenuClose() {
  if (document.body.dataset.albumMenuCloseBound) return;
  document.body.dataset.albumMenuCloseBound = 'true';
  document.addEventListener('click', () => closeAlbumMenus());
}

function createAlbumMenuButton() {
  const button = document.createElement('button');
  button.className = 'message-menu-button album-menu-button';
  button.type = 'button';
  button.title = '更多';
  button.setAttribute('aria-label', '更多相簿操作');
  button.setAttribute('aria-expanded', 'false');
  button.innerHTML =
    '<svg fill="currentColor" height="16" viewBox="0 0 24 24" width="16" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="6" r="1.5"/><circle cx="12" cy="18" r="1.5"/></svg>';
  return button;
}

function createAlbumActionMenu(album) {
  const menu = document.createElement('div');
  menu.className = 'message-action-menu album-action-menu';

  const actions = [
    {
      label: '編輯相簿',
      icon:
        '<svg fill="currentColor" height="18" viewBox="0 0 24 24" width="18" xmlns="http://www.w3.org/2000/svg"><path d="M4 21h4.25L19.81 9.44l-4.25-4.25L4 16.75V21Zm2-3.42 9.56-9.56 1.42 1.42L7.42 19H6v-1.42ZM17 3.75l1.25-1.25a1.77 1.77 0 0 1 2.5 0l.75.75a1.77 1.77 0 0 1 0 2.5L20.25 7 17 3.75Z"/></svg>',
      handler: () => openEditAlbumModal(album),
    },
    {
      label: '刪除相簿',
      danger: true,
      icon:
        '<svg fill="currentColor" height="18" viewBox="0 0 24 24" width="18" xmlns="http://www.w3.org/2000/svg"><path d="M9 3h6l1 2h5v2H3V5h5l1-2Zm-3 6h12l-.8 11.2A2 2 0 0 1 15.2 22H8.8a2 2 0 0 1-2-1.8L6 9Zm4 2v8h2v-8h-2Zm4 0v8h2v-8h-2Z"/></svg>',
      handler: () => deleteAlbum(album),
    },
  ];

  actions.forEach((action) => {
    const button = document.createElement('button');
    button.className = 'message-action-item';
    if (action.danger) button.classList.add('danger');
    button.type = 'button';
    button.innerHTML = `<span>${action.label}</span>${action.icon}`;
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAlbumMenus();
      action.handler();
    });
    menu.appendChild(button);
  });

  return menu;
}

function closeAlbumMenus(exceptMenu = null) {
  document.querySelectorAll('.album-action-menu.active').forEach((menu) => {
    if (menu === exceptMenu) return;
    menu.classList.remove('active');
    const button = menu.parentElement.querySelector('.album-menu-button');
    if (button) button.setAttribute('aria-expanded', 'false');
  });
}

function setupAlbumEditModal(currentUser) {
  const modal = document.getElementById('edit-album-modal');
  const form = document.getElementById('edit-album-form');
  const close = document.getElementById('edit-album-close');
  const cancel = document.getElementById('edit-album-cancel');
  const fileInput = document.getElementById('edit-album-files');

  if (!modal || !form || form.dataset.bound) return;
  form.dataset.bound = 'true';

  const closeModal = () => {
    modal.classList.remove('active');
    editingAlbumId = '';
    editingAlbumPhotos = [];
    editAlbumRemoveIds = [];
    editAlbumNewFiles = [];
    editAlbumNewPreviews = [];
    selectedEditAlbumCollaborators = [];
    form.reset();
  };

  if (close) close.addEventListener('click', closeModal);
  if (cancel) cancel.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  if (fileInput) {
    fileInput.addEventListener('change', () => {
      editAlbumNewFiles = Array.from(fileInput.files || []).filter((file) =>
        file.type.startsWith('image/'),
      );
      Promise.all(editAlbumNewFiles.map((file) => readFileAsDataUrl(file))).then(
        (previews) => {
          editAlbumNewPreviews = previews;
          renderEditAlbumPhotos(editingAlbumId, editingAlbumPhotos);
        },
      );
    });
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const titleInput = document.getElementById('edit-album-title');
    const descInput = document.getElementById('edit-album-description');
    const submit = form.querySelector("button[type='submit']");
    const selectedIds = editAlbumRemoveIds;
    const newFiles = editAlbumNewFiles;

    submit.disabled = true;
    submit.textContent = '儲存中...';

    getManageableAlbum(editingAlbumId)
      .then(() => {
        return db.collection('albums').doc(editingAlbumId).update({
          title: titleInput.value.trim(),
          description: descInput.value.trim(),
          collaborators: withoutCurrentUser(selectedEditAlbumCollaborators, currentUser),
        });
      })
      .then(() => {
        return Promise.all(
          selectedIds.map((photoId) => {
            const photo = editingAlbumPhotos.find((item) => item.id === photoId);
            return deleteAlbumPhoto(editingAlbumId, photoId, photo);
          }),
        );
      })
      .then(() => {
        return Promise.all(
          newFiles.map((file, index) =>
            saveAlbumPhoto(editingAlbumId, file, editingAlbumPhotos.length + index, currentUser),
          ),
        );
      })
      .then(() => refreshAlbumCover(editingAlbumId))
      .then(() => {
        clearCachedQuery(`album-photos:${editingAlbumId}`);
        return refreshAlbums();
      })
      .then(() => {
        closeModal();
        showToast('相簿已更新');
      })
      .catch(() => {
        showToast('相簿更新失敗:(');
      })
      .finally(() => {
        submit.disabled = false;
        submit.textContent = '儲存變更';
      });
  });
}

function openEditAlbumModal(album) {
  const modal = document.getElementById('edit-album-modal');
  const titleInput = document.getElementById('edit-album-title');
  const descInput = document.getElementById('edit-album-description');
  const photoList = document.getElementById('edit-album-photo-list');

  editingAlbumId = album.id;
  editAlbumRemoveIds = [];
  editAlbumNewFiles = [];
  editAlbumNewPreviews = [];
  selectedEditAlbumCollaborators = withoutCurrentUser(album.collaborators, albumActionUser);
  titleInput.value = album.title || '';
  descInput.value = album.description || '';
  photoList.innerHTML = '<div class="empty-state">照片載入中...</div>';
  renderAlbumCollaboratorList(
    document.getElementById('edit-album-collaborator-list'),
    albumActionUser,
      selectedEditAlbumCollaborators,
      (next) => {
      selectedEditAlbumCollaborators = withoutCurrentUser(next, albumActionUser);
    },
  );
  modal.classList.add('active');

  db.collection('albums')
    .doc(album.id)
    .collection('photos')
    .orderBy('createdAt', 'asc')
    .get()
    .then((snapshot) => {
      editingAlbumPhotos = [];
      snapshot.forEach((doc) => {
        editingAlbumPhotos.push({ id: doc.id, ...doc.data() });
      });
      renderEditAlbumPhotos(album.id, editingAlbumPhotos);
    });
}

function renderEditAlbumPhotos(albumId, photos) {
  const photoList = document.getElementById('edit-album-photo-list');
  photoList.innerHTML = '';

  if (photos.length === 0) {
    photoList.appendChild(createEditAlbumAddPhotoTile());
  } else {
    photos.forEach((photo) => {
      const item = document.createElement('div');
      item.className = 'album-edit-photo-item';
      if (editAlbumRemoveIds.includes(photo.id)) item.classList.add('marked-remove');

      const img = document.createElement('img');
      img.alt = photo.caption || '相簿照片';
      item.appendChild(img);

      const remove = document.createElement('button');
      remove.className = 'album-edit-photo-remove';
      remove.type = 'button';
      remove.title = '移除此照片';
      remove.textContent = '×';
      remove.addEventListener('click', () => {
        editAlbumRemoveIds = editAlbumRemoveIds.includes(photo.id)
          ? editAlbumRemoveIds.filter((id) => id !== photo.id)
          : [...editAlbumRemoveIds, photo.id];
        renderEditAlbumPhotos(albumId, photos);
      });
      item.appendChild(remove);

      loadPhotoUrl(albumId, photo).then((url) => {
        img.src = url;
      });

      photoList.appendChild(item);
    });

    photoList.appendChild(createEditAlbumAddPhotoTile());
  }

  editAlbumNewPreviews.forEach((preview, index) => {
    const item = document.createElement('div');
    item.className = 'album-edit-photo-item';

    const img = document.createElement('img');
    img.alt = editAlbumNewFiles[index]?.name || '新增照片';
    img.src = preview;
    item.appendChild(img);

    const remove = document.createElement('button');
    remove.className = 'album-edit-photo-remove';
    remove.type = 'button';
    remove.title = '取消新增';
    remove.textContent = '×';
    remove.addEventListener('click', () => {
      editAlbumNewFiles = editAlbumNewFiles.filter((_, fileIndex) => fileIndex !== index);
      editAlbumNewPreviews = editAlbumNewPreviews.filter((_, previewIndex) => previewIndex !== index);
      document.getElementById('edit-album-files').value = '';
      renderEditAlbumPhotos(albumId, photos);
    });
    item.appendChild(remove);

    photoList.appendChild(item);
  });
}

function createEditAlbumAddPhotoTile() {
  const label = document.createElement('label');
  label.className = 'album-edit-photo-item album-edit-add-photo';
  label.htmlFor = 'edit-album-files';
  label.textContent = '+';
  label.title = '新增照片';
  return label;
}

function deleteAlbum(album) {
  if (!window.confirm('確定要刪除這個相簿嗎？照片也會一起刪除。')) return;
  const albumId = album.id;

  getManageableAlbum(albumId)
    .then(() => {
      return db.collection('albums').doc(albumId).collection('photos').get();
    })
    .then((snapshot) => {
      const deletes = [];
      snapshot.forEach((doc) => {
        deletes.push(deleteAlbumPhoto(albumId, doc.id, doc.data()));
      });
      return Promise.all(deletes);
    })
    .then(() => db.collection('albums').doc(albumId).delete())
    .then(() => {
      clearCachedQuery(`album-photos:${albumId}`);
      return refreshAlbums();
    })
    .then(() => {
      showToast('相簿已刪除');
    })
    .catch(() => {
      showToast('相簿刪除失敗:(');
    });
}

function getManageableAlbum(albumId) {
  return db
    .collection('albums')
    .doc(albumId)
    .get()
    .then((doc) => {
      const album = doc.exists ? { id: doc.id, ...doc.data() } : null;
      if (!album || !canManageAlbum(album)) {
        throw new Error('沒有權限操作這個相簿');
      }
      return album;
    });
}

function deleteAlbumPhoto(albumId, photoId, photo = null) {
  const photoRef = db
    .collection('albums')
    .doc(albumId)
    .collection('photos')
    .doc(photoId);

  if (!photo || !photo.chunked) {
    return photoRef.delete();
  }

  const chunkDeletes = [];
  for (let index = 0; index < (photo.chunkCount || 0); index++) {
    chunkDeletes.push(
      photoRef.collection('chunks').doc(String(index).padStart(5, '0')).delete(),
    );
  }

  return Promise.all(chunkDeletes)
    .catch(() => null)
    .then(() => photoRef.delete());
}

function refreshAlbumCover(albumId) {
  return db
    .collection('albums')
    .doc(albumId)
    .collection('photos')
    .orderBy('createdAt', 'asc')
    .limit(1)
    .get()
    .then((snapshot) => {
      if (snapshot.empty) {
        return db
          .collection('albums')
          .doc(albumId)
          .update({
            coverUrl: '',
            coverPhotoId: firebase.firestore.FieldValue.delete(),
          });
      }

      const doc = snapshot.docs[0];
      const photo = doc.data();
      return db
        .collection('albums')
        .doc(albumId)
        .update({
          coverUrl: photo.url || '',
          coverPhotoId: doc.id,
        });
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
