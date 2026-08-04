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

// Public base for storage object URLs (public bucket). Works whether the
// client talks directly to Kong (:8000) or through the same-origin /api proxy.
const storageBase = url + '/storage/v1/object/public'

// Full public URL for an uploaded object path ('menu-images/<file>').
export const storageUrl = (path) => (path ? `${storageBase}/${path}` : '')

const BUCKET = 'menu-images'

// Upload a menu-item image and return its object path ('menu-images/<id>.<ext>').
// Returns null on failure. Used by the menu form; the path is persisted in
// menu_items.image.
export async function uploadMenuItemImage(file) {
  if (!file) return null
  const ext = (file.name.split('.').pop() || 'png').toLowerCase()
  const id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()))
  const path = `${id}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: true,
  })
  if (error) throw error
  return `${BUCKET}/${path}`
}

// Remove a stored image by its object path (best-effort).
export async function removeMenuItemImage(path) {
  if (!path) return
  const name = path.replace(/^menu-images\//, '')
  await supabase.storage.from(BUCKET).remove([name])
}
