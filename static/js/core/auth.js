import { auth, db } from './firebase-init.js';
import { showToast } from './utils.js';

export function setupLoginForm() {
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

export function setupLogout(cleanup) {
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn && !logoutBtn.dataset.bound) {
    logoutBtn.dataset.bound = 'true';
    logoutBtn.addEventListener('click', () => {
      if (cleanup) cleanup();
      auth.signOut();
    });
  }
}

export function showChangePasswordModal() {
  const modal = document.getElementById('change-password-modal');
  if (modal) {
    modal.classList.add('active');
  }
}

export function setupChangePasswordForm(currentUser) {
  const form = document.getElementById('change-password-form');
  if (!form || form.dataset.bound) return;
  form.dataset.bound = 'true';

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    const errorMsg = document.getElementById('password-error-message');

    if (newPassword !== confirmPassword) {
      errorMsg.textContent = '密碼不相符:(';
      return;
    }

    if (newPassword.length < 6) {
      errorMsg.textContent = '密碼長度必須至少為 6 個字元🙃';
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
        showToast('密碼已成功更新！');
      })
      .catch((err) => {
        errorMsg.textContent = err.message;
      });
  });
}
