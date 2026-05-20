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

const auth = firebase.auth();
const db = firebase.firestore();

const isAppPage = location.pathname.includes('app.html');
const isPublicPage = !isAppPage;
const PHOTO_DATA_URL_LIMIT = 720 * 1024;
const MAX_PHOTOS_PER_ALBUM = 10;

let quotes = [];
let currentUser = null;
let currentChatId = null;
let activeChatListener = null;
let chatsListener = null;
let quotesListener = null;
let albumsListener = null;
let pollsListener = null;
let selectedStudents = [];
let allUsers = [];
let publicInitialized = false;
let appInitialized = false;

function showToast(message) {
  const toast = document.getElementById('toast-message');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 1800);
}

function formatTime(timestamp) {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return (
    date.getHours().toString().padStart(2, '0') +
    ':' +
    date.getMinutes().toString().padStart(2, '0')
  );
}

function getDisplayName() {
  return currentUser?.displayName || currentUser?.email || 'Classmate';
}

function getQuoteText(quote) {
  return typeof quote === 'string' ? quote : quote.text;
}

function setQuotes(nextQuotes) {
  quotes = nextQuotes
    .map((item) => (typeof item === 'string' ? { text: item } : item))
    .filter((item) => item.text);
  showRandomQuote();
  renderQuoteWall();
}

function listenToQuotes() {
  if (quotesListener) return;

  quotesListener = db
    .collection('quotes')
    .orderBy('createdAt', 'desc')
    .limit(120)
    .onSnapshot(
      (snapshot) => {
        const firestoreQuotes = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          if (data.text) {
            firestoreQuotes.push({ id: doc.id, ...data });
          }
        });

        setQuotes(firestoreQuotes);
      },
      () => {},
    );
}

function showRandomQuote() {
  const quote =
    quotes.length === 0
      ? '目前還沒有幸貞的幹話，來新增第一句吧:)'
      : getQuoteText(quotes[Math.floor(Math.random() * quotes.length)]);
  const displays = [
    document.getElementById('quote-display'),
    document.getElementById('welcome-quote-display'),
  ];

  displays.forEach((display) => {
    if (display) display.textContent = quote;
  });
}

function renderQuoteWall() {
  const wall = document.getElementById('quote-wall');
  if (!wall) return;

  wall.innerHTML = '';
  if (quotes.length === 0) {
    wall.appendChild(
      createEmptyState('目前還沒有幸貞的幹話，來新增第一句吧:)'),
    );
    return;
  }

  quotes.forEach((quote) => {
    const item = document.createElement('article');
    item.className = 'quote-chip';
    item.textContent = getQuoteText(quote);
    wall.appendChild(item);
  });
}

function createEmptyState(text) {
  const empty = document.createElement('div');
  empty.className = 'empty-state';
  empty.textContent = text;
  return empty;
}

function addQuote(text, input) {
  const normalized = text.trim();
  if (!normalized) return;

  db.collection('quotes')
    .add({
      text: normalized,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdByName: currentUser ? getDisplayName() : 'anonymous',
    })
    .then(() => {
      if (input) input.value = '';
      showToast('幹話新增成功😎');
    })
    .catch(() => {
      showToast('幹話新增失敗:(');
    });
}

function setupQuoteForms() {
  const forms = [
    {
      form: document.getElementById('public-quote-form'),
      input: document.getElementById('public-quote-input'),
    },
    {
      form: document.getElementById('app-quote-form'),
      input: document.getElementById('app-quote-input'),
    },
  ];

  forms.forEach(({ form, input }) => {
    if (!form || !input || form.dataset.bound) return;
    form.dataset.bound = 'true';
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      addQuote(input.value, input);
    });
  });

  const nextBtn = document.getElementById('next-quote-btn');
  if (nextBtn && !nextBtn.dataset.bound) {
    nextBtn.dataset.bound = 'true';
    nextBtn.addEventListener('click', showRandomQuote);
  }

  const copyBtn = document.getElementById('copy-quote-btn');
  if (copyBtn && !copyBtn.dataset.bound) {
    copyBtn.dataset.bound = 'true';
    copyBtn.addEventListener('click', () => {
      const display = document.getElementById('quote-display');
      if (
        display &&
        display.textContent &&
        display.textContent !== 'Loading...'
      ) {
        navigator.clipboard.writeText(display.textContent).then(() => {
          showToast('幹話已複製😂');
        });
      }
    });
  }
}

