const firebaseConfig = {
  apiKey: "AIzaSyCosLad47n5SXSdkYUx4NRm7xzjJmzz_QA",
  authDomain: "cs13-91fc7.firebaseapp.com",
  projectId: "cs13-91fc7",
  storageBucket: "cs13-91fc7.firebasestorage.app",
  messagingSenderId: "382518050683",
  appId: "1:382518050683:web:a3a0b5e888e790b7c547de",
  measurementId: "G-DK6THT1QXG"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();

let quotes = [];
let currentUser = null;
let currentChatId = null;
let activeChatListener = null;
let chatsListener = null;
let selectedStudents = [];
let allUsers = [];

function showToast(message) {
  const toast = document.getElementById("toast-message");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => {
    toast.classList.remove("show");
  }, 1500);
}

function fetchQuotes() {
  fetch("/assets/quotes.json")
    .then(res => res.json())
    .then(data => {
      quotes = data;
      showRandomQuote();
    })
    .catch(() => {});
}

function showRandomQuote() {
  if (quotes.length === 0) return;
  const quote = quotes[Math.floor(Math.random() * quotes.length)];
  const display = document.getElementById("quote-display");
  if (display) {
    display.textContent = quote;
  }
  const welcomeDisplay = document.getElementById("welcome-quote-display");
  if (welcomeDisplay) {
    welcomeDisplay.textContent = quote;
  }
}

const isAppPage = location.pathname.includes("app.html");

auth.onAuthStateChanged(user => {
  if (user) {
    currentUser = user;
    if (!isAppPage) {
      location.href = "/static/app.html";
    } else {
      initializeDashboard();
    }
  } else {
    currentUser = null;
    if (isAppPage) {
      location.href = "/index.html";
    } else {
      initializeLoginPage();
    }
  }
});

function initializeLoginPage() {
  fetchQuotes();

  const nextBtn = document.getElementById("next-quote-btn");
  if (nextBtn) {
    nextBtn.addEventListener("click", showRandomQuote);
  }

  const copyBtn = document.getElementById("copy-quote-btn");
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      const display = document.getElementById("quote-display");
      if (display && display.textContent && display.textContent !== "Loading...") {
        navigator.clipboard.writeText(display.textContent).then(() => {
          showToast("Quote copied!");
        });
      }
    });
  }

  const loginForm = document.getElementById("login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", e => {
      e.preventDefault();
      const username = document.getElementById("login-username").value.trim();
      const email = username + "@cs13.class";
      const password = document.getElementById("login-password").value;
      const errorMsg = document.getElementById("error-message");
      const submitBtn = document.getElementById("submit-btn");

      submitBtn.disabled = true;
      errorMsg.textContent = "";

      auth.signInWithEmailAndPassword(email, password)
        .then(() => {})
        .catch(err => {
          submitBtn.disabled = false;
          errorMsg.textContent = err.message;
        });
    });
  }
}

function initializeDashboard() {
  fetchQuotes();
  setupUserAvatar();

  db.collection("users").doc(currentUser.uid).get()
    .then(doc => {
      if (doc.exists) {
        const userData = doc.data();
        if (userData.mustChangePassword) {
          showChangePasswordModal();
        }
      }
      return db.collection("chats").doc("global_class_chat").get();
    })
    .then(chatDoc => {
      if (chatDoc.exists) {
        const members = chatDoc.data().members || [];
        if (!members.includes(currentUser.uid)) {
          return db.collection("chats").doc("global_class_chat").update({
            members: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
          });
        }
      }
    })
    .catch(() => {});

  setupChangePasswordForm();
  setupLogout();
  setupNewChatModal();
  listenToChats();
  loadAllUsers();

  const welcomeTitle = document.getElementById("welcome-user-title");
  if (welcomeTitle) {
    welcomeTitle.textContent = "Welcome, " + (currentUser.displayName || currentUser.email);
  }

  const searchInput = document.getElementById("chat-search");
  if (searchInput) {
    searchInput.addEventListener("input", filterChats);
  }

  const messageForm = document.getElementById("message-form");
  if (messageForm) {
    messageForm.addEventListener("submit", handleSendMessage);
  }
}

function setupUserAvatar() {
  const avatar = document.getElementById("user-avatar");
  if (avatar) {
    const name = currentUser.displayName || currentUser.email || "?";
    avatar.textContent = name.charAt(0).toUpperCase();
  }
}

function setupLogout() {
  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      if (activeChatListener) activeChatListener();
      if (chatsListener) chatsListener();
      auth.signOut();
    });
  }
}

function showChangePasswordModal() {
  const modal = document.getElementById("change-password-modal");
  if (modal) {
    modal.classList.add("active");
  }
}

