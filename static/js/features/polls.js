import { db } from '../core/firebase-init.js';
import { clearCachedQuery, getCachedQuery } from '../core/firestore-cache.js';
import { showToast, createEmptyState } from '../core/utils.js';

let pollsListener = null;
let pollActionUser = null;
let editingPollId = '';
const POLL_FORM_COLLAPSED_KEY = 'cs13:poll-form-collapsed';

export function listenToPolls(updateCount, currentUser) {
  if (pollsListener) return;

  pollsListener = db
    .collection('polls')
    .orderBy('createdAt', 'desc')
    .limit(30)
    .onSnapshot(
      (snapshot) => {
        const polls = [];
        snapshot.forEach((doc) => polls.push({ id: doc.id, ...doc.data() }));
        renderPolls(polls, currentUser);
        if (updateCount) {
          updateCount(
            'poll-count',
            polls.filter((poll) => !poll.closed).length,
          );
        }
      },
      () => {
        renderPolls([], currentUser);
      },
    );
}

export function setupPollForm(currentUser, getDisplayName) {
  const form = document.getElementById('poll-form');
  if (!form || form.dataset.bound) return;
  form.dataset.bound = 'true';
  pollActionUser = currentUser;
  setupPollFormToggle();
  setupPollMenuClose();
  setupPollEditModal(currentUser);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!currentUser) {
      showToast('先登入才能建立投票😀');
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
      showToast('輸入問題，並至少提供兩個選項😀');
      return;
    }

    db.collection('polls')
      .add({
        question,
        options,
        allowMultiple,
        createdBy: currentUser.uid,
        createdByName: getDisplayName(currentUser),
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

export function renderPolls(polls, currentUser) {
  const containers = [
    document.getElementById('public-poll-list'),
    document.getElementById('app-poll-list'),
  ].filter(Boolean);

  containers.forEach((container) => {
    container.innerHTML = '';
    if (polls.length === 0) {
      container.appendChild(createEmptyState('還沒有投票...'));
      return;
    }

    polls.forEach((poll) => {
      const card = createPollCard(poll, currentUser);
      container.appendChild(card);
      hydratePollVotes(poll, card, currentUser);
    });
  });
}

export function createPollCard(poll, currentUser) {
  const card = document.createElement('article');
  card.className = 'poll-card';
  card.dataset.pollId = poll.id;

  if (canManagePoll(poll)) {
    const actionWrap = document.createElement('div');
    actionWrap.className = 'poll-action-wrap';
    const menuButton = createPollMenuButton();
    const menu = createPollActionMenu(poll);
    actionWrap.appendChild(menuButton);
    actionWrap.appendChild(menu);
    card.appendChild(actionWrap);

    menuButton.addEventListener('click', (e) => {
      e.stopPropagation();
      closePollMenus(menu);
      const isOpen = menu.classList.toggle('active');
      menuButton.setAttribute('aria-expanded', String(isOpen));
    });
  }

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
    submitVote(poll, form, currentUser);
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

export function hydratePollVotes(poll, card, currentUser) {
  getCachedQuery(
    db.collection('polls').doc(poll.id).collection('votes'),
    `poll-votes:${poll.id}`,
    { ttlMs: 15 * 1000 },
  )
    .then((votes) => {
      const counts = new Array((poll.options || []).length).fill(0);
      let total = 0;
      let myChoices = [];

      votes.forEach((vote) => {
        const choices = Array.isArray(vote.choices) ? vote.choices : [];
        if (vote.id === currentUser?.uid) {
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

export function submitVote(poll, form, currentUser) {
  if (!currentUser) {
    showToast('先登入才能投票😀');
    return;
  }

  const choices = Array.from(form.querySelectorAll('input:checked')).map(
    (input) => Number(input.value),
  );

  if (choices.length === 0) {
    showToast('至少選一個選項😀');
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
      clearCachedQuery(`poll-votes:${poll.id}`);
      showToast('投票已送出！');
      const card = form.closest('.poll-card');
      if (card) hydratePollVotes(poll, card, currentUser);
    })
    .catch(() => {
      showToast('投票失敗:(');
    });
}

function setupPollFormToggle() {
  const shell = document.getElementById('poll-form-shell');
  const toggle = document.getElementById('poll-form-toggle');
  if (!shell || !toggle || toggle.dataset.bound) return;
  toggle.dataset.bound = 'true';

  const setCollapsed = (isCollapsed) => {
    shell.classList.toggle('poll-form-collapsed', isCollapsed);
    toggle.setAttribute('aria-expanded', String(!isCollapsed));
    toggle.textContent = isCollapsed ? '展開建立區' : '收起建立區';
    localStorage.setItem(POLL_FORM_COLLAPSED_KEY, isCollapsed ? 'true' : 'false');
  };

  setCollapsed(localStorage.getItem(POLL_FORM_COLLAPSED_KEY) === 'true');

  toggle.addEventListener('click', () => {
    setCollapsed(!shell.classList.contains('poll-form-collapsed'));
  });
}

function canManagePoll(poll, currentUser = pollActionUser) {
  return Boolean(currentUser && poll.createdBy === currentUser.uid);
}

function setupPollMenuClose() {
  if (document.body.dataset.pollMenuCloseBound) return;
  document.body.dataset.pollMenuCloseBound = 'true';
  document.addEventListener('click', () => closePollMenus());
}

function createPollMenuButton() {
  const button = document.createElement('button');
  button.className = 'message-menu-button album-menu-button poll-menu-button';
  button.type = 'button';
  button.title = '更多';
  button.setAttribute('aria-label', '更多投票操作');
  button.setAttribute('aria-expanded', 'false');
  button.innerHTML =
    '<svg fill="currentColor" height="16" viewBox="0 0 24 24" width="16" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="6" r="1.5"/><circle cx="12" cy="18" r="1.5"/></svg>';
  return button;
}

function createPollActionMenu(poll) {
  const menu = document.createElement('div');
  menu.className = 'message-action-menu album-action-menu poll-action-menu';

  const actions = [
    {
      label: '編輯投票',
      icon:
        '<svg fill="currentColor" height="18" viewBox="0 0 24 24" width="18" xmlns="http://www.w3.org/2000/svg"><path d="M4 21h4.25L19.81 9.44l-4.25-4.25L4 16.75V21Zm2-3.42 9.56-9.56 1.42 1.42L7.42 19H6v-1.42ZM17 3.75l1.25-1.25a1.77 1.77 0 0 1 2.5 0l.75.75a1.77 1.77 0 0 1 0 2.5L20.25 7 17 3.75Z"/></svg>',
      handler: () => openEditPollModal(poll),
    },
    {
      label: '刪除投票',
      danger: true,
      icon:
        '<svg fill="currentColor" height="18" viewBox="0 0 24 24" width="18" xmlns="http://www.w3.org/2000/svg"><path d="M9 3h6l1 2h5v2H3V5h5l1-2Zm-3 6h12l-.8 11.2A2 2 0 0 1 15.2 22H8.8a2 2 0 0 1-2-1.8L6 9Zm4 2v8h2v-8h-2Zm4 0v8h2v-8h-2Z"/></svg>',
      handler: () => deletePoll(poll),
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
      closePollMenus();
      action.handler();
    });
    menu.appendChild(button);
  });

  return menu;
}

function closePollMenus(exceptMenu = null) {
  document.querySelectorAll('.poll-action-menu.active').forEach((menu) => {
    if (menu === exceptMenu) return;
    menu.classList.remove('active');
    const button = menu.parentElement.querySelector('.poll-menu-button');
    if (button) button.setAttribute('aria-expanded', 'false');
  });
}

function setupPollEditModal(currentUser) {
  const modal = document.getElementById('edit-poll-modal');
  const form = document.getElementById('edit-poll-form');
  const close = document.getElementById('edit-poll-close');
  const cancel = document.getElementById('edit-poll-cancel');

  if (!modal || !form || form.dataset.bound) return;
  form.dataset.bound = 'true';

  const closeModal = () => {
    modal.classList.remove('active');
    editingPollId = '';
    form.reset();
  };

  if (close) close.addEventListener('click', closeModal);
  if (cancel) cancel.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const questionInput = document.getElementById('edit-poll-question');
    const optionsInput = document.getElementById('edit-poll-options');
    const allowMultipleInput = document.getElementById('edit-poll-allow-multiple');
    const submit = form.querySelector("button[type='submit']");
    const question = questionInput.value.trim();
    const options = optionsInput.value
      .split(/\r?\n/)
      .map((option) => option.trim())
      .filter(Boolean);

    if (!question || options.length < 2) {
      showToast('輸入問題，並至少提供兩個選項😀');
      return;
    }

    submit.disabled = true;
    submit.textContent = '儲存中...';

    getManageablePoll(editingPollId, currentUser)
      .then((poll) => {
        const optionsChanged = JSON.stringify(poll.options || []) !== JSON.stringify(options);
        const allowMultipleChanged = Boolean(poll.allowMultiple) !== allowMultipleInput.checked;
        return db
          .collection('polls')
          .doc(editingPollId)
          .update({
            question,
            options,
            allowMultiple: allowMultipleInput.checked,
          })
          .then(() => {
            if (optionsChanged || allowMultipleChanged) {
              return deletePollVotes(editingPollId);
            }
            return null;
          });
      })
      .then(() => {
        clearCachedQuery(`poll-votes:${editingPollId}`);
        closeModal();
        showToast('投票已更新');
      })
      .catch(() => {
        showToast('投票更新失敗:(');
      })
      .finally(() => {
        submit.disabled = false;
        submit.textContent = '儲存變更';
      });
  });
}

function openEditPollModal(poll) {
  const modal = document.getElementById('edit-poll-modal');
  const questionInput = document.getElementById('edit-poll-question');
  const optionsInput = document.getElementById('edit-poll-options');
  const allowMultipleInput = document.getElementById('edit-poll-allow-multiple');

  if (!modal || !questionInput || !optionsInput || !allowMultipleInput) {
    showToast('請到投票管理頁編輯');
    return;
  }

  editingPollId = poll.id;
  questionInput.value = poll.question || '';
  optionsInput.value = (poll.options || []).join('\n');
  allowMultipleInput.checked = Boolean(poll.allowMultiple);
  modal.classList.add('active');
}

function deletePoll(poll) {
  if (!window.confirm('確定要刪除這個投票嗎？票數也會一起刪除。')) return;

  getManageablePoll(poll.id)
    .then(() => deletePollVotes(poll.id).catch(() => null))
    .then(() => db.collection('polls').doc(poll.id).delete())
    .then(() => {
      clearCachedQuery(`poll-votes:${poll.id}`);
      showToast('投票已刪除');
    })
    .catch(() => {
      showToast('投票刪除失敗:(');
    });
}

function getManageablePoll(pollId, currentUser = pollActionUser) {
  return db
    .collection('polls')
    .doc(pollId)
    .get()
    .then((doc) => {
      const poll = doc.exists ? { id: doc.id, ...doc.data() } : null;
      if (!poll || !canManagePoll(poll, currentUser)) {
        throw new Error('沒有權限操作這個投票');
      }
      return poll;
    });
}

function deletePollVotes(pollId) {
  return db
    .collection('polls')
    .doc(pollId)
    .collection('votes')
    .get()
    .then((snapshot) => {
      const deletes = [];
      snapshot.forEach((doc) => deletes.push(doc.ref.delete()));
      return Promise.all(deletes);
    });
}
