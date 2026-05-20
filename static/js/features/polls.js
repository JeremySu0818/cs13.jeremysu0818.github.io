import { db } from '../core/firebase-init.js';
import { clearCachedQuery, getCachedQuery } from '../core/firestore-cache.js';
import { showToast, createEmptyState } from '../core/utils.js';

let pollsListener = null;

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
      clearCachedQuery(`poll-votes:${poll.id}`);
      showToast('投票已送出！');
      const card = form.closest('.poll-card');
      if (card) hydratePollVotes(poll, card, currentUser);
    })
    .catch(() => {
      showToast('投票失敗:(');
    });
}
