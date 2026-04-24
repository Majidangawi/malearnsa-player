/**
 * Supabase client config for malearn-chat.
 *
 * The anon key is public by design — Supabase's anon key identifies the
 * project, not grants access. All access is enforced by RLS + the signed
 * JWT minted by Apps Script. The JWT Secret lives ONLY in Apps Script
 * Script Properties, never in client code.
 */
export const SUPABASE_URL = 'https://rmefydapbrirzgmmbyxx.supabase.co';

export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJtZWZ5ZGFwYnJpcnpnbW1ieXh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5ODQzMzQsImV4cCI6MjA5MjU2MDMzNH0.WBIXHC7QxbvUxO5dK3rKOh7179SoXL61vOkNwDJhQvQ';

// Live deployment URL of the token-validator Apps Script (scriptId 1OPM0ii4...,
// deployment @11). Same script that handles validate_token, admin_* endpoints,
// and now mint_supabase_token. See memory reference_apps_script_ids.md.
export const APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbznjcsYu8gLDZqFJGededAQaATad_L8vlhRQV04pOqh57HB5nFVRy9zUHAcg6goyj8DKA/exec';
