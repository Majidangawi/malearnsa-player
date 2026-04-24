// js/chat-bootstrap.js
// Flag-gated entry point for the MA Learn chat feature.
// Nothing runs unless the URL has ?chat=beta. When the flag flips off
// in Task 33, the check is removed and chat becomes default-on.

const CHAT_FLAG = 'beta';

function chatEnabled() {
  return new URLSearchParams(window.location.search).get('chat') === CHAT_FLAG;
}

if (chatEnabled()) {
  // Defer until watch.html's main layout is mounted so lesson-info exists.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrapChat);
  } else {
    bootstrapChat();
  }
}

async function bootstrapChat() {
  // Wait for lesson-info to exist (watch.html toggles main-layout visibility
  // after token validation — it's already in the DOM, just hidden until then).
  const lessonInfo = document.querySelector('.lesson-info');
  if (!lessonInfo) {
    console.warn('chat-bootstrap: .lesson-info not found, aborting');
    return;
  }

  injectTabs(lessonInfo);
  wireTabSwitching();
  injectModals();

  // Dynamically import chat modules. These self-initialize by listening for
  // chat:ready + lesson:changed events (dispatched from watch.html + auth.js).
  try {
    await import('./chat/auth.js');
    await Promise.all([
      import('./chat/messages.js'),
      import('./chat/displayName.js'),
      import('./chat/moderation.js'),
      import('./chat/pins.js'),
      import('./chat/mentions.js'),
      import('./chat/unread.js')
    ]);
  } catch (err) {
    console.error('chat-bootstrap: module load failed', err);
  }
}

function injectTabs(lessonInfo) {
  // Move all existing children of lesson-info into a new Description tab panel.
  const existingChildren = Array.from(lessonInfo.children);

  const tabs = document.createElement('div');
  tabs.setAttribute('data-ui', 'tabs');
  tabs.id = 'lesson-tabs';

  tabs.innerHTML = `
    <div data-role="tablist" role="tablist">
      <button role="tab" aria-selected="true" data-panel="panel-desc" id="tab-desc">الوصف</button>
      <button role="tab" aria-selected="false" data-panel="panel-chat" id="tab-chat">
        <span class="tab-label">النقاش</span>
        <span class="tab-count" id="tab-chat-count" hidden></span>
      </button>
      <button role="tab" aria-selected="false" data-panel="panel-pinned" id="tab-pinned">
        <span class="tab-label">مثبت</span>
        <span class="tab-count" id="tab-pinned-count" hidden></span>
      </button>
    </div>

    <div data-role="tabpanel" data-state="active" id="panel-desc" role="tabpanel" aria-labelledby="tab-desc"></div>

    <div data-role="tabpanel" id="panel-chat" role="tabpanel" aria-labelledby="tab-chat">
      <div class="chat-panel">
        <div class="chat-empty" id="chat-empty">كن أول من يشارك فكرة أو سؤال في هذا الدرس.</div>
        <div class="chat-list" id="chat-list" hidden></div>
        <div class="chat-composer" id="chat-composer">
          <textarea data-ui="textarea" id="composer-input" maxlength="500" placeholder="اكتب رسالة..."></textarea>
          <span class="char-count" id="char-count"></span>
          <button data-ui="btn" data-variant="primary" data-size="sm" id="composer-send" disabled>إرسال</button>
          <div class="mention-autocomplete" id="mention-ac"></div>
        </div>
      </div>
    </div>

    <div data-role="tabpanel" id="panel-pinned" role="tabpanel" aria-labelledby="tab-pinned">
      <div class="pinned-panel" id="pinned-panel">
        <div class="pinned-empty">لا توجد رسائل مثبتة بعد.</div>
      </div>
    </div>
  `;

  lessonInfo.appendChild(tabs);

  // Move the previously-existing children into the Description panel.
  const descPanel = tabs.querySelector('#panel-desc');
  existingChildren.forEach(child => descPanel.appendChild(child));
}

function wireTabSwitching() {
  const tabs = document.getElementById('lesson-tabs');
  if (!tabs) return;

  tabs.addEventListener('click', (e) => {
    const btn = e.target.closest('[role="tab"]');
    if (!btn) return;
    const panelId = btn.dataset.panel;
    tabs.querySelectorAll('[role="tab"]').forEach(t =>
      t.setAttribute('aria-selected', t === btn ? 'true' : 'false')
    );
    tabs.querySelectorAll('[data-role="tabpanel"]').forEach(p => {
      p.dataset.state = p.id === panelId ? 'active' : '';
    });
    try { localStorage.setItem('ma-chat-last-tab', panelId); } catch {}
  });

  // Restore last active tab (per spec §6.3 — default = last tab used)
  try {
    const last = localStorage.getItem('ma-chat-last-tab');
    if (last) {
      const btn = tabs.querySelector(`[data-panel="${last}"]`);
      if (btn) btn.click();
    }
  } catch {}
}

function injectModals() {
  // Display-name modal (Task 20)
  const dnModal = document.createElement('div');
  dnModal.setAttribute('data-ui', 'modal');
  dnModal.id = 'display-name-modal';
  dnModal.innerHTML = `
    <div class="backdrop"></div>
    <div class="panel">
      <h2>اختر اسماً يراه الآخرون في النقاش</h2>
      <p>سيظهر هذا الاسم على كل رسالة تكتبها.</p>
      <div data-ui="field">
        <input data-ui="input" id="display-name-input" maxlength="30" placeholder="الاسم">
        <span class="helper" id="display-name-error" hidden></span>
      </div>
      <div class="actions">
        <button data-ui="btn" data-variant="ghost" id="display-name-cancel">إلغاء</button>
        <button data-ui="btn" data-variant="primary" id="display-name-save">حفظ</button>
      </div>
    </div>
  `;
  document.body.appendChild(dnModal);

  // Moderation menu (Task 21)
  const modMenu = document.createElement('div');
  modMenu.setAttribute('data-ui', 'menu');
  modMenu.id = 'mod-menu';
  modMenu.innerHTML = `
    <button role="menuitem" data-action="pin">📌 تثبيت</button>
    <button role="menuitem" data-action="soft-delete">حذف ناعم</button>
    <button role="menuitem" data-action="hard-delete" data-tone="danger">حذف نهائي</button>
    <hr>
    <button role="menuitem" data-action="ban" data-tone="danger">حظر المستخدم</button>
  `;
  document.body.appendChild(modMenu);

  // Confirm modal (Task 21)
  const confirmModal = document.createElement('div');
  confirmModal.setAttribute('data-ui', 'modal');
  confirmModal.id = 'confirm-modal';
  confirmModal.innerHTML = `
    <div class="backdrop"></div>
    <div class="panel">
      <h2 id="confirm-title">تأكيد</h2>
      <p id="confirm-body"></p>
      <div class="actions">
        <button data-ui="btn" data-variant="ghost" id="confirm-cancel">إلغاء</button>
        <button data-ui="btn" data-variant="danger" id="confirm-ok">تأكيد</button>
      </div>
    </div>
  `;
  document.body.appendChild(confirmModal);
}
