import { auth, db } from './firebase-init.js';
import { compressImageFile, showToast } from './utils.js';

const AUTH_EMAIL_DOMAIN = '@cs13.class';
const RESERVED_DEFAULT_USERNAMES = new Set([
  '1301',
  '1302',
  '1303',
  '1304',
  '1305',
  '1306',
  '1307',
  '1308',
  '1309',
  '1310',
  '1311',
  '1312',
  '1314',
  '1315',
  '1321',
  '1322',
  '1323',
  '1324',
  '1325',
  '1326',
  '1327',
  '1328',
  '1329',
  '1330',
  '1331',
  '1332',
  '1333',
  '1334',
  '1335',
]);
const LEGACY_AUTH_USERNAMES = Array.from(RESERVED_DEFAULT_USERNAMES);

export function setupLoginForm() {
  const loginForm = document.getElementById('login-form');
  if (!loginForm || loginForm.dataset.bound) return;

  loginForm.dataset.bound = 'true';
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const errorMsg = document.getElementById('error-message');
    const submitBtn = document.getElementById('submit-btn');

    submitBtn.disabled = true;
    errorMsg.textContent = '';

    resolveLoginEmail(username)
      .then((email) => signInWithResolvedEmail(username, email, password))
      .then(() => {
        location.href = '/static/app.html';
      })
      .catch((err) => {
        submitBtn.disabled = false;
        errorMsg.textContent = err.message;
      });
  });
}

function resolveLoginEmail(username) {
  const fallbackEmail = buildAuthEmail(username);
  const localEmail = getLocalLoginEmail(username);

  if (localEmail) {
    return Promise.resolve(localEmail);
  }

  return db
    .collection('users')
    .where('username', '==', username)
    .get()
    .then((snapshot) => {
      let loginEmail = fallbackEmail;
      let foundUser = false;
      snapshot.forEach((doc) => {
        const data = doc.data();
        foundUser = true;
        loginEmail = data.authEmail || fallbackEmail;
      });

      if (!foundUser) {
        return fallbackEmail;
      }

      return loginEmail;
    })
    .catch(() => fallbackEmail);
}

function signInWithResolvedEmail(username, email, password) {
  return auth
    .signInWithEmailAndPassword(email, password)
    .then((credential) => {
      const user = credential.user || auth.currentUser;
      if (isDefaultUsername(username)) {
        return finalizeSuccessfulLogin(username, user);
      }

      return verifySignedInUsername(username, user).then((verifiedUser) =>
        finalizeSuccessfulLogin(username, verifiedUser),
      );
    })
    .catch((err) => {
      if (
        isDefaultUsername(username) ||
        !isInvalidCredentialError(err) ||
        email !== buildAuthEmail(username)
      ) {
        throw err;
      }

      return signInWithLegacyAuthEmail(username, password, err);
    });
}

function signInWithLegacyAuthEmail(username, password, originalError) {
  let chain = Promise.reject(originalError);

  LEGACY_AUTH_USERNAMES.forEach((legacyUsername) => {
    chain = chain.catch(() =>
      tryLegacyAuthEmail(username, legacyUsername, password),
    );
  });

  return chain.catch(() => {
    throw originalError;
  });
}

function tryLegacyAuthEmail(username, legacyUsername, password) {
  const legacyEmail = buildAuthEmail(legacyUsername);

  return auth
    .signInWithEmailAndPassword(legacyEmail, password)
    .then((credential) => verifySignedInUsername(username, credential.user))
    .then((user) => finalizeSuccessfulLogin(username, user));
}

function verifySignedInUsername(username, user) {
  if (!user) {
    return Promise.reject(new Error('登入失敗，請再試一次'));
  }

  return db
    .collection('users')
    .doc(user.uid)
    .get()
    .then(
      (doc) => {
        const data = doc.exists ? doc.data() : {};
        if (data.username === username) {
          return user;
        }

        return rejectAfterSignOut(new Error('帳號或密碼錯誤'));
      },
      (err) => rejectAfterSignOut(err),
    );
}

function rejectAfterSignOut(err) {
  return auth
    .signOut()
    .catch(() => {})
    .then(() => {
      throw err;
    });
}