auth.onAuthStateChanged((user) => {
  currentUser = user;

  if (isAppPage && !user) {
    location.href = '/index.html';
    return;
  }

  if (isPublicPage) {
    initializePublicPage();
    updatePublicAuthState();
    return;
  }

  initializeDashboard();
});

function initializePublicPage() {
  if (publicInitialized) return;
  publicInitialized = true;
  listenToQuotes();
  setupQuoteForms();
  setupLoginForm();
  listenToAlbums();
  listenToPolls();
  setupPublicTabs();
}

function updatePublicAuthState() {
  const loginSection = document.getElementById('login-section');
  if (!loginSection) return;

  const tabLogin = document.getElementById('tab-login');
  const tabApp = document.getElementById('tab-app');

  if (currentUser) {
    loginSection.classList.add('signed-in');
    const title = loginSection.querySelector('.section-title');
    const copy = loginSection.querySelector('.section-copy');
    if (title) title.textContent = '已登入';
    if (copy) copy.textContent = '可以直接進入班級後台新增相簿、投票或聊天 😀 ';
    if (tabLogin) tabLogin.classList.add('hidden');
    if (tabApp) tabApp.classList.remove('hidden');
  } else {
    loginSection.classList.remove('signed-in');
    if (tabLogin) tabLogin.classList.remove('hidden');
    if (tabApp) tabApp.classList.add('hidden');
  }
}

function setupPublicTabs() {
  const tabs = [
    { buttonId: 'tab-quote', sectionId: 'quote-section' },
    { buttonId: 'tab-albums', sectionId: 'albums-section' },
    { buttonId: 'tab-polls', sectionId: 'polls-section' },
    { buttonId: 'tab-login', sectionId: 'login-section' },
  ];

  function activateTab(targetSectionId) {
    tabs.forEach(({ buttonId, sectionId }) => {
      const btn = document.getElementById(buttonId);
      const sec = document.getElementById(sectionId);
      if (sec) {
        if (sectionId === targetSectionId) {
          sec.classList.remove('hidden');
        } else {
          sec.classList.add('hidden');
        }
      }
      if (btn) {
        if (sectionId === targetSectionId) {
          btn.classList.remove('btn-secondary');
        } else {
          btn.classList.add('btn-secondary');
        }
      }
    });
  }

  tabs.forEach(({ buttonId, sectionId }) => {
    const btn = document.getElementById(buttonId);
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        location.hash = sectionId;
        activateTab(sectionId);
      });
    }
  });

  function handleHash() {
    const hash = location.hash.replace('#', '');
    const validSections = tabs.map((t) => t.sectionId);
    if (validSections.includes(hash)) {
      activateTab(hash);
    } else {
      activateTab('quote-section');
    }
  }

  window.addEventListener('hashchange', handleHash);
  handleHash();
}

function setupLoginForm() {
  const loginForm = document.getElementById('login-form');
  if (!loginForm || loginForm.dataset.bound) return;

  loginForm.dataset.bound = 'true';
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const email = username + '@cs13.class';
    const password = document.getElementById('login-password').value;
    const errorMsg = document.getElementById('error-message');
    const submitBtn = document.getElementById('submit-btn');

    submitBtn.disabled = true;
    errorMsg.textContent = '';

    auth
      .signInWithEmailAndPassword(email, password)
      .then(() => {
        location.href = '/static/app.html';
      })
      .catch((err) => {
        submitBtn.disabled = false;
        errorMsg.textContent = err.message;
      });
  });
}

function initializeDashboard() {
  if (appInitialized) return;
  appInitialized = true;

  listenToQuotes();
  setupQuoteForms();
  setupUserAvatar();
  setupPanelNavigation();
  setupChangePasswordForm();
  setupLogout();
  setupNewChatModal();
  setupAlbumForm();
  setupPollForm();
  listenToChats();
  listenToAlbums();
  listenToPolls();
  loadAllUsers();

  db.collection('users')
    .doc(currentUser.uid)
    .get()
    .then((doc) => {
      if (doc.exists && doc.data().mustChangePassword) {
        showChangePasswordModal();
      }
      return db.collection('chats').doc('global_class_chat').get();
    })
    .then((chatDoc) => {
      if (chatDoc.exists) {
        const members = chatDoc.data().members || [];
        if (!members.includes(currentUser.uid)) {
          return db
            .collection('chats')
            .doc('global_class_chat')
            .update({
              members: firebase.firestore.FieldValue.arrayUnion(
                currentUser.uid,
              ),
            });
        }
      }
    })
    .catch(() => {});

  const welcomeTitle = document.getElementById('welcome-user-title');
  if (welcomeTitle) {
    welcomeTitle.textContent = 'Welcome, ' + getDisplayName();
  }

  const searchInput = document.getElementById('chat-search');
  if (searchInput) {
    searchInput.addEventListener('input', filterChats);
  }

  const messageForm = document.getElementById('message-form');
  if (messageForm) {
    messageForm.addEventListener('submit', handleSendMessage);
  }

  if (location.hash === '#albums') {
    activatePanel('albums-panel');
  } else if (location.hash === '#polls') {
    activatePanel('polls-panel');
  }
}

