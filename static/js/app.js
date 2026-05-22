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
  shouldPromptInitialPasswordChange,
} from './core/auth.js';

const isAppPage = location.pathname.replace(/\/$/, '') === '/app';
const isPublicPage = !isAppPage;
const dashboardRoutes = {
  home: 'home-panel',
  chat: 'chat-panel',
  albums: 'albums-panel',
  polls: 'polls-panel',
  quotes: 'quotes-panel',
  profile: 'profile-panel',
};
const dashboardPanelRoutes = Object.fromEntries(
  Object.entries(dashboardRoutes).map(([route, panelId]) => [panelId, route]),
);

let currentUser = null;
let publicInitialized = false;
let appInitialized = false;
let publicAlbumsInitialized = false;
let publicPollsInitialized = false;

auth.onAuthStateChanged((user) => {
  currentUser = user;

  if (isAppPage && !user) {
    location.href = '/';
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

  if (shouldPromptInitialPasswordChange()) {
    showChangePasswordModal();
  }

  db.collection('chats')
    .doc('global_class_chat')
    .get()
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
    .catch((err) => {
      console.warn('Failed to verify global chat membership:', err);
    });

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

  handleDashboardHash();
  window.addEventListener('hashchange', handleDashboardHash);

  window.addEventListener('resize', updateNavIndicator);
  requestAnimationFrame(updateNavIndicator);
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
    if (copy) copy.textContent = '可以直接進入來新增相簿、投票或聊天😀';
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
    { buttonId: 'tab-quote', route: 'quote', sectionId: 'quote-section' },
    { buttonId: 'tab-albums', route: 'albums', sectionId: 'albums-section' },
    { buttonId: 'tab-polls', route: 'polls', sectionId: 'polls-section' },
    { buttonId: 'tab-login', route: 'login', sectionId: 'login-section' },
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

  tabs.forEach(({ buttonId, route, sectionId }) => {
    const btn = document.getElementById(buttonId);
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        location.hash = route;
        activateTab(sectionId);
      });
    }
  });

  function handleHash() {
    const hash = location.hash.replace('#', '');
    const tab = tabs.find((t) => t.route === hash);
    if (tab) {
      activateTab(tab.sectionId);
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
  const currentActivePanel = document.querySelector('.hub-panel.active');
  const wasProfile = currentActivePanel && currentActivePanel.id === 'profile-panel';
  const isProfile = panelId === 'profile-panel';
  const skipTransition = wasProfile && !isProfile;

  document.querySelectorAll('.hub-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === panelId);
  });

  document.querySelectorAll('[data-panel]').forEach((button) => {
    button.classList.toggle('active', button.dataset.panel === panelId);
  });

  const route = dashboardPanelRoutes[panelId];
  if (route && location.hash !== `#${route}`) {
    location.hash = route;
  }

  updateNavIndicator(skipTransition);
  requestAnimationFrame(refreshLiquidGlass);
}

function handleDashboardHash() {
  const route = location.hash.replace('#', '');
  activatePanel(dashboardRoutes[route] || 'home-panel');
}

function updateNavIndicator(skipTransition) {
  const activeBtn = document.querySelector('.nav-menu .nav-item.active');
  const indicator = document.querySelector('.nav-indicator');
  if (!indicator) return;

  if (activeBtn) {
    if (skipTransition === true) {
      indicator.style.transition = 'none';
    }
    indicator.style.width = `${activeBtn.offsetWidth}px`;
    indicator.style.height = `${activeBtn.offsetHeight}px`;
    indicator.style.transform = `translate3d(${activeBtn.offsetLeft}px, ${activeBtn.offsetTop}px, 0)`;
    if (skipTransition === true) {
      indicator.offsetHeight;
      indicator.style.transition = '';
    }
    indicator.style.opacity = '1';
  } else {
    if (skipTransition === true) {
      indicator.style.transition = 'none';
    }
    indicator.style.opacity = '0';
    if (skipTransition === true) {
      indicator.offsetHeight;
      indicator.style.transition = '';
    }
  }
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
