// js/chat/pins.js
// Pinned panel. Realtime subscription per room; re-renders on any pins change.
// Gets the first render on chat:ready; switches room on lesson:changed.

import { supabase } from './auth.js';

const panel = document.getElementById('pinned-panel');
const tabCount = document.getElementById('tab-pinned-count');

if (!panel) {
  console.debug('pins: panel not in DOM (flag off)');
} else {
  let currentChannel = null;
  let currentLessonId = null;

  async function openPins(lessonId) {
    if (currentChannel) {
      try { await supabase.removeChannel(currentChannel); } catch (_) {}
      currentChannel = null;
    }
    currentLessonId = lessonId;
    await renderAll();

    currentChannel = supabase
      .channel(`pins:${lessonId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'pins', filter: `lesson_id=eq.${lessonId}` },
        () => { renderAll(); })
      .subscribe();
  }

  async function renderAll() {
    if (!currentLessonId) return;
    const { data: pins, error } = await supabase
      .from('pins')
      .select('*')
      .eq('lesson_id', currentLessonId)
      .order('pinned_at', { ascending: false });
    if (error) { console.warn('pins select:', error.message); return; }

    const profile = window.__chatProfile || {};
    panel.innerHTML = '';
    if (!pins || pins.length === 0) {
      panel.innerHTML = '<div class="pinned-empty">لا توجد رسائل مثبتة بعد.</div>';
      tabCount.hidden = true;
      return;
    }
    tabCount.hidden = false;
    tabCount.textContent = String(pins.length);
    for (const p of pins) {
      const el = document.createElement('div');
      el.className = 'pinned-item';
      el.innerHTML = `
        <div class="pinned-meta">
          ${escape(p.author_display_name || 'مثبت')} ✓
          ${p.expires_at ? `<span class="pinned-expiry">ينتهي ${fmt(p.expires_at)}</span>` : ''}
          ${profile.isMajid ? `<button class="unpin-btn" data-pin-id="${p.id}" style="margin-inline-start:8px;background:transparent;border:0;color:var(--c-danger);cursor:pointer;">إلغاء التثبيت</button>` : ''}
        </div>
        <div dir="auto" style="font-size:var(--fs-body-sm);line-height:1.6;">${escape(p.body)}</div>
      `;
      panel.appendChild(el);
    }
  }

  panel.addEventListener('click', async (e) => {
    const btn = e.target.closest('.unpin-btn');
    if (!btn) return;
    const { error } = await supabase.from('pins').delete().eq('id', btn.dataset.pinId);
    if (error) alert('خطأ: ' + error.message);
  });

  function fmt(ts) {
    const d = typeof ts === 'string' ? new Date(ts) : ts;
    return d.toLocaleDateString('ar-SA');
  }
  function escape(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  window.addEventListener('lesson:changed', (e) => openPins(e.detail.lessonId));
  window.addEventListener('chat:ready', () => {
    if (window.__currentLessonId) openPins(window.__currentLessonId);
  });

  // Catch-up if lesson:changed or chat:ready already fired before this
  // module's listeners were attached (race with watch.html init()).
  if (window.__currentLessonId) {
    openPins(window.__currentLessonId);
  }
}