function setupChangePasswordForm() {
  const form = document.getElementById("change-password-form");
  if (!form) return;

  form.addEventListener("submit", e => {
    e.preventDefault();
    const newPassword = document.getElementById("new-password").value;
    const confirmPassword = document.getElementById("confirm-password").value;
    const errorMsg = document.getElementById("password-error-message");

    if (newPassword !== confirmPassword) {
      errorMsg.textContent = "Passwords do not match.";
      return;
    }

    if (newPassword.length < 6) {
      errorMsg.textContent = "Password must be at least 6 characters.";
      return;
    }

    errorMsg.textContent = "";

    auth.currentUser.updatePassword(newPassword)
      .then(() => {
        return db.collection("users").doc(currentUser.uid).update({
          mustChangePassword: false
        });
      })
      .then(() => {
        const modal = document.getElementById("change-password-modal");
        if (modal) {
          modal.classList.remove("active");
        }
        showToast("Password updated successfully!");
      })
      .catch(err => {
        errorMsg.textContent = err.message;
      });
  });
}

function listenToChats() {
  if (chatsListener) chatsListener();

  chatsListener = db.collection("chats")
    .where("members", "array-contains", currentUser.uid)
    .onSnapshot(snapshot => {
      const chatList = document.getElementById("chat-list-container");
      if (!chatList) return;

      const activeChatIdBefore = currentChatId;
      chatList.innerHTML = "";

      const chats = [];
      snapshot.forEach(doc => {
        chats.push(doc.data());
      });

      chats.sort((a, b) => {
        const timeA = a.lastMessageTime ? a.lastMessageTime.toMillis() : 0;
        const timeB = b.lastMessageTime ? b.lastMessageTime.toMillis() : 0;
        return timeB - timeA;
      });

      chats.forEach(chat => {
        const item = document.createElement("div");
        item.className = "chat-item";
        if (chat.chatId === currentChatId) {
          item.classList.add("active");
        }
        item.dataset.id = chat.chatId;

        const avatar = document.createElement("div");
        avatar.className = "chat-item-avatar";

        const info = document.createElement("div");
        info.className = "chat-item-info";

        const nameRow = document.createElement("div");
        nameRow.className = "chat-item-name-row";

        const nameSpan = document.createElement("span");
        nameSpan.className = "chat-item-name";

        const timeSpan = document.createElement("span");
        timeSpan.className = "chat-item-time";

        const msgRow = document.createElement("div");
        msgRow.className = "chat-item-message-row";

        const msgSpan = document.createElement("span");
        msgSpan.className = "chat-item-message";

        if (chat.isGlobal) {
          nameSpan.textContent = chat.name;
          avatar.textContent = "G";
          avatar.style.background = "linear-gradient(135deg, #f59e0b, #d97706)";
        } else if (chat.isGroup) {
          nameSpan.textContent = chat.name;
          avatar.textContent = chat.name.charAt(0).toUpperCase();
          avatar.style.background = "linear-gradient(135deg, #10b981, #059669)";
        } else {
          const otherUid = chat.members.find(m => m !== currentUser.uid);
          const otherUser = allUsers.find(u => u.uid === otherUid);
          const displayName = otherUser ? otherUser.name : "Classmate";
          nameSpan.textContent = displayName;
          avatar.textContent = displayName.charAt(0).toUpperCase();
        }

        if (chat.lastMessageTime) {
          const date = chat.lastMessageTime.toDate();
          timeSpan.textContent = date.getHours().toString().padStart(2, "0") + ":" + date.getMinutes().toString().padStart(2, "0");
        } else {
          timeSpan.textContent = "";
        }

        msgSpan.textContent = chat.lastMessage || "No messages yet";

        nameRow.appendChild(nameSpan);
        nameRow.appendChild(timeSpan);
        msgRow.appendChild(msgSpan);
        info.appendChild(nameRow);
        info.appendChild(msgRow);
        item.appendChild(avatar);
        item.appendChild(info);

        item.addEventListener("click", () => {
          selectChat(chat.chatId);
        });

        chatList.appendChild(item);
      });

      if (currentChatId && !chats.some(c => c.chatId === currentChatId)) {
        currentChatId = null;
        document.getElementById("chat-main-area").classList.add("hidden");
        document.getElementById("welcome-screen").classList.remove("hidden");
      }
    }, () => {});
}

function filterChats() {
  const query = document.getElementById("chat-search").value.toLowerCase();
  const items = document.querySelectorAll(".chat-item");
  items.forEach(item => {
    const name = item.querySelector(".chat-item-name").textContent.toLowerCase();
    if (name.includes(query)) {
      item.style.display = "flex";
    } else {
      item.style.display = "none";
    }
  });
}

