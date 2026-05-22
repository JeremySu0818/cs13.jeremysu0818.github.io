import { auth, db } from './core/firebase-init.js';
import { getDisplayName } from './core/utils.js';
import { listenToQuotes, setupQuoteForms } from './features/quotes.js';
import { listenToAlbums, setupAlbumForm } from './features/albums.js';
import { listenToPolls, setupPollForm } from './features/polls.js';
import {
  listenToChats,
  setupNewChatModal,
  loadAllUsers,
  filterChats,
  handleSendMessage,
  selectChat,
  cleanupChatListeners,
} from './features/chats.js';
import {
  setupLoginForm,
  setupLogout,
  showChangePasswordModal,
  setupChangePasswordForm,
  setupProfileSettings,
} from './core/auth.js';

const isAppPage = location.pathname.includes('app.html');
const isPublicPage = !isAppPage;

let currentUser = null;
let publicInitialized = false;
let appInitialized = false;
let publicAlbumsInitialized = false;
let publicPollsInitialized = false;

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
  setupQuoteForms(currentUser, getDisplayName);
  setupLoginForm();
  setupPublicTabs();
}

function initializeDashboard() {
  if (appInitialized) return;
  appInitialized = true;

  listenToQuotes();
  setupQuoteForms(currentUser, getDisplayName);
  setupUserAvatar();
  setupPanelNavigation();
  setupChangePasswordForm(currentUser);
  setupProfileSettings(currentUser, setupUserAvatar);
  setupLogout(cleanupChatListeners);
  setupNewChatModal(currentUser, selectChat);
  setupAlbumForm(currentUser, getDisplayName);
  setupPollForm(currentUser, getDisplayName);
  listenToAlbums(updateCount);
  listenToPolls(updateCount, currentUser);
  loadAllUsers(currentUser, () => {
    listenToChats(currentUser, activatePanel, selectChat);
  });

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
    welcomeTitle.textContent = '歡迎, ' + getDisplayName(currentUser);
  }

  const searchInput = document.getElementById('chat-search');
  if (searchInput) {
    searchInput.addEventListener('input', filterChats);
  }

  const messageForm = document.getElementById('message-form');
  if (messageForm) {
    messageForm.addEventListener('submit', (e) =>
      handleSendMessage(e, currentUser, getDisplayName),
    );
  }

  const chatBackBtn = document.getElementById('chat-back-btn');
  if (chatBackBtn) {
    chatBackBtn.addEventListener('click', () => {
      const chatPanel = document.getElementById('chat-panel');
      if (chatPanel) chatPanel.classList.remove('chat-view-active');
      requestAnimationFrame(refreshLiquidGlass);
    });
  }

  if (location.hash === '#albums') {
    activatePanel('albums-panel');
  } else if (location.hash === '#polls') {
    activatePanel('polls-panel');
  } else if (location.hash === '#profile') {
    activatePanel('profile-panel');
  }
}

function updatePublicAuthState() {
  const loginSection = document.getElementById('login-section');
  if (!loginSection) return;

  const tabLogin = document.getElementById('tab-login');
  const tabApp = document.getElementById('tab-app');
  const authOnlyLinks = document.querySelectorAll('.auth-only-link');

  if (currentUser) {
    loginSection.classList.add('signed-in');
    const title = loginSection.querySelector('.section-title');
    const copy = loginSection.querySelector('.section-copy');
    if (title) title.textContent = '已登入';
    if (copy) copy.textContent = '可以直接進入來新增相簿、投票或聊天 😀 ';
    if (tabLogin) tabLogin.classList.add('hidden');
    if (tabApp) tabApp.classList.remove('hidden');
    authOnlyLinks.forEach((link) => link.classList.remove('hidden'));
  } else {
    loginSection.classList.remove('signed-in');
    if (tabLogin) tabLogin.classList.remove('hidden');
    if (tabApp) tabApp.classList.add('hidden');
    authOnlyLinks.forEach((link) => link.classList.add('hidden'));
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
        sec.classList.toggle('hidden', sectionId !== targetSectionId);
      }
      if (btn) {
        btn.classList.toggle('btn-secondary', sectionId !== targetSectionId);
      }
    });

    if (targetSectionId === 'albums-section' && !publicAlbumsInitialized) {
      publicAlbumsInitialized = true;
      listenToAlbums();
    }

    if (targetSectionId === 'polls-section' && !publicPollsInitialized) {
      publicPollsInitialized = true;
      listenToPolls(null, currentUser);
    }
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

  requestAnimationFrame(refreshLiquidGlass);
}

function refreshLiquidGlass() {
  window.dispatchEvent(new Event('liquid-glass:refresh'));
  window.setTimeout(() => {
    window.dispatchEvent(new Event('liquid-glass:refresh'));
  }, 120);
}

function setupUserAvatar(avatarDataUrl = null) {
  const avatar = document.getElementById('user-avatar');
  if (avatar) {
    if (!avatar.dataset.bound) {
      avatar.dataset.bound = 'true';
      avatar.addEventListener('click', () => {
        activatePanel('profile-panel');
        location.hash = 'profile';
      });
    }

    if (avatarDataUrl === null) return;

    avatar.textContent = '';
    avatar.style.backgroundImage = '';

    if (avatarDataUrl) {
      avatar.style.backgroundImage = `url("${avatarDataUrl}")`;
    } else {
      avatar.textContent = getDisplayName(currentUser).charAt(0).toUpperCase();
    }
  }
}

function updateCount(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = String(value);
}
