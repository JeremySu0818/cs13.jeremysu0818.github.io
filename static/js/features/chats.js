import { db } from '../core/firebase-init.js';
import { showToast, formatTime } from '../core/utils.js';

let currentChatId = null;
let activeChatListener = null;
let chatsListener = null;
let allUsers = [];
let selectedStudents = [];

export function cleanupChatListeners() {
  if (activeChatListener) activeChatListener();
  if (chatsListener) chatsListener();
  activeChatListener = null;
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
          toggleLikeMessage(chatId, msgId, message.likes || [], currentUser);
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

export function toggleLikeMessage(chatId, messageId, currentLikes, currentUser) {
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

export function loadAllUsers(currentUser) {
  db.collection('users')
    .get()
    .then((snapshot) => {
      allUsers = [];
      snapshot.forEach((doc) => {
        allUsers.push(doc.data());
      });
      renderStudentList(currentUser);
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
            selectChatFn(existingChat.chatId, currentUser);
            closeModal();
          } else {
            createNewChat('', false, members, selectChatFn, currentUser);
          }
        });
    } else {
      const groupName = document.getElementById('group-chat-name').value.trim();
      if (!groupName) {
        showToast('Please enter a group name.');
        return;
      }
      createNewChat(groupName, true, members, selectChatFn, currentUser);
    }
  });
}

export function createNewChat(name, isGroup, members, selectChatFn, currentUser) {
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
      showToast('Failed to create chat.');
    });
}