function setupPanelNavigation() {
  const navButtons = document.querySelectorAll('[data-panel]');
  const actionButtons = document.querySelectorAll('[data-panel-target]');

  navButtons.forEach((button) => {
    if (button.dataset.bound) return;
    button.dataset.bound = 'true';
    button.addEventListener('click', () => activatePanel(button.dataset.panel));
  });

  actionButtons.forEach((button) => {
    if (button.dataset.bound) return;
    button.dataset.bound = 'true';
    button.addEventListener('click', () =>
      activatePanel(button.dataset.panelTarget),
    );
  });
}

function activatePanel(panelId) {
  document.querySelectorAll('.hub-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === panelId);
  });

  document.querySelectorAll('[data-panel]').forEach((button) => {
    button.classList.toggle('active', button.dataset.panel === panelId);
  });
}

function setupUserAvatar() {
  const avatar = document.getElementById('user-avatar');
  if (avatar) {
    avatar.textContent = getDisplayName().charAt(0).toUpperCase();
  }
}

function setupLogout() {
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn && !logoutBtn.dataset.bound) {
    logoutBtn.dataset.bound = 'true';
    logoutBtn.addEventListener('click', () => {
      if (activeChatListener) activeChatListener();
      if (chatsListener) chatsListener();
      auth.signOut();
    });
  }
}

function showChangePasswordModal() {
  const modal = document.getElementById('change-password-modal');
  if (modal) {
    modal.classList.add('active');
  }
}

function setupChangePasswordForm() {
  const form = document.getElementById('change-password-form');
  if (!form || form.dataset.bound) return;
  form.dataset.bound = 'true';

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    const errorMsg = document.getElementById('password-error-message');

    if (newPassword !== confirmPassword) {
      errorMsg.textContent = 'Passwords do not match.';
      return;
    }

    if (newPassword.length < 6) {
      errorMsg.textContent = 'Password must be at least 6 characters.';
      return;
    }

    errorMsg.textContent = '';

    auth.currentUser
      .updatePassword(newPassword)
      .then(() =>
        db
          .collection('users')
          .doc(currentUser.uid)
          .update({ mustChangePassword: false }),
      )
      .then(() => {
        const modal = document.getElementById('change-password-modal');
        if (modal) modal.classList.remove('active');
        showToast('Password updated successfully!');
      })
      .catch((err) => {
        errorMsg.textContent = err.message;
      });
  });
}

function listenToAlbums() {
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
        updateCount('album-count', albums.length);
      },
      () => {
        renderAlbums([]);
      },
    );
}

function updateCount(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = String(value);
}

