// js/chat/mentions.js
// @mention autocomplete + parsing + gold-chip rendering.
// Caches recent authors per room (7 days) for the autocomplete dropdown.

import { supabase } from './auth.js';

const input = document.getElementById('composer-input');
const ac = document.getElementById('mention-ac');
const chatList = document.getElementById('chat-list');

if (!input || !ac || !chatList) {
  console.debug('mentions: DOM not present (flag off)');
} else {
  let activeMatches = [];
  let activeIdx = 0;
  let triggerStart = -1;
  const roomUsers = new Map();  // uid -> { uid, name, isMajid }

  window.addEventListener('lesson:changed', async (e) => {
    roomUsers.clear();
    const lessonId = e.detail.lessonId;
    const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

    const { data, error } = await supabase
      .from('messages')
      .select('author_uid, author_display_name, is_majid, created_at')
      .eq('lesson_id', lessonId)
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) { console.warn('mentions authors:', error.message); return; }

    data.forEach(m => {
      if (m.author_display_name) {
        roomUsers.set(m.author_uid, {
          uid: m.author_uid,
          name: m.author_display_name,
          isMajid: !!m.is_majid
        });
      }
    });
  });

  input.addEventListener('input', () => {
    const pos = input.selectionStart;
    const before = input.value.slice(0, pos);
    const m = before.match(/@(\S*)$/);
    if (!m) { hide(); return; }
    triggerStart = pos - m[0].length;
    const needle = m[1].toLowerCase();
    show(needle);
  });

  input.addEventListener('keydown', (e) => {
    if (ac.dataset.state !== 'open') return;
    if (e.key === 'ArrowDown')      { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter' || e.key === 'Tab') {
      if (activeMatches.length > 0) { e.preventDefault(); pick(activeMatches[activeIdx]); }
    } else if (e.key === 'Escape') { hide(); }
  });

  function show(needle) {
    const out = [];
    // Majid always first — students most want to ping him
    out.push({ uid: 'majid', name: 'Majid', isMajid: true, pinned: true });
    for (const u of roomUsers.values()) {
      if (u.isMajid) continue;
      if (u.name.toLowerCase().includes(needle)) out.push(u);
    }
    activeMatches = out.slice(0, 8);
    activeIdx = 0;
    if (activeMatches.length === 0) { hide(); return; }
    ac.innerHTML = activeMatches.map((u, i) => `
      <div class="mention-item" data-uid="${u.uid}" data-name="${escape(u.name)}" data-is-majid="${u.isMajid}" data-active="${i === activeIdx}">
        <span>@${escape(u.name)}</span>
        ${u.isMajid ? '<span style="color:var(--c-gold);font-size:10px;">✓</span>' : ''}
      </div>
    `).join('');
    ac.dataset.state = 'open';
    ac.querySelectorAll('.mention-item').forEach((el, i) => {
      el.addEventListener('click', () => pick(activeMatches[i]));
    });
  }

  function move(delta) {
    activeIdx = (activeIdx + delta + activeMatches.length) % activeMatches.length;
    ac.querySelectorAll('.mention-item').forEach((el, i) => {
      el.dataset.active = String(i === activeIdx);
    });
  }

  function hide() {
    ac.dataset.state = '';
    activeMatches = [];
    triggerStart = -1;
  }

  function pick(u) {
    const before = input.value.slice(0, triggerStart);
    const after = input.value.slice(input.selectionStart);
    const inserted = `@${u.name} `;
    input.value = before + inserted + after;
    input.selectionStart = input.selectionEnd = (before + inserted).length;
    input.focus();
    hide();
    input.dispatchEvent(new Event('input'));
  }

  // Parse mentions from composed text — called by messages.js on send
  window.__parseMentions = (text) => {
    const names = [...text.matchAll(/@([^\s]+)/g)].map(m => m[1]);
    const mentioned = [];
    for (const name of names) {
      if (name === 'Majid') mentioned.push('majid');
      for (const u of roomUsers.values()) {
        if (u.name === name) mentioned.push(u.uid);
      }
    }
    return [...new Set(mentioned)];
  };

  function escape(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Post-process .chat-body innerHTML to wrap @mentions in gold chips
  const observer = new MutationObserver(() => {
    document.querySelectorAll('.chat-body').forEach(el => {
      if (el.dataset.mentionsProcessed) return;
      el.innerHTML = el.innerHTML.replace(/@([^\s<]+)/g, '<span class="mention">@$1</span>');
      el.dataset.mentionsProcessed = 'true';
    });
  });
  observer.observe(chatList, { childList: true, subtree: true });
}
