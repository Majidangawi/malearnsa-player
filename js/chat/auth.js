// js/chat/auth.js
// Supabase client init + sign-in using Apps Script-minted HS256 JWT.
// See spec §16.4 for the auth flow diagram.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY, APPS_SCRIPT_URL } from '../supabase-config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // We manage the JWT ourselves via setSession; Supabase's auto-refresh would
    // try to hit a refresh endpoint that doesn't exist for our custom HS256 JWTs.
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false
  }
});

// Expose the client globally so other chat modules can reach it without
// circular imports. Non-chat code never sees this (bootstrap only imports
// when flag is on).
window.__supabase = supabase;

/**
 * Given MA Learn token + course, fetch a Supabase-compatible JWT from Apps
 * Script and sign in. Dispatches `chat:ready` with the profile on success.
 */
export async function signInStudent(token, course) {
  const url = new URL(APPS_SCRIPT_URL);
  url.searchParams.set('action', 'mint_supabase_token');
  url.searchParams.set('token', token);
  url.searchParams.set('course', course);

  const res = await fetch(url.toString(), { method: 'GET' });
  const payload = await res.json();
  if (!payload.ok) {
    throw new Error('mint_supabase_token: ' + (payload.error || 'unknown'));
  }

  const { data, error } = await supabase.auth.setSession({
    access_token: payload.supabaseToken,
    refresh_token: payload.supabaseToken
  });
  if (error) throw error;

  const profile = {
    uid: payload.uid,
    email: payload.email,
    displayName: payload.displayName,
    isMajid: payload.isMajid
  };

  // Ensure users/{uid} row exists. RLS users_self_insert allows this as
  // long as the JWT claims match (is_majid matches app_metadata.isMajid).
  const { error: upsertErr } = await supabase
    .from('users')
    .upsert({
      uid: profile.uid,
      email: profile.email,
      display_name: profile.displayName,
      is_majid: profile.isMajid,
      last_seen: {}
    }, { onConflict: 'uid', ignoreDuplicates: false });
  if (upsertErr) {
    // Non-fatal — row may already exist with a set display_name we don't
    // want to overwrite with null. Swallow and log.
    console.warn('users upsert (non-fatal):', upsertErr.message);
  }

  window.__chatProfile = profile;
  window.__sbUser = data?.user || null;
  window.dispatchEvent(new CustomEvent('chat:ready', { detail: profile }));
  return profile;
}

/**
 * Silent re-mint: called when a write fails with JWT-expired error.
 * The JWT lives 1h; students watching a long lesson need a refresh
 * before their next message write.
 */
export async function refreshSession() {
  const u = new URL(window.location.href);
  const token = u.searchParams.get('token');
  const course = u.searchParams.get('course');
  if (!token || !course) return;
  await signInStudent(token, course);
}

// Auto-run on module load: extract token + course from URL and sign in.
// chat-bootstrap.js imports this module after DOMContentLoaded, so the URL
// params are present.
(async () => {
  const u = new URL(window.location.href);
  const token = u.searchParams.get('token');
  const course = u.searchParams.get('course');
  if (!token || !course) {
    console.warn('chat auth: missing token or course in URL');
    return;
  }
  try {
    await signInStudent(token, course);
  } catch (err) {
    console.error('chat auth signInStudent failed:', err);
  }
})();