function finalizeSuccessfulLogin(username, user) {
  if (user?.email) {
    setLocalLoginEmail(username, user.email);
  }

  if (!isDefaultUsername(username)) {
    return syncAuthEmailToUsername(user, username).then(() => user);
  }

  return Promise.resolve(user);
}

function syncAuthEmailToUsername(user, username, options = {}) {
  if (!user || !username) return Promise.resolve();

  const nextEmail = buildAuthEmail(username);
  if (user.email === nextEmail) {
    return ensureAuthEmailMapping(user).then(() => {});
  }

  return user
    .updateEmail(nextEmail)
    .then(() => db.collection('users').doc(user.uid).set(
      { authEmail: nextEmail },
      { merge: true },
    ))
    .then(() => {
      setLocalLoginEmail(username, nextEmail);
    })
    .catch((err) => {
      if (options.required) {
        throw err;
      }
    });
}

function buildAuthEmail(username) {
  return username + AUTH_EMAIL_DOMAIN;
}

function isDefaultUsername(username) {
  return RESERVED_DEFAULT_USERNAMES.has(username);
}

function isInvalidCredentialError(err) {
  return [
    'auth/invalid-credential',
    'auth/wrong-password',
    'auth/user-not-found',
  ].includes(err?.code);
}

function getLocalLoginEmail(username) {
  try {
    return localStorage.getItem('cs13-login-email:' + username);
  } catch {
    return '';
  }
}

function setLocalLoginEmail(username, email) {
  if (!username || !email) return;

  try {
    localStorage.setItem('cs13-login-email:' + username, email);
  } catch {}
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

export function setupProfileSettings(currentUser, onProfileUpdated) {
  ensureAuthEmailMapping(currentUser);
  setupAvatarForm(currentUser, onProfileUpdated);
  setupAccountForm(currentUser);
  setupProfilePasswordForm(currentUser);
  loadProfileSettings(currentUser, onProfileUpdated);
}

function ensureAuthEmailMapping(currentUser) {
  if (!currentUser?.email) return Promise.resolve();

  return db.collection('users')
    .doc(currentUser.uid)
    .set({ authEmail: currentUser.email }, { merge: true })
    .catch(() => {});
}

function loadProfileSettings(currentUser, onProfileUpdated) {
  db.collection('users')
    .doc(currentUser.uid)
    .get()
    .then((doc) => {
      const data = doc.exists ? doc.data() : {};
      const usernameInput = document.getElementById('account-username');
      const avatarDataUrl = data.avatarDataUrl || '';
      const profileUsername =
        data.username || currentUser.email?.split('@')[0] || '';

      if (usernameInput) {
        usernameInput.value = profileUsername;
        usernameInput.dataset.currentUsername = usernameInput.value;
        setLocalLoginEmail(usernameInput.value, currentUser.email);
      }

      if (profileUsername && !isDefaultUsername(profileUsername)) {
        syncAuthEmailToUsername(currentUser, profileUsername);
      }

      updateAvatarPreview(avatarDataUrl, currentUser);
      if (onProfileUpdated) onProfileUpdated(avatarDataUrl);
    })
    .catch(() => {});
}

function setupAvatarForm(currentUser, onProfileUpdated) {
  const form = document.getElementById('avatar-form');
  const fileInput = document.getElementById('avatar-file');
  const status = document.getElementById('avatar-upload-status');
  const errorMsg = document.getElementById('avatar-error-message');

  if (!form || !fileInput || form.dataset.bound) return;
  form.dataset.bound = 'true';

  let selectedAvatarDataUrl = '';

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    selectedAvatarDataUrl = '';
    if (errorMsg) errorMsg.textContent = '';

    if (!file) {
      if (status) status.textContent = '選擇新頭貼';
      updateAvatarPreview('', currentUser);
      return;
    }

    if (status) status.textContent = file.name;

    compressImageFile(file)
      .then((dataUrl) => {
        selectedAvatarDataUrl = dataUrl;
        updateAvatarPreview(dataUrl, currentUser);
      })
      .catch((err) => {
        if (errorMsg) errorMsg.textContent = err.message;
      });
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    if (!selectedAvatarDataUrl) {
      if (errorMsg) errorMsg.textContent = '請先選擇一張圖片';
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    if (errorMsg) errorMsg.textContent = '';

    db.collection('users')
      .doc(currentUser.uid)
      .set({ avatarDataUrl: selectedAvatarDataUrl }, { merge: true })
      .then(() => {
        if (onProfileUpdated) onProfileUpdated(selectedAvatarDataUrl);
        showToast('頭貼已更新！');
      })
      .catch((err) => {
        if (errorMsg) errorMsg.textContent = err.message;
      })
      .finally(() => {
        if (submitBtn) submitBtn.disabled = false;
      });
  });
}