function renderAlbums(albums) {
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

function createAlbumCard(album) {
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

function loadAlbumPhotos(albumId, target) {
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

function setupAlbumForm() {
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
        createdByName: getDisplayName(),
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      })
      .then(() => {
        return Promise.all(
          uploadFiles.map((file, index) =>
            saveAlbumPhoto(albumId, file, index),
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

function saveAlbumPhoto(albumId, file, index) {
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

function compressImageFile(file) {
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
    throw new Error('Image is too large for Firestore after compression.');
  }

  return dataUrl;
}

function listenToPolls() {
  if (pollsListener) return;

  pollsListener = db
    .collection('polls')
    .orderBy('createdAt', 'desc')
    .limit(30)
    .onSnapshot(
      (snapshot) => {
        const polls = [];
        snapshot.forEach((doc) => polls.push({ id: doc.id, ...doc.data() }));
        renderPolls(polls);
        updateCount('poll-count', polls.filter((poll) => !poll.closed).length);
      },
      () => {
        renderPolls([]);
      },
    );
}

function setupPollForm() {
  const form = document.getElementById('poll-form');
  if (!form || form.dataset.bound) return;
  form.dataset.bound = 'true';

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!currentUser) {
      showToast('先登入才能建立投票 😀 ');
      return;
    }

    const question = document.getElementById('poll-question').value.trim();
    const options = document
      .getElementById('poll-options')
      .value.split(/\r?\n/)
      .map((option) => option.trim())
      .filter(Boolean);
    const allowMultiple = document.getElementById(
      'poll-allow-multiple',
    ).checked;

    if (!question || options.length < 2) {
      showToast('輸入問題，並至少提供兩個選項 😀 ');
      return;
    }

    db.collection('polls')
      .add({
        question,
        options,
        allowMultiple,
        createdBy: currentUser.uid,
        createdByName: getDisplayName(),
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        closed: false,
      })
      .then(() => {
        form.reset();
        showToast('投票建立成功！');
      })
      .catch(() => {
        showToast('投票建立失敗:(');
      });
  });
}

function renderPolls(polls) {
  const containers = [
    document.getElementById('public-poll-list'),
    document.getElementById('app-poll-list'),
  ].filter(Boolean);

  containers.forEach((container) => {
    container.innerHTML = '';
    if (polls.length === 0) {
      container.appendChild(
        createEmptyState('還沒有投票，登入後可以建立第一題😀'),
      );
      return;
    }

    polls.forEach((poll) => {
      const card = createPollCard(poll);
      container.appendChild(card);
      hydratePollVotes(poll, card);
    });
  });
}

function createPollCard(poll) {
  const card = document.createElement('article');
  card.className = 'poll-card';
  card.dataset.pollId = poll.id;

  const title = document.createElement('h3');
  title.textContent = poll.question || '未命名投票';

  const meta = document.createElement('p');
  meta.className = 'poll-meta';
  meta.textContent = poll.allowMultiple ? '多選投票' : '單選投票';

  const form = document.createElement('form');
  form.className = 'vote-form';

  (poll.options || []).forEach((option, index) => {
    const label = document.createElement('label');
    label.className = 'vote-option';

    const input = document.createElement('input');
    input.type = poll.allowMultiple ? 'checkbox' : 'radio';
    input.name = `poll-${poll.id}`;
    input.value = String(index);
    input.disabled = !currentUser || poll.closed;

    const text = document.createElement('span');
    text.textContent = option;

    const bar = document.createElement('span');
    bar.className = 'vote-bar';
    bar.dataset.optionIndex = String(index);

    label.appendChild(input);
    label.appendChild(text);
    label.appendChild(bar);
    form.appendChild(label);
  });

  const submit = document.createElement('button');
  submit.className = 'btn';
  submit.type = 'submit';
  submit.textContent = currentUser ? '送出投票' : '登入後投票';
  submit.disabled = !currentUser || poll.closed;
  form.appendChild(submit);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitVote(poll, form);
  });

  const result = document.createElement('div');
  result.className = 'poll-result';
  result.textContent = '票數載入中...';

  card.appendChild(title);
  card.appendChild(meta);
  card.appendChild(form);
  card.appendChild(result);
  return card;
}

function hydratePollVotes(poll, card) {
  db.collection('polls')
    .doc(poll.id)
    .collection('votes')
    .get()
    .then((snapshot) => {
      const counts = new Array((poll.options || []).length).fill(0);
      let total = 0;
      let myChoices = [];

      snapshot.forEach((doc) => {
        const data = doc.data();
        const choices = Array.isArray(data.choices) ? data.choices : [];
        if (doc.id === currentUser?.uid) {
          myChoices = choices;
        }
        choices.forEach((choice) => {
          if (counts[choice] !== undefined) {
            counts[choice]++;
            total++;
          }
        });
      });

      card.querySelectorAll('input').forEach((input) => {
        input.checked = myChoices.includes(Number(input.value));
      });

      card.querySelectorAll('.vote-bar').forEach((bar) => {
        const index = Number(bar.dataset.optionIndex);
        const percent =
          total === 0 ? 0 : Math.round((counts[index] / total) * 100);
        bar.style.setProperty('--vote-width', `${percent}%`);
        bar.textContent = `${counts[index]} 票`;
      });

      const result = card.querySelector('.poll-result');
      if (result) result.textContent = `總票數：${total}`;
    })
    .catch(() => {});
}

function submitVote(poll, form) {
  if (!currentUser) {
    showToast('先登入才能投票 😀 ');
    return;
  }

  const choices = Array.from(form.querySelectorAll('input:checked')).map(
    (input) => Number(input.value),
  );

  if (choices.length === 0) {
    showToast('至少選一個選項 😀 ');
    return;
  }

  db.collection('polls')
    .doc(poll.id)
    .collection('votes')
    .doc(currentUser.uid)
    .set({
      choices,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    })
    .then(() => {
      showToast('投票已送出！');
      const card = form.closest('.poll-card');
      if (card) hydratePollVotes(poll, card);
    })
    .catch(() => {
      showToast('投票失敗:(');
    });
}

function listenToChats() {
  if (chatsListener) chatsListener();

  chatsListener = db
    .collection('chats')
    .where('members', 'array-contains', currentUser.uid)
    .onSnapshot(
      (snapshot) => {
        const chatList = document.getElementById('chat-list-container');
        if (!chatList) return;

        chatList.innerHTML = '';

        const chats = [];
        snapshot.forEach((doc) => {
          chats.push(doc.data());
        });

        chats.sort((a, b) => {
          const timeA = a.lastMessageTime ? a.lastMessageTime.toMillis() : 0;
          const timeB = b.lastMessageTime ? b.lastMessageTime.toMillis() : 0;
          return timeB - timeA;
        });

        chats.forEach((chat) => {
          const item = document.createElement('div');
          item.className = 'chat-item';
          if (chat.chatId === currentChatId) item.classList.add('active');
          item.dataset.id = chat.chatId;

          const avatar = document.createElement('div');
          avatar.className = 'chat-item-avatar';

          const info = document.createElement('div');
          info.className = 'chat-item-info';

          const nameRow = document.createElement('div');
          nameRow.className = 'chat-item-name-row';

          const nameSpan = document.createElement('span');
          nameSpan.className = 'chat-item-name';

          const timeSpan = document.createElement('span');
          timeSpan.className = 'chat-item-time';

          const msgRow = document.createElement('div');
          msgRow.className = 'chat-item-message-row';

          const msgSpan = document.createElement('span');
          msgSpan.className = 'chat-item-message';

          if (chat.isGlobal) {
            nameSpan.textContent = chat.name;
            avatar.textContent = 'G';
          } else if (chat.isGroup) {
            nameSpan.textContent = chat.name;
            avatar.textContent = chat.name.charAt(0).toUpperCase();
          } else {
            const otherUid = chat.members.find((m) => m !== currentUser.uid);
            const otherUser = allUsers.find((u) => u.uid === otherUid);
            const displayName = otherUser ? otherUser.name : 'Classmate';
            nameSpan.textContent = displayName;
            avatar.textContent = displayName.charAt(0).toUpperCase();
          }

          timeSpan.textContent = formatTime(chat.lastMessageTime);
          msgSpan.textContent = chat.lastMessage || 'No messages yet';

          nameRow.appendChild(nameSpan);
          nameRow.appendChild(timeSpan);
          msgRow.appendChild(msgSpan);
          info.appendChild(nameRow);
          info.appendChild(msgRow);
          item.appendChild(avatar);
          item.appendChild(info);

          item.addEventListener('click', () => {
            activatePanel('chat-panel');
            selectChat(chat.chatId);
          });

          chatList.appendChild(item);
        });

        if (currentChatId && !chats.some((c) => c.chatId === currentChatId)) {
          currentChatId = null;
          document.getElementById('chat-main-area').classList.add('hidden');
          document.getElementById('welcome-screen').classList.remove('hidden');
        }
      },
      () => {},
    );
}

function filterChats() {
  const query = document.getElementById('chat-search').value.toLowerCase();
  const items = document.querySelectorAll('.chat-item');
  items.forEach((item) => {
    const name = item
      .querySelector('.chat-item-name')
      .textContent.toLowerCase();
    item.style.display = name.includes(query) ? 'flex' : 'none';
  });
}

function selectChat(chatId) {
  if (activeChatListener) activeChatListener();

  currentChatId = chatId;

  document.querySelectorAll('.chat-item').forEach((item) => {
    item.classList.toggle('active', item.dataset.id === chatId);
  });

  document.getElementById('welcome-screen').classList.add('hidden');
  document.getElementById('chat-main-area').classList.remove('hidden');

  db.collection('chats')
    .doc(chatId)
    .get()
    .then((doc) => {
      if (!doc.exists) return;
      const chat = doc.data();
      const title = document.getElementById('active-chat-title');
      const membersText = document.getElementById('active-chat-members');
      const avatar = document.getElementById('active-chat-avatar');

      if (chat.isGlobal) {
        title.textContent = chat.name;
        membersText.textContent = 'Everyone in CS13';
        avatar.textContent = 'G';
      } else if (chat.isGroup) {
        title.textContent = chat.name;
        avatar.textContent = chat.name.charAt(0).toUpperCase();
        resolveMemberNames(chat.members, (names) => {
          membersText.textContent = names.join(', ');
        });
      } else {
        const otherUid = chat.members.find((m) => m !== currentUser.uid);
        const otherUser = allUsers.find((u) => u.uid === otherUid);
        const displayName = otherUser ? otherUser.name : 'Classmate';
        title.textContent = displayName;
        avatar.textContent = displayName.charAt(0).toUpperCase();
        membersText.textContent = 'Direct Message';
      }
    });

  const messageList = document.getElementById('message-list');
  messageList.innerHTML = '';

  activeChatListener = db
    .collection('chats')
    .doc(chatId)
    .collection('messages')
    .orderBy('timestamp', 'asc')
    .onSnapshot((snapshot) => {
      messageList.innerHTML = '';
      snapshot.forEach((doc) => {
        const message = doc.data();
        const msgId = doc.id;
        const isMine = message.senderId === currentUser.uid;

        const group = document.createElement('div');
        group.className = 'message-group ' + (isMine ? 'mine' : 'other');

        if (!isMine) {
          const sender = document.createElement('div');
          sender.className = 'message-sender';
          sender.textContent = message.senderName;
          group.appendChild(sender);
        }

        const bubbleWrapper = document.createElement('div');
        bubbleWrapper.className = 'message-bubble-wrapper';

        const bubble = document.createElement('div');
        bubble.className = 'message-bubble';
        bubble.textContent = message.content;

        bubble.addEventListener('dblclick', () => {
          toggleLikeMessage(chatId, msgId, message.likes || []);
        });

        bubbleWrapper.appendChild(bubble);

        if (message.likes && message.likes.length > 0) {
          const badge = document.createElement('div');
          badge.className = 'like-badge';

          const svg = document.createElementNS(
            'http://www.w3.org/2000/svg',
            'svg',
          );
          svg.setAttribute('class', 'like-icon-svg');
          svg.setAttribute('viewBox', '0 0 24 24');

          const path = document.createElementNS(
            'http://www.w3.org/2000/svg',
            'path',
          );
          path.setAttribute(
            'd',
            'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
          );

          svg.appendChild(path);
          badge.appendChild(svg);

          const count = document.createElement('span');
          count.className = 'like-count';
          count.textContent = message.likes.length;
          badge.appendChild(count);

          badge.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleLikeMessage(chatId, msgId, message.likes || []);
          });

          bubbleWrapper.appendChild(badge);
        }

        const time = document.createElement('div');
        time.className = 'message-time';
        time.textContent = formatTime(message.timestamp);

        group.appendChild(bubbleWrapper);
        group.appendChild(time);
        messageList.appendChild(group);
      });

      messageList.scrollTop = messageList.scrollHeight;
    });
}

