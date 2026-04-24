// js/chat/messages.js
// Realtime message list + composer. Listens for lesson:changed to swap rooms;
// listens for chat:ready for the initial open.

import { supabase } from './auth.js';

let currentLessonId = null;
let currentChannel = null;
const chatList = document.getElementById('chat-list');
const chatEmpty = document.getElementById('chat-empty');
const input = document.getElementById('composer-input');
const sendBtn = document.getElementById('composer-send');
const charCount = document.getElementById('char-count');

export async function openRoom(lessonId, courseId) {
  if (!chatList || !input || !sendBtn) return;  // flag off or bootstrap not run
  if (currentChannel) {
    try { await supabase.removeChannel(currentChannel); } catch (_) {}
    currentChannel = null;
  }
  currentLessonId = lessonId;
  chatList.innerHTML = '';
  chatEmpty.hidden = false;
  chatList.hidden = true;

  // Ensure the room row exists. RLS rooms_authed_insert allows any authed user.
  try {
    await supabase.from('rooms').upsert(
      { lesson_id: lessonId, course_id: courseId || 'beyond-lighting' },
      { onConflict: 'lesson_id', ignoreDuplicates: true }
    );
  } catch (err) {
    console.warn('room upsert (non-fatal):', err.message);
  }

  // Initial load — last 200 messages, ascending
  const { data: initial, error } = await supabase
    .from('messages')
    .select('*')
    .eq('lesson_id', lessonId)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) {
    console.warn('messages select:', error.message);
    return;
  }
  initial.forEach(appendMessage);
  syncEmptyState();

  // Subscribe to realtime INSERT/UPDATE/DELETE on this room.
  currentChannel = supabase
    .channel(`messages:${lessonId}`)
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `lesson_id=eq.${lessonId}` },
      (payload) => { appendMessage(payload.new); syncEmptyState(); })
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'messages', filter: `lesson_id=eq.${lessonId}` },
      (payload) => { replaceMessage(payload.new); })
    .on('postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'messages', filter: `lesson_id=eq.${lessonId}` },
      (payload) => { removeMessage(payload.old.id); syncEmptyState(); })
    .subscribe();
}

function appendMessage(m) {
  if (document.getElementById('msg-' + m.id)) return;
  const profile = window.__chatProfile || {};
  const row = document.createElement('div');
  row.className = 'chat-message';
  row.id = 'msg-' + m.id;
  row.dataset.isMajid = String(!!m.is_majid);
  row.dataset.deleted = String(!!m.deleted);
  row.dataset.authorUid = m.author_uid;
  if (Array.isArray(m.mentions) && m.mentions.includes(profile.uid)) {
    row.dataset.mentionedSelf = 'true';
  }
  const initials = (m.author_display_name || '?').slice(0, 2).toUpperCase();
  row.innerHTML = `
    <div data-ui="avatar">${escape(initials)}</div>
    <div class="chat-author" data-is-majid="${!!m.is_majid}">
      ${escape(m.author_display_name || 'مستخدم')}
      ${m.is_majid ? '<span class="verified">✓</span>' : ''}
    </div>
    <div class="chat-body" dir="auto">${renderBody(m)}</div>
    <div class="chat-time">${formatTime(m.created_at)}</div>
    ${profile.isMajid ? `<button class="chat-actions-trigger" data-msg-id="${m.id}">⋮</button>` : ''}
  `;
  chatList.appendChild(row);
  chatList.scrollTop = chatList.scrollHeight;
}

function replaceMessage(m) {
  const existing = document.getElementById('msg-' + m.id);
  if (!existing) return appendMessage(m);
  existing.remove();
  appendMessage(m);
}

function removeMessage(id) {
  const existing = document.getElementById('msg-' + id);
  if (existing) existing.remove();
}

function syncEmptyState() {
  const any = chatList.children.length > 0;
  chatEmpty.hidden = any;
  chatList.hidden = !any;
}

function renderBody(m) {
  if (m.deleted) return '<em>[تم حذف الرسالة]</em>';
  let s = escape(m.body || '');
  s = s.replace(/\b(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  return s;
}

function escape(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatTime(ts) {
  if (!ts) return '';
  const d = typeof ts === 'string' ? new Date(ts) : ts;
  const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return 'الآن';
  if (diffMin < 60) return `قبل ${diffMin}د`;
  if (diffMin < 1440) return `قبل ${Math.round(diffMin / 60)}س`;
  return d.toLocaleDateString('ar-SA');
}

// Composer wiring
if (input) {
  input.addEventListener('input', () => {
    const len = input.value.length;
    charCount.textContent = `${len}/500`;
    charCount.dataset.state = len > 480 ? 'error' : (len > 400 ? 'warn' : '');
    sendBtn.disabled = !input.value.trim() || !currentLessonId || !window.__chatProfile;
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendBtn.click();
    }
  });
}

if (sendBtn) {
  sendBtn.addEventListener('click', async () => {
    const body = input.value.trim();
    if (!body || !currentLessonId) return;
    const profile = window.__chatProfile;
    if (!profile) return;

    const urlCount = (body.match(/\bhttps?:\/\/\S+/g) || []).length;
    if (urlCount > 3) { toast('الحد الأقصى ٣ روابط في الرسالة.'); return; }

    if (!profile.displayName) {
      window.dispatchEvent(new CustomEvent('chat:need-display-name'));
      return;
    }

    sendBtn.disabled = true;
    try {
      const payload = {
        lesson_id: currentLessonId,
        author_uid: profile.uid,
        author_display_name: profile.displayName,
        is_majid: profile.isMajid,
        body,
        mentions: window.__parseMentions ? window.__parseMentions(body) : [],
        deleted: false,
        ip_hash: window.__ipHash || null,
        user_agent: navigator.userAgent.slice(0, 200)
      };
      let { error } = await supabase.from('messages').insert(payload);
      if (error) {
        if (error.code === 'PGRST301' || /jwt/i.test(error.message)) {
          const { refreshSession } = await import('./auth.js');
          await refreshSession();
          const retry = await supabase.from('messages').insert(payload);
          if (retry.error) throw retry.error;
        } else {
          throw error;
        }
      }
      input.value = '';
      charCount.textContent = '';
    } catch (err) {
      toast('فشل الإرسال: ' + (err.code || err.message));
    } finally {
      sendBtn.disabled = !input.value.trim();
    }
  });
}

function toast(msg) {
  const t = document.createElement('div');
  t.setAttribute('data-ui', 'toast');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// Lesson-change + initial hooks
window.addEventListener('lesson:changed', (e) => {
  openRoom(e.detail.lessonId, e.detail.courseId);
});
window.addEventListener('chat:ready', () => {
  if (window.__currentLessonId) {
    openRoom(window.__currentLessonId, window.__currentCourseId);
  }
});
