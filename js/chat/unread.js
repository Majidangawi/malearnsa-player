// js/chat/unread.js
// Subscribes to ALL rooms changes, diffs message_count against
// users.last_seen[lessonId], and toggles data-unread on each lesson-item.
// When a lesson has been open for 2s, writes back last_seen so the dot clears.

import { supabase } from './auth.js';

let roomChannel = null;
let lastSeenCache = {};

async function bootstrap(profile) {
  // Fetch current lastSeen map from the user's row
  const { data, error } = await supabase
    .from('users')
    .select('last_seen')
    .eq('uid', profile.uid)
    .single();
  if (error) { console.warn('unread users select:', error.message); return; }
  lastSeenCache = data?.last_seen || {};

  // Initial pass: pull every room's message_count and apply
  const { data: rooms, error: e2 } = await supabase
    .from('rooms')
    .select('lesson_id, message_count');
  if (e2) { console.warn('unread rooms select:', e2.message); return; }
  rooms.forEach(applyRoomRow);

  // One channel watching all rooms. On any change, re-apply that row.
  roomChannel = supabase
    .channel('rooms:all')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'rooms' },
      (payload) => {
        const r = payload.new || payload.old;
        if (r) applyRoomRow(r);
      })
    .subscribe();
}

function applyRoomRow(r) {
  if (!r.lesson_id) return;
  const el = document.querySelector(`.lesson-item[data-lesson-id="${CSS.escape(r.lesson_id)}"]`);
  if (!el) return;
  const seen = Number(lastSeenCache[r.lesson_id] || 0);
  const count = Number(r.message_count || 0);
  if (count > seen && r.lesson_id !== window.__currentLessonId) {
    el.dataset.unread = 'true';
  } else {
    delete el.dataset.unread;
  }
}

window.addEventListener('chat:ready', (e) => { bootstrap(e.detail); });

// On lesson open, after 2s dwell, mark it seen (write last_seen[lessonId] = count)
let dwellTimer = null;
window.addEventListener('lesson:changed', (e) => {
  clearTimeout(dwellTimer);
  const lessonId = e.detail.lessonId;
  dwellTimer = setTimeout(async () => {
    const profile = window.__chatProfile;
    if (!profile) return;
    const { data: room, error } = await supabase
      .from('rooms')
      .select('message_count')
      .eq('lesson_id', lessonId)
      .single();
    if (error) {
      // Room may not exist yet (no messages sent). Treat count as 0.
      if (error.code !== 'PGRST116') console.warn('lastSeen fetch:', error.message);
      return;
    }
    const count = Number(room?.message_count || 0);
    const next = { ...lastSeenCache, [lessonId]: count };
    const { error: updErr } = await supabase
      .from('users')
      .update({ last_seen: next })
      .eq('uid', profile.uid);
    if (updErr) { console.warn('lastSeen update:', updErr.message); return; }
    lastSeenCache = next;

    const el = document.querySelector(`.lesson-item[data-lesson-id="${CSS.escape(lessonId)}"]`);
    if (el) delete el.dataset.unread;
  }, 2000);
});

// ── Hamburger unread aggregate dot ──────────────────────────────────
// When any non-current lesson has [data-unread], stamp a small red dot
// on the nav menu button so mobile users know before opening the sidebar.
const navMenuBtn = document.querySelector('.nav-menu-btn') || document.getElementById('hamburger');

function refreshHamburgerDot() {
  if (!navMenuBtn) return;
  const anyUnread = !!document.querySelector('.lesson-item[data-unread]');
  if (anyUnread) {
    if (!navMenuBtn.querySelector('.hamburger-dot')) {
      const dot = document.createElement('span');
      dot.className = 'hamburger-dot';
      dot.style.cssText = 'position:absolute;top:6px;right:6px;width:6px;height:6px;border-radius:50%;background:var(--c-danger);';
      navMenuBtn.style.position = 'relative';
      navMenuBtn.appendChild(dot);
    }
  } else {
    navMenuBtn.querySelector('.hamburger-dot')?.remove();
  }
}
new MutationObserver(refreshHamburgerDot).observe(
  document.body,
  { attributes: true, subtree: true, attributeFilter: ['data-unread'] }
);