function resolveMemberNames(members, callback) {
  const names = [];
  let resolvedCount = 0;
  members.forEach((uid) => {
    db.collection('users')
      .doc(uid)
      .get()
      .then((doc) => {
        names.push(doc.exists ? doc.data().name : 'Classmate');
        resolvedCount++;
        if (resolvedCount === members.length) callback(names);
      })
      .catch(() => {
        names.push('Classmate');
        resolvedCount++;
        if (resolvedCount === members.length) callback(names);
      });
  });
}

function toggleLikeMessage(chatId, messageId, currentLikes) {
  const ref = db
    .collection('chats')
    .doc(chatId)
    .collection('messages')
    .doc(messageId);
  if (currentLikes.includes(currentUser.uid)) {
    ref.update({
      likes: firebase.firestore.FieldValue.arrayRemove(currentUser.uid),
    });
  } else {
    ref.update({
      likes: firebase.firestore.FieldValue.arrayUnion(currentUser.uid),
    });
  }
}

function handleSendMessage(e) {
  e.preventDefault();
  if (!currentChatId) return;

  const input = document.getElementById('message-input');
  const content = input.value.trim();
  if (!content) return;

  input.value = '';

  db.collection('chats')
    .doc(currentChatId)
    .collection('messages')
    .add({
      content,
      senderId: currentUser.uid,
      senderName: getDisplayName(),
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      likes: [],
    })
    .then(() => {
      return db.collection('chats').doc(currentChatId).update({
        lastMessage: content,
        lastMessageTime: firebase.firestore.FieldValue.serverTimestamp(),
      });
    })
    .catch(() => {});
}

