// js/chat/moderation.js
// Majid-only moderation menu. Non-Majid profiles never get the ⋮ trigger
// rendered on message rows (messages.js gates it on profile.isMajid), so
// this code effectively no-ops for students.

import { supabase } from './auth.js';

const menu = document.getElementById('mod-menu');
const confirmModal = document.getElementById('confirm-modal');

if (!menu || !confirmModal) {
  console.debug('moderation: DOM not present (flag off)');
} else {
  const confirmTitle = document.getElementById('confirm-title');
  const confirmBody = document.getElementById('confirm-body');
  const confirmOk = document.getElementById('confirm-ok');
  const confirmCancel = document.getElementById('confirm-cancel');

  let activeMsgId = null;
  let activeMsgAuthorUid = null;
  let activeMsgAuthorName = null;

  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('.chat-actions-trigger');
    if (trigger) {
      activeMsgId = trigger.dataset.msgId;
      const row = trigger.closest('.chat-message');
      activeMsgAuthorUid = row?.dataset.authorUid || null;
      activeMsgAuthorName = row?.querySelector('.chat-author')?.textContent.trim() || '';
      const rect = trigger.getBoundingClientRect();
      menu.style.top = rect.bottom + window.scrollY + 'px';
      menu.style.left = rect.left + 'px';
      menu.dataset.state = 'open';
    } else if (!menu.contains(e.target)) {
      menu.dataset.state = '';
    }
  });

  menu.addEventListener('click', async (e) => {
    const item = e.target.closest('[role="menuitem"]');
    if (!item || !activeMsgId) return;
    const action = item.dataset.action;
    menu.dataset.state = '';

    const lessonId = window.__currentLessonId;
    const profile = window.__chatProfile;
    if (!profile?.isMajid) return;

    if (action === 'pin')         return doPin(lessonId, activeMsgId);
    if (action === 'soft-delete') return doSoftDelete(lessonId, activeMsgId);
    if (action === 'hard-delete') return confirmAction('حذف نهائي',
                                    'لا يمكن التراجع عن هذا الإجراء.',
                                    () => doHardDelete(lessonId, activeMsgId));
    if (action === 'ban')         return confirmAction('حظر المستخدم',
                                    `حظر "${activeMsgAuthorName}"؟ سيتمكن من القراءة ولن يستطيع الكتابة.`,
                                    () => doBan(activeMsgAuthorUid));
    if (action === 'clear-room')  return confirmAction('مسح الغرفة كاملة',
                                    'سيتم حذف كل الرسائل في هذا الدرس. لا يمكن التراجع.',
                                    () => doClearRoom(lessonId));
  });

  async function doPin(lessonId, msgId) {
    const { data: msg, error } = await supabase.from('messages').select('*').eq('id', msgId).single();
    if (error) { alert('خطأ: ' + error.message); return; }

    const expires = prompt('تاريخ انتهاء التثبيت (فارغ = دائم). صيغة: YYYY-MM-DD', '');
    let expiresAt = null;
    if (expires && expires.trim()) {
      const d = new Date(expires.trim());
      if (isNaN(d)) { alert('تاريخ غير صالح.'); return; }
      expiresAt = d.toISOString();
    }

    const { error: pinErr } = await supabase.from('pins').insert({
      lesson_id: lessonId,
      author_uid: msg.author_uid,
      author_display_name: msg.author_display_name,
      body: msg.body,
      pinned_by: window.__chatProfile.uid,
      expires_at: expiresAt
    });
    if (pinErr) { alert('خطأ في التثبيت: ' + pinErr.message); return; }
    await logAction('pin', { targetMsgId: msgId, roomId: lessonId });
  }

  async function doSoftDelete(lessonId, msgId) {
    const { error } = await supabase.from('messages').update({ deleted: true }).eq('id', msgId);
    if (error) { alert('خطأ: ' + error.message); return; }
    await logAction('soft_delete', { targetMsgId: msgId, roomId: lessonId });
  }

  async function doHardDelete(lessonId, msgId) {
    const { error } = await supabase.from('messages').delete().eq('id', msgId);
    if (error) { alert('خطأ: ' + error.message); return; }
    await logAction('hard_delete', { targetMsgId: msgId, roomId: lessonId });
  }

  async function doBan(targetUid) {
    if (!targetUid) { alert('uid غير موجود على الرسالة.'); return; }
    const { error } = await supabase.from('banned_uids').upsert({
      uid: targetUid,
      banned_by: window.__chatProfile.uid,
      reason: 'moderation',
      expires_at: null
    }, { onConflict: 'uid' });
    if (error) { alert('خطأ في الحظر: ' + error.message); return; }
    await logAction('ban', { targetUid });
  }

  async function doClearRoom(lessonId) {
    const { error } = await supabase.rpc('clear_room', { p_lesson_id: lessonId });
    if (error) { alert('خطأ في مسح الغرفة: ' + error.message); return; }
    await logAction('clear_room', { roomId: lessonId });
  }

  async function logAction(action, extras) {
    await supabase.from('moderation_log').insert({
      action,
      actor_uid: window.__chatProfile.uid,
      target_uid: extras.targetUid || null,
      target_msg_id: extras.targetMsgId || null,
      room_id: extras.roomId || null,
      reason: extras.reason || null
    });
  }

  function confirmAction(title, body, onOk) {
    confirmTitle.textContent = title;
    confirmBody.textContent = body;
    confirmModal.dataset.state = 'open';
    const handler = async () => {
      confirmOk.removeEventListener('click', handler);
      confirmCancel.removeEventListener('click', cancel);
      confirmModal.dataset.state = '';
      await onOk();
    };
    const cancel = () => {
      confirmOk.removeEventListener('click', handler);
      confirmCancel.removeEventListener('click', cancel);
      confirmModal.dataset.state = '';
    };
    confirmOk.addEventListener('click', handler, { once: true });
    confirmCancel.addEventListener('click', cancel, { once: true });
  }
}
