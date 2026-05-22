import { db } from '../core/firebase-init.js';
import { getCachedQuery } from '../core/firestore-cache.js';
import { showToast, formatTime } from '../core/utils.js';

let currentChatId = null;
let activeChatListener = null;
let activeChatMetaListener = null;
let chatsListener = null;
let allUsers = [];
let selectedStudents = [];
let availableChats = [];
let forwardMessagePayload = null;

export function cleanupChatListeners() {
  if (activeChatListener) activeChatListener();
  if (activeChatMetaListener) activeChatMetaListener();
  if (chatsListener) chatsListener();
  activeChatListener = null;
  activeChatMetaListener = null;
  chatsListener = null;
  currentChatId = null;
}

export function listenToChats(currentUser, activatePanel, selectChatFn) {
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
        availableChats = chats;

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
            const displayName = otherUser ? otherUser.name : '朋友';
            nameSpan.textContent = displayName;
            avatar.textContent = displayName.charAt(0).toUpperCase();
          }

          timeSpan.textContent = formatTime(chat.lastMessageTime);
          msgSpan.textContent = chat.lastMessage || '尚未有訊息';

          nameRow.appendChild(nameSpan);
          nameRow.appendChild(timeSpan);
          msgRow.appendChild(msgSpan);
          info.appendChild(nameRow);
          info.appendChild(msgRow);
          item.appendChild(avatar);
          item.appendChild(info);

          item.addEventListener('click', () => {
            activatePanel('chat-panel');
            selectChatFn(chat.chatId, currentUser);
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

export function filterChats() {
  const query = document.getElementById('chat-search').value.toLowerCase();
  const items = document.querySelectorAll('.chat-item');
  items.forEach((item) => {
    const name = item
      .querySelector('.chat-item-name')
      .textContent.toLowerCase();
    item.style.display = name.includes(query) ? 'flex' : 'none';
  });
}

export function selectChat(chatId, currentUser) {
  if (activeChatListener) activeChatListener();
  if (activeChatMetaListener) activeChatMetaListener();

  currentChatId = chatId;

  document.querySelectorAll('.chat-item').forEach((item) => {
    item.classList.toggle('active', item.dataset.id === chatId);
  });

  document.getElementById('welcome-screen').classList.add('hidden');
  document.getElementById('chat-main-area').classList.remove('hidden');

  const chatPanel = document.getElementById('chat-panel');
  if (chatPanel) chatPanel.classList.add('chat-view-active');
  requestAnimationFrame(() => {
    window.dispatchEvent(new Event('liquid-glass:refresh'));
    window.setTimeout(() => {
      window.dispatchEvent(new Event('liquid-glass:refresh'));
    }, 120);
  });

  activeChatMetaListener = db
    .collection('chats')
    .doc(chatId)
    .onSnapshot((doc) => {
      if (!doc.exists) return;
      const chat = doc.data();
      const title = document.getElementById('active-chat-title');
      const membersText = document.getElementById('active-chat-members');
      const avatar = document.getElementById('active-chat-avatar');
      renderPinnedMessage(chat.pinnedMessage);

      if (chat.isGlobal) {
        title.textContent = chat.name;
        membersText.textContent = '13 班的所有人';
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
        const displayName = otherUser ? otherUser.name : '朋友';
        title.textContent = displayName;
        avatar.textContent = displayName.charAt(0).toUpperCase();
        membersText.textContent = '私人訊息';
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
        group.dataset.messageId = msgId;

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
        if (message.recalled) bubble.classList.add('message-recalled');

        if (!message.recalled) {
          bubble.addEventListener('dblclick', () => {
            toggleLikeMessage(chatId, msgId, message.likes || [], currentUser);
          });
        }

        const menuButton = createMessageMenuButton();
        const menu = createMessageActionMenu(chatId, msgId, message, currentUser);
        bubbleWrapper.appendChild(menuButton);
        bubbleWrapper.appendChild(bubble);
        bubbleWrapper.appendChild(menu);

        menuButton.addEventListener('click', (e) => {
          e.stopPropagation();
          closeMessageMenus(menu);
          const isOpen = menu.classList.toggle('active');
          menuButton.setAttribute('aria-expanded', String(isOpen));
        });

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
            toggleLikeMessage(chatId, msgId, message.likes || [], currentUser);
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

export function resolveMemberNames(members, callback) {
  const names = members.map((uid) => {
    const user = allUsers.find((item) => item.uid === uid);
    return user ? user.name : '朋友';
  });
  callback(names);
}

export function toggleLikeMessage(
  chatId,
  messageId,
  currentLikes,
  currentUser,
) {
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

function createMessageMenuButton() {
  const button = document.createElement('button');
  button.className = 'message-menu-button';
  button.type = 'button';
  button.title = '更多';
  button.setAttribute('aria-label', '更多訊息操作');
  button.setAttribute('aria-expanded', 'false');
  button.innerHTML =
    '<svg fill="currentColor" height="16" viewBox="0 0 24 24" width="16" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="6" r="1.5"/><circle cx="12" cy="18" r="1.5"/></svg>';
  return button;
}

function createMessageActionMenu(chatId, messageId, message, currentUser) {
  const menu = document.createElement('div');
  menu.className = 'message-action-menu';

  const actions = [
    {
      label: '轉寄',
      icon:
        '<svg fill="currentColor" height="18" viewBox="0 0 24 24" width="18" xmlns="http://www.w3.org/2000/svg"><path d="M13.973 20.046 21.77 6.928C22.8 5.195 21.55 3 19.535 3H4.466C2.138 3 .984 5.825 2.646 7.456l4.842 4.752 1.723 7.121c.548 2.266 3.571 2.721 4.762.717Z" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="2"/><line fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="7.488" x2="15.515" y1="12.208" y2="7.641"/></svg>',
      handler: () => openForwardMessageModal(message, currentUser),
    },
    {
      label: '置頂',
      icon:
        '<svg fill="currentColor" height="18" viewBox="0 0 24 24" width="18" xmlns="http://www.w3.org/2000/svg"><path d="m22.707 7.583-6.29-6.29a1 1 0 0 0-1.414 0 5.183 5.183 0 0 0-1.543 3.593L8.172 8.79a5.161 5.161 0 0 0-4.768 1.42 1 1 0 0 0 0 1.414l3.779 3.778-5.89 5.89a1 1 0 1 0 1.414 1.414l5.89-5.89 3.778 3.779a1 1 0 0 0 1.414 0 5.174 5.174 0 0 0 1.42-4.769l3.905-5.287a5.183 5.183 0 0 0 3.593-1.543 1 1 0 0 0 0-1.414Zm-3.979.941a.974.974 0 0 0-.908.4l-4.512 6.111a1 1 0 0 0-.14.927 3.037 3.037 0 0 1-.194 2.403l-7.34-7.339a3.042 3.042 0 0 1 2.403-.196.994.994 0 0 0 .927-.138l6.111-4.512a.999.999 0 0 0 .4-.909 3.086 3.086 0 0 1 .342-1.75l4.662 4.662a3.072 3.072 0 0 1-1.75.341Z"/></svg>',
      handler: () => pinMessage(chatId, messageId, message, currentUser),
    },
    {
      label: '收回訊息',
      danger: true,
      icon:
        '<svg fill="currentColor" height="18" viewBox="0 0 24 24" width="18" xmlns="http://www.w3.org/2000/svg"><path d="M12 .5C5.659.5.5 5.66.5 12S5.659 23.5 12 23.5c6.34 0 11.5-5.16 11.5-11.5S18.34.5 12 .5Zm0 21c-5.238 0-9.5-4.262-9.5-9.5S6.762 2.5 12 2.5s9.5 4.262 9.5 9.5-4.262 9.5-9.5 9.5Z"/><path d="M14.5 10H9.414l1.293-1.293a1 1 0 1 0-1.414-1.414l-3 2.999a1 1 0 0 0 0 1.414l3 3.001a.997.997 0 0 0 1.414 0 1 1 0 0 0 0-1.414L9.415 12H14.5c.827 0 1.5.674 1.5 1.501 0 .395-.157.794-.431 1.096-.227.249-.508.403-.735.403L14 14.999a1 1 0 0 0-.001 2l.833.001h.002c.796 0 1.604-.386 2.215-1.059a3.625 3.625 0 0 0 .951-2.44C18 11.571 16.43 10 14.5 10Z"/></svg>',
      handler: () => recallMessage(chatId, messageId, message),
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
      closeMessageMenus();
      action.handler();
    });
    menu.appendChild(button);
  });

  return menu;
}

function closeMessageMenus(exceptMenu = null) {
  document.querySelectorAll('.message-action-menu.active').forEach((menu) => {
    if (menu === exceptMenu) return;
    menu.classList.remove('active');
    const button = menu.parentElement.querySelector('.message-menu-button');
    if (button) button.setAttribute('aria-expanded', 'false');
  });
}

function pinMessage(chatId, messageId, message, currentUser) {
  db.collection('chats')
    .doc(chatId)
    .update({
      pinnedMessage: {
        id: messageId,
        content: message.content,
        senderName: message.senderName || getCurrentUserName(currentUser),
        timestamp: message.timestamp || null,
        pinnedBy: currentUser.uid,
        pinnedAt: firebase.firestore.FieldValue.serverTimestamp(),
      },
    })
    .then(() => showToast('已置頂訊息'))
    .catch(() => showToast('置頂失敗:('));
}

function recallMessage(chatId, messageId, message) {
  db.collection('chats')
    .doc(chatId)
    .collection('messages')
    .doc(messageId)
    .delete()
    .then(() => {
      db.collection('chats')
        .doc(chatId)
        .get()
        .then((doc) => {
          if (!doc.exists) return null;

          const chat = doc.data();
          const updates = [];

          if (chat.pinnedMessage && chat.pinnedMessage.id === messageId) {
            updates.push(
              doc.ref.update({
                pinnedMessage: firebase.firestore.FieldValue.delete(),
              }),
            );
          }

          if (chat.lastMessage === message.content) {
            updates.push(updateChatLastMessageAfterRecall(chatId, doc.ref));
          }

          return Promise.all(updates);
        });
      showToast('已收回訊息');
    })
    .catch(() => showToast('收回失敗:('));
}

function updateChatLastMessageAfterRecall(chatId, chatRef) {
  return chatRef
    .collection('messages')
    .orderBy('timestamp', 'desc')
    .limit(1)
    .get()
    .then((snapshot) => {
      if (snapshot.empty) {
        return chatRef.update({
          lastMessage: '',
          lastMessageTime: firebase.firestore.FieldValue.serverTimestamp(),
        });
      }

      const latestMessage = snapshot.docs[0].data();
      return chatRef.update({
        lastMessage: latestMessage.content || '',
        lastMessageTime:
          latestMessage.timestamp || firebase.firestore.FieldValue.serverTimestamp(),
      });
    });
}

function renderPinnedMessage(pinnedMessage) {
  const banner = document.getElementById('pinned-message-banner');
  const text = document.getElementById('pinned-message-text');
  if (!banner || !text) return;

  if (!pinnedMessage || !pinnedMessage.content) {
    banner.classList.add('hidden');
    text.textContent = '';
    banner.onclick = null;
    return;
  }

  text.textContent = `${pinnedMessage.senderName || '朋友'}: ${pinnedMessage.content}`;
  banner.classList.remove('hidden');
  banner.onclick = () => {
    const target = document.querySelector(
      `[data-message-id="${pinnedMessage.id}"]`,
    );
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
}

function openForwardMessageModal(message, currentUser) {
  if (message.recalled) {
    showToast('已收回的訊息不能轉寄');
    return;
  }

  forwardMessagePayload = {
    content: message.content,
    senderName: getCurrentUserName(currentUser),
    senderId: currentUser.uid,
  };

  const modal = document.getElementById('forward-message-modal');
  const preview = document.getElementById('forward-message-preview');
  const list = document.getElementById('forward-chat-list');
  if (!modal || !preview || !list) return;

  preview.textContent = message.content;
  list.innerHTML = '';

  availableChats.forEach((chat) => {
    const item = document.createElement('button');
    item.className = 'forward-chat-item';
    item.type = 'button';

    const avatar = document.createElement('span');
    avatar.className = 'chat-item-avatar forward-chat-avatar';
    const name = document.createElement('span');
    name.className = 'forward-chat-name';
    const chatName = getChatDisplayName(chat, currentUser);
    avatar.textContent = chatName.charAt(0).toUpperCase();
    name.textContent = chatName;

    item.appendChild(avatar);
    item.appendChild(name);
    item.addEventListener('click', () => forwardMessageToChat(chat.chatId));
    list.appendChild(item);
  });

  modal.classList.add('active');
}

function forwardMessageToChat(chatId) {
  if (!forwardMessagePayload) return;

  db.collection('chats')
    .doc(chatId)
    .collection('messages')
    .add({
      content: forwardMessagePayload.content,
      senderId: forwardMessagePayload.senderId,
      senderName: forwardMessagePayload.senderName,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      likes: [],
      forwarded: true,
    })
    .then(() => {
      return db.collection('chats').doc(chatId).update({
        lastMessage: forwardMessagePayload.content,
        lastMessageTime: firebase.firestore.FieldValue.serverTimestamp(),
      });
    })
    .then(() => {
      closeForwardMessageModal();
      showToast('已轉寄訊息');
    })
    .catch(() => showToast('轉寄失敗:('));
}

function closeForwardMessageModal() {
  const modal = document.getElementById('forward-message-modal');
  if (modal) modal.classList.remove('active');
  forwardMessagePayload = null;
}

function getChatDisplayName(chat, currentUser) {
  if (chat.isGlobal || chat.isGroup) return chat.name;
  const otherUid = chat.members.find((m) => m !== currentUser.uid);
  const otherUser = allUsers.find((u) => u.uid === otherUid);
  return otherUser ? otherUser.name : '朋友';
}

function getCurrentUserName(currentUser) {
  const cachedUser = allUsers.find((user) => user.uid === currentUser.uid);
  if (cachedUser) return cachedUser.name;
  return currentUser.displayName || currentUser.email || '我';
}

document.addEventListener('click', () => {
  closeMessageMenus();
});

document.addEventListener('DOMContentLoaded', () => {
  const closeBtn = document.getElementById('forward-message-close');
  const modal = document.getElementById('forward-message-modal');
  if (closeBtn) closeBtn.addEventListener('click', closeForwardMessageModal);
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeForwardMessageModal();
    });
  }
});

export function handleSendMessage(e, currentUser, getDisplayName) {
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
      senderName: getDisplayName(currentUser),
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

export function loadAllUsers(currentUser, onLoaded) {
  getCachedQuery(db.collection('users'), 'all-users-lite', {
    ttlMs: 10 * 60 * 1000,
    normalizeItem: (user) => ({
      uid: user.uid,
      name: user.name,
      username: user.username,
    }),
  })
    .then((users) => {
      allUsers = users;
      renderStudentList(currentUser);
      if (onLoaded) onLoaded();
    })
    .catch(() => {
      allUsers = [];
      renderStudentList(currentUser);
      if (onLoaded) onLoaded();
    });
}

export function renderStudentList(currentUser) {
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

export function setupNewChatModal(currentUser, selectChatFn) {
  const modal = document.getElementById('new-chat-modal');
  const trigger = document.getElementById('new-chat-trigger');
  const closeBtn = document.getElementById('new-chat-close');
  const cancelBtn = document.getElementById('new-chat-cancel-btn');
  const submitBtn = document.getElementById('create-chat-submit-btn');

  if (!modal || !trigger || trigger.dataset.bound) return;
  trigger.dataset.bound = 'true';

  trigger.addEventListener('click', () => {
    renderStudentList(currentUser);
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
      showToast('請至少選擇一位朋友😀');
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
            selectChatFn(existingChat.chatId, currentUser);
            closeModal();
          } else {
            createNewChat('', false, members, selectChatFn, currentUser);
          }
        });
    } else {
      const groupName = document.getElementById('group-chat-name').value.trim();
      if (!groupName) {
        showToast('請輸入群組名稱😀');
        return;
      }
      createNewChat(groupName, true, members, selectChatFn, currentUser);
    }
  });
}

export function createNewChat(
  name,
  isGroup,
  members,
  selectChatFn,
  currentUser,
) {
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
      selectChatFn(chatId, currentUser);
      if (modal) modal.classList.remove('active');
    })
    .catch(() => {
      showToast('建立聊天室失敗:(');
    });
}