function selectChat(chatId) {
  if (activeChatListener) activeChatListener();

  currentChatId = chatId;

  const items = document.querySelectorAll(".chat-item");
  items.forEach(item => {
    if (item.dataset.id === chatId) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  });

  document.getElementById("welcome-screen").classList.add("hidden");
  document.getElementById("chat-main-area").classList.remove("hidden");

  db.collection("chats").doc(chatId).get().then(doc => {
    if (doc.exists) {
      const chat = doc.data();
      const title = document.getElementById("active-chat-title");
      const membersText = document.getElementById("active-chat-members");
      const avatar = document.getElementById("active-chat-avatar");

      if (chat.isGlobal) {
        title.textContent = chat.name;
        membersText.textContent = "Everyone in CS13";
        avatar.textContent = "G";
        avatar.style.background = "linear-gradient(135deg, #f59e0b, #d97706)";
      } else if (chat.isGroup) {
        title.textContent = chat.name;
        avatar.textContent = chat.name.charAt(0).toUpperCase();
        avatar.style.background = "linear-gradient(135deg, #10b981, #059669)";
        resolveMemberNames(chat.members, names => {
          membersText.textContent = names.join(", ");
        });
      } else {
        const otherUid = chat.members.find(m => m !== currentUser.uid);
        const otherUser = allUsers.find(u => u.uid === otherUid);
        const displayName = otherUser ? otherUser.name : "Classmate";
        title.textContent = displayName;
        avatar.textContent = displayName.charAt(0).toUpperCase();
        avatar.style.background = "linear-gradient(135deg, #a855f7 0%, #3b82f6 100%)";
        membersText.textContent = "Direct Message";
      }
    }
  });

  const messageList = document.getElementById("message-list");
  messageList.innerHTML = "";

  activeChatListener = db.collection("chats").doc(chatId).collection("messages")
    .orderBy("timestamp", "asc")
    .onSnapshot(snapshot => {
      messageList.innerHTML = "";
      snapshot.forEach(doc => {
        const message = doc.data();
        const msgId = doc.id;
        const isMine = message.senderId === currentUser.uid;

        const group = document.createElement("div");
        group.className = "message-group " + (isMine ? "mine" : "other");

        if (!isMine) {
          const sender = document.createElement("div");
          sender.className = "message-sender";
          sender.textContent = message.senderName;
          group.appendChild(sender);
        }

        const bubbleWrapper = document.createElement("div");
        bubbleWrapper.className = "message-bubble-wrapper";

        const bubble = document.createElement("div");
        bubble.className = "message-bubble";
        bubble.textContent = message.content;

        bubble.addEventListener("dblclick", () => {
          toggleLikeMessage(chatId, msgId, message.likes || []);
        });

        bubbleWrapper.appendChild(bubble);

        if (message.likes && message.likes.length > 0) {
          const badge = document.createElement("div");
          badge.className = "like-badge";
          
          const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
          svg.setAttribute("class", "like-icon-svg");
          svg.setAttribute("viewBox", "0 0 24 24");
          
          const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
          path.setAttribute("d", "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z");
          
          svg.appendChild(path);
          badge.appendChild(svg);

          const count = document.createElement("span");
          count.className = "like-count";
          count.textContent = message.likes.length;
          badge.appendChild(count);

          badge.addEventListener("click", e => {
            e.stopPropagation();
            toggleLikeMessage(chatId, msgId, message.likes || []);
          });

          bubbleWrapper.appendChild(badge);
        }

        const time = document.createElement("div");
        time.className = "message-time";
        if (message.timestamp) {
          const date = message.timestamp.toDate();
          time.textContent = date.getHours().toString().padStart(2, "0") + ":" + date.getMinutes().toString().padStart(2, "0");
        } else {
          time.textContent = "";
        }

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
  members.forEach(uid => {
    db.collection("users").doc(uid).get().then(doc => {
      if (doc.exists) {
        names.push(doc.data().name);
      } else {
        names.push("Classmate");
      }
      resolvedCount++;
      if (resolvedCount === members.length) {
        callback(names);
      }
    }).catch(() => {
      names.push("Classmate");
      resolvedCount++;
      if (resolvedCount === members.length) {
        callback(names);
      }
    });
  });
}

function toggleLikeMessage(chatId, messageId, currentLikes) {
  const ref = db.collection("chats").doc(chatId).collection("messages").doc(messageId);
  if (currentLikes.includes(currentUser.uid)) {
    ref.update({
      likes: firebase.firestore.FieldValue.arrayRemove(currentUser.uid)
    });
  } else {
    ref.update({
      likes: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
    });
  }
}

function handleSendMessage(e) {
  e.preventDefault();
  if (!currentChatId) return;

  const input = document.getElementById("message-input");
  const content = input.value.trim();
  if (!content) return;

  input.value = "";

  const senderName = currentUser.displayName || currentUser.email || "Anonymous";

  db.collection("chats").doc(currentChatId).collection("messages").add({
    content: content,
    senderId: currentUser.uid,
    senderName: senderName,
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    likes: []
  }).then(() => {
    return db.collection("chats").doc(currentChatId).update({
      lastMessage: content,
      lastMessageTime: firebase.firestore.FieldValue.serverTimestamp()
    });
  }).catch(() => {});
}

function loadAllUsers() {
  db.collection("users").get().then(snapshot => {
    allUsers = [];
    snapshot.forEach(doc => {
      allUsers.push(doc.data());
    });
    renderStudentList();
  });
}

function renderStudentList() {
  const container = document.getElementById("student-list");
  if (!container) return;

  container.innerHTML = "";
  selectedStudents = [];

  const others = allUsers.filter(u => u.uid !== currentUser.uid);

  others.forEach(user => {
    const item = document.createElement("div");
    item.className = "student-select-item";
    item.dataset.uid = user.uid;

    const checkbox = document.createElement("div");
    checkbox.className = "checkbox-custom";

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "checkbox-icon");
    svg.setAttribute("viewBox", "0 0 24 24");
    
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z");
    
    svg.appendChild(path);
    checkbox.appendChild(svg);

    const name = document.createElement("span");
    name.className = "student-select-name";
    name.textContent = user.name;

    item.appendChild(checkbox);
    item.appendChild(name);

    item.addEventListener("click", () => {
      if (selectedStudents.includes(user.uid)) {
        selectedStudents = selectedStudents.filter(id => id !== user.uid);
        item.classList.remove("selected");
      } else {
        selectedStudents.push(user.uid);
        item.classList.add("selected");
      }

      const groupNameField = document.getElementById("group-name-field");
      if (selectedStudents.length > 1) {
        groupNameField.style.display = "block";
      } else {
        groupNameField.style.display = "none";
      }
    });

    container.appendChild(item);
  });
}

function setupNewChatModal() {
  const modal = document.getElementById("new-chat-modal");
  const trigger = document.getElementById("new-chat-trigger");
  const closeBtn = document.getElementById("new-chat-close");
  const cancelBtn = document.getElementById("new-chat-cancel-btn");
  const submitBtn = document.getElementById("create-chat-submit-btn");

  if (!modal || !trigger) return;

  trigger.addEventListener("click", () => {
    renderStudentList();
    document.getElementById("group-chat-name").value = "";
    document.getElementById("group-name-field").style.display = "none";
    modal.classList.add("active");
  });

  const closeModal = () => {
    modal.classList.remove("active");
  };

  closeBtn.addEventListener("click", closeModal);
  cancelBtn.addEventListener("click", closeModal);

  submitBtn.addEventListener("click", () => {
    if (selectedStudents.length === 0) {
      showToast("Please select at least one classmate.");
      return;
    }

    const members = [...selectedStudents, currentUser.uid];

    if (selectedStudents.length === 1) {
      const otherUid = selectedStudents[0];
      db.collection("chats")
        .where("isGroup", "==", false)
        .where("members", "array-contains", currentUser.uid)
        .get()
        .then(snapshot => {
          let existingChat = null;
          snapshot.forEach(doc => {
            const chat = doc.data();
            if (chat.members.includes(otherUid)) {
              existingChat = chat;
            }
          });

          if (existingChat) {
            selectChat(existingChat.chatId);
            closeModal();
          } else {
            createNewChat("", false, members);
          }
        });
    } else {
      const groupName = document.getElementById("group-chat-name").value.trim();
      if (!groupName) {
        showToast("Please enter a group name.");
        return;
      }
      createNewChat(groupName, true, members);
    }
  });
}

function createNewChat(name, isGroup, members) {
  const modal = document.getElementById("new-chat-modal");
  const newChatRef = db.collection("chats").doc();
  const chatId = newChatRef.id;

  newChatRef.set({
    chatId: chatId,
    name: name,
    isGroup: isGroup,
    isGlobal: false,
    members: members,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    lastMessage: "",
    lastMessageTime: firebase.firestore.FieldValue.serverTimestamp()
  }).then(() => {
    selectChat(chatId);
    if (modal) modal.classList.remove("active");
  }).catch(() => {
    showToast("Failed to create chat.");
  });
}