function loadAllUsers() {
  db.collection('users')
    .get()
    .then((snapshot) => {
      allUsers = [];
      snapshot.forEach((doc) => {
        allUsers.push(doc.data());
      });
      renderStudentList();
    });
}

function renderStudentList() {
  const container = document.getElementById('student-list');
  if (!container || !currentUser) return;

  container.innerHTML = '';
  selectedStudents = [];

  const others = allUsers.filter((u) => u.uid !== currentUser.uid);

  others.forEach((user) => {
    const item = document.createElement('div');
    item.className = 'student-select-item';
    item.dataset.uid = user.uid;

    const checkbox = document.createElement('div');
    checkbox.className = 'checkbox-custom';

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'checkbox-icon');
    svg.setAttribute('viewBox', '0 0 24 24');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z');

    svg.appendChild(path);
    checkbox.appendChild(svg);

    const name = document.createElement('span');
    name.className = 'student-select-name';
    name.textContent = user.name;

    item.appendChild(checkbox);
    item.appendChild(name);

    item.addEventListener('click', () => {
      if (selectedStudents.includes(user.uid)) {
        selectedStudents = selectedStudents.filter((id) => id !== user.uid);
        item.classList.remove('selected');
      } else {
        selectedStudents.push(user.uid);
        item.classList.add('selected');
      }

      const groupNameField = document.getElementById('group-name-field');
      if (selectedStudents.length > 1) {
        groupNameField.classList.remove('hidden');
      } else {
        groupNameField.classList.add('hidden');
      }
    });

    container.appendChild(item);
  });
}

