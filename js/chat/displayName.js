// js/chat/displayName.js
// First-message modal — when composer tries to send but users.display_name
// is NULL, messages.js dispatches 'chat:need-display-name' and we prompt.

import { supabase } from './auth.js';

const modal = document.getElementById('display-name-modal');
const input = document.getElementById('display-name-input');
const saveBtn = document.getElementById('display-name-save');
const cancelBtn = document.getElementById('display-name-cancel');
const errEl = document.getElementById('display-name-error');

if (!modal || !input) {
  console.debug('displayName: modal not in DOM (flag off)');
} else {
  function open() {
    modal.dataset.state = 'open';
    setTimeout(() => input.focus(), 60);
  }
  function close() {
    modal.dataset.state = '';
    errEl.hidden = true;
    input.value = '';
  }

  window.addEventListener('chat:need-display-name', open);

  cancelBtn.addEventListener('click', close);
  modal.querySelector('.backdrop').addEventListener('click', close);

  saveBtn.addEventListener('click', async () => {
    const name = input.value.trim();
    if (name.length < 2) {
      errEl.textContent = 'الاسم قصير جداً (٢ حروف على الأقل).';
      errEl.hidden = false;
      return;
    }
    if (name.length > 30) {
      errEl.textContent = 'الاسم طويل (٣٠ حرف كحد أقصى).';
      errEl.hidden = false;
      return;
    }

    const profile = window.__chatProfile;
    if (!profile) {
      errEl.textContent = 'لم يكتمل تسجيل الدخول — أعد تحميل الصفحة.';
      errEl.hidden = false;
      return;
    }
    saveBtn.disabled = true;
    try {
      const { error } = await supabase.from('users')
        .update({ display_name: name })
        .eq('uid', profile.uid);
      if (error) throw error;
      profile.displayName = name;
      close();
      // Retry-send the message they were composing.
      document.getElementById('composer-send')?.click();
    } catch (err) {
      errEl.textContent = 'خطأ: ' + (err.code || err.message);
      errEl.hidden = false;
    } finally {
      saveBtn.disabled = false;
    }
  });
}