function setupAccountForm(currentUser) {
  const form = document.getElementById('account-form');
  if (!form || form.dataset.bound) return;
  form.dataset.bound = 'true';

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const usernameInput = document.getElementById('account-username');
    const errorMsg = document.getElementById('account-error-message');
    const submitBtn = form.querySelector('button[type="submit"]');
    const nextUsername = usernameInput.value.trim();
    const currentUsername =
      usernameInput.dataset.currentUsername ||
      currentUser.email?.split('@')[0] ||
      '';

    if (errorMsg) errorMsg.textContent = '';

    if (!nextUsername) {
      if (errorMsg) errorMsg.textContent = '帳號不能空白';
      return;
    }

    if (nextUsername === currentUsername) {
      showToast('帳號沒有變更');
      return;
    }

    if (RESERVED_DEFAULT_USERNAMES.has(nextUsername)) {
      if (errorMsg) {
        errorMsg.textContent = '不能改成預設座號帳號，請換一個帳號';
      }
      return;
    }

    if (submitBtn) submitBtn.disabled = true;

    db.collection('users')
      .where('username', '==', nextUsername)
      .get()
      .then((snapshot) => {
        let isTaken = false;
        snapshot.forEach((doc) => {
          if (doc.id !== currentUser.uid) isTaken = true;
        });

        if (isTaken) {
          throw new Error('這個帳號已經有人使用:(');
        }

        return syncAuthEmailToUsername(currentUser, nextUsername, {
          required: true,
        });
      })
      .then(() => {
        return db.collection('users').doc(currentUser.uid).set(
          {
            username: nextUsername,
            authEmail: buildAuthEmail(nextUsername),
          },
          { merge: true },
        );
      })
      .then(() => {
        usernameInput.dataset.currentUsername = nextUsername;
        setLocalLoginEmail(nextUsername, buildAuthEmail(nextUsername));
        showToast('帳號已更新！');
      })
      .catch((err) => {
        if (errorMsg) errorMsg.textContent = err.message;
      })
      .finally(() => {
        if (submitBtn) submitBtn.disabled = false;
      });
  });
}

function setupProfilePasswordForm(currentUser) {
  const form = document.getElementById('profile-password-form');
  if (!form || form.dataset.bound) return;
  form.dataset.bound = 'true';

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const newPassword = document.getElementById('profile-new-password').value;
    const confirmPassword = document.getElementById(
      'profile-confirm-password',
    ).value;
    const errorMsg = document.getElementById('profile-password-error-message');
    const submitBtn = form.querySelector('button[type="submit"]');

    if (newPassword !== confirmPassword) {
      errorMsg.textContent = '密碼不相符:(';
      return;
    }

    if (newPassword.length < 6) {
      errorMsg.textContent = '密碼長度必須至少為 6 個字元🙃';
      return;
    }

    if (submitBtn) submitBtn.disabled = true;
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
        form.reset();
        showToast('密碼已成功更新！');
      })
      .catch((err) => {
        errorMsg.textContent = err.message;
      })
      .finally(() => {
        if (submitBtn) submitBtn.disabled = false;
      });
  });
}

function updateAvatarPreview(avatarDataUrl, currentUser) {
  const preview = document.getElementById('settings-avatar-preview');
  if (!preview) return;

  preview.textContent = '';
  preview.style.backgroundImage = '';

  if (avatarDataUrl) {
    preview.style.backgroundImage = `url("${avatarDataUrl}")`;
  } else {
    preview.textContent =
      currentUser.displayName?.charAt(0).toUpperCase() ||
      currentUser.email?.charAt(0).toUpperCase() ||
      '-';
  }
}
