// Supabase client for Kasira.
//
// When served behind the VPS Nginx, the app talks to a same-origin proxy
// at /api and /realtime (set via VITE_USE_PROXY=1) so requests work with
// any domain/HTTPS later. For local dev against the VPS directly, set
// VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env.

import { createClient } from '@supabase/supabase-js'

const useProxy = import.meta.env.VITE_USE_PROXY === '1'

let url, realtimeUrl
if (useProxy) {
  url = window.location.origin + '/api'
  realtimeUrl = window.location.origin.replace(/^http/, 'ws') + '/realtime/v1'
} else {
  url = import.meta.env.VITE_SUPABASE_URL || 'http://203.145.35.68:8000'
}

const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const supabase = createClient(url, anonKey, {
  realtime: realtimeUrl ? { params: { apikey: anonKey } } : undefined,
})
