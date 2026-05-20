import { db } from '../core/firebase-init.js';
import {
  showToast,
  getQuoteText,
  createEmptyState,
} from '../core/utils.js';

let quotes = [];
let quotesListener = null;

export function setQuotes(nextQuotes) {
  quotes = nextQuotes
    .map((item) => (typeof item === 'string' ? { text: item } : item))
    .filter((item) => item.text);
  showRandomQuote();
  renderQuoteWall();
}

export function listenToQuotes() {
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
      (error) => {
        console.error(error);
      },
    );
}

export function showRandomQuote() {
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

export function renderQuoteWall() {
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

export function addQuote(text, input, currentUser, getDisplayName) {
  const normalized = text.trim();
  if (!normalized) return;

  db.collection('quotes')
    .add({
      text: normalized,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdByName: currentUser ? getDisplayName(currentUser) : 'anonymous',
    })
    .then(() => {
      if (input) input.value = '';
      showToast('幹話新增成功😎');
    })
    .catch(() => {
      showToast('幹話新增失敗:(');
    });
}

export function setupQuoteForms(currentUser, getDisplayName) {
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
      addQuote(input.value, input, currentUser, getDisplayName);
    });
  });

  const nextBtn = document.getElementById('next-quote-btn');
  if (nextBtn && !nextBtn.dataset.bound) {
    nextBtn.dataset.bound = 'true';
    nextBtn.addEventListener('click', showRandomQuote);
  }

  const welcomeDisplay = document.getElementById('welcome-quote-display');
  if (welcomeDisplay && !welcomeDisplay.dataset.bound) {
    welcomeDisplay.dataset.bound = 'true';
    welcomeDisplay.style.cursor = 'pointer';
    welcomeDisplay.title = '點擊隨機更換';
    welcomeDisplay.addEventListener('click', showRandomQuote);
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
