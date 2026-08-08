// Supabase client for Kasira.
//
// When served behind the VPS Nginx, the app talks to a same-origin proxy
// at /api and /realtime (set via VITE_USE_PROXY=1) so requests work with
// any domain/HTTPS later. For local dev against the VPS directly, set
// VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env.
//
// Multi-tenant isolation (2026-08-08):
//   * Staff sign in via Supabase Auth — their JWT carries `outlet_id` and
//     `super_admin` app-metadata claims, so every request (REST + realtime) is
//     scoped by RLS to their tenant with no header needed.
//   * The public customer portal is anonymous. Its outlet comes from the QR
//     URL and is attached as an `x-kasira-outlet` header on every REST request
//     (setOutletHeader). RLS's current_outlet() falls back to that header.
//   * Staff direct-reads that predate Auth (e.g. the empty-db check on Login)
//     are wired to Auth as well; grants block raw staff columns regardless.

import { createClient } from '@supabase/supabase-js'

const useProxy = import.meta.env.VITE_USE_PROXY === '1'

let url, realtimeUrl
if (useProxy) {
  url = window.location.origin + '/api'
  realtimeUrl = window.location.origin.replace(/^http/, 'ws') + '/v1'
} else {
  url = import.meta.env.VITE_SUPABASE_URL || 'http://203.145.35.68:8000'
}

const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

// Portal outlet header source. The customer portal sets this once it resolves
// the QR's `outlet` param; every subsequent REST request (select/insert/rpc)
// carries `x-kasira-outlet`, which RLS's current_outlet() reads to scope the
// anon portal to that one tenant. Staff never set it here — their JWT carries
// the outlet claim instead, and RLS prefers the JWT over the header.
let portalOutlet = null
export const setPortalOutlet = (id) => { portalOutlet = id ? String(id) : null }
export const getPortalOutlet = () => portalOutlet

// Inject the portal outlet header on every REST call. supabase-js wraps our
// fetch via fetchWithAuth(), which already merged apikey/Authorization into
// init.headers before calling us — so attaching x-kasira-outlet here composes
// cleanly with both .from() and .rpc() requests. WebSocket/realtime does NOT
// go through this fetch, which is exactly why staff use their Auth JWT for
// realtime (RLS reads the claim), while the anon portal polls instead.
const restFetch = globalThis.fetch.bind(globalThis)
const portalFetch = async (input, init) => {
  const outlet = getPortalOutlet()
  if (!outlet) return restFetch(input, init)
  const headers = new Headers(init?.headers)
  headers.set('x-kasira-outlet', outlet)
  return restFetch(input, { ...(init || {}), headers })
}

export const supabase = createClient(url, anonKey, {
  global: { fetch: portalFetch },
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