function setupNewChatModal() {
  const modal = document.getElementById('new-chat-modal');
  const trigger = document.getElementById('new-chat-trigger');
  const closeBtn = document.getElementById('new-chat-close');
  const cancelBtn = document.getElementById('new-chat-cancel-btn');
  const submitBtn = document.getElementById('create-chat-submit-btn');

  if (!modal || !trigger || trigger.dataset.bound) return;
  trigger.dataset.bound = 'true';

  trigger.addEventListener('click', () => {
    renderStudentList();
    document.getElementById('group-chat-name').value = '';
    document.getElementById('group-name-field').classList.add('hidden');
    modal.classList.add('active');
  });

  const closeModal = () => {
    modal.classList.remove('active');
  };

  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);

  submitBtn.addEventListener('click', () => {
    if (selectedStudents.length === 0) {
      showToast('Please select at least one classmate.');
      return;
    }

    const members = [...selectedStudents, currentUser.uid];

    if (selectedStudents.length === 1) {
      const otherUid = selectedStudents[0];
      db.collection('chats')
        .where('isGroup', '==', false)
        .where('members', 'array-contains', currentUser.uid)
        .get()
        .then((snapshot) => {
          let existingChat = null;
          snapshot.forEach((doc) => {
            const chat = doc.data();
            if (chat.members.includes(otherUid)) existingChat = chat;
          });

          if (existingChat) {
            selectChat(existingChat.chatId);
            closeModal();
          } else {
            createNewChat('', false, members);
          }
        });
    } else {
      const groupName = document.getElementById('group-chat-name').value.trim();
      if (!groupName) {
        showToast('Please enter a group name.');
        return;
      }
      createNewChat(groupName, true, members);
    }
  });
}

function createNewChat(name, isGroup, members) {
  const modal = document.getElementById('new-chat-modal');
  const newChatRef = db.collection('chats').doc();
  const chatId = newChatRef.id;

  newChatRef
    .set({
      chatId,
      name,
      isGroup,
      isGlobal: false,
      members,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastMessage: '',
      lastMessageTime: firebase.firestore.FieldValue.serverTimestamp(),
    })
    .then(() => {
      selectChat(chatId);
      if (modal) modal.classList.remove('active');
    })
    .catch(() => {
      showToast('Failed to create chat.');
    });
}
