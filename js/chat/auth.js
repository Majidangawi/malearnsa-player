// js/chat/auth.js
// Supabase client init + sign-in using Apps Script-minted HS256 JWT.
//
// GoTrue (/auth/v1/user) rejects JWTs where `sub` is not a real UUID.
// Our uids are sha256-derived (`u_...`) which GoTrue rejects with
// "invalid claim: sub claim must be a UUID". supabase.auth.setSession()
// internally calls getUser → throws → session never stored → every
// subsequent REST call returns 401.
//
// Workaround: skip setSession entirely. Use a custom global.fetch that
// injects our JWT into every PostgREST request, and call
// realtime.setAuth() for Realtime. We never talk to GoTrue.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY, APPS_SCRIPT_URL } from '../supabase-config.js';

// Module-level JWT holder — updated on sign-in + refresh.
let currentJwt = null;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false
  },
  global: {
    // Inject our JWT on every REST/Storage/Functions request, replacing
    // the default Authorization header (anon key).
    fetch: (input, init) => {
      init = init || {};
      const headers = new Headers(init.headers || {});
      if (currentJwt) {
        headers.set('Authorization', `Bearer ${currentJwt}`);
      }
      init.headers = headers;
      return fetch(input, init);
    }
  }
});

window.__supabase = supabase;

/**
 * Fetch a Supabase-compatible JWT from Apps Script, attach it to the
 * client for REST + Realtime, upsert the users row, dispatch chat:ready.
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

  currentJwt = payload.supabaseToken;
  // Tell Realtime to use our JWT for its WebSocket channel auth
  supabase.realtime.setAuth(currentJwt);

  const profile = {
    uid: payload.uid,
    email: payload.email,
    displayName: payload.displayName,
    isMajid: payload.isMajid
  };

  // Ensure users/{uid} row exists. ignoreDuplicates:true means existing
  // rows are NOT overwritten — this preserves the display_name the student
  // already set. Apps Script sends display_name=null on every mint (it
  // doesn't know their chosen chat name), so without ignoreDuplicates we'd
  // wipe their name on every reload.
  const { error: upsertErr } = await supabase
    .from('users')
    .upsert({
      uid: profile.uid,
      email: profile.email,
      display_name: profile.displayName,
      is_majid: profile.isMajid,
      last_seen: {}
    }, { onConflict: 'uid', ignoreDuplicates: true });
  if (upsertErr) {
    console.warn('users upsert (non-fatal):', upsertErr.message);
  }

  // Re-fetch the row to pick up the stored display_name (which may have
  // been set in a prior session). Supabase is now the source of truth for
  // display_name; Apps Script is only source of truth for uid/email/isMajid.
  const { data: userRow, error: fetchErr } = await supabase
    .from('users')
    .select('display_name')
    .eq('uid', profile.uid)
    .single();
  if (!fetchErr && userRow && userRow.display_name) {
    profile.displayName = userRow.display_name;
  }

  window.__chatProfile = profile;
  window.__jwt = currentJwt;

  // Anti-piracy telemetry hook — best-effort, non-blocking
  void captureTelemetry(profile);

  window.dispatchEvent(new CustomEvent('chat:ready', { detail: profile }));
  return profile;
}

/**
 * Silent re-mint: called when a write fails with JWT-expired error.
 */
export async function refreshSession() {
  const u = new URL(window.location.href);
  const token = u.searchParams.get('token');
  const course = u.searchParams.get('course');
  if (!token || !course) return;
  await signInStudent(token, course);
}

async function captureTelemetry(profile) {
  try {
    const ipRes = await fetch('https://api.ipify.org?format=json');
    const { ip } = await ipRes.json();
    const enc = new TextEncoder().encode('ma-learn-chat:' + ip);
    const hashBuf = await crypto.subtle.digest('SHA-256', enc);
    const ipHash = Array.from(new Uint8Array(hashBuf))
      .map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
    window.__ipHash = ipHash;

    await supabase.from('session_events').insert({
      uid: profile.uid,
      event: 'sign_in',
      ip_hash: ipHash,
      user_agent: navigator.userAgent.slice(0, 200)
    });
  } catch (err) {
    console.debug('telemetry skipped:', err.message);
  }
}

// Auto-run on module load: extract token + course from URL and sign in.
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
