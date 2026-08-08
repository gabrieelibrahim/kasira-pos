// App-level staff auth helpers.
//
// Since the RLS/Supabase-Auth migration (2026-08-08), the source of truth for
// a staff session is Supabase Auth: login = signInWithPassword (email =
// <username>@kasira.local, password = PIN). supabase-js persists the JWT under
// its own storage key, and REST + realtime automatically carry it (RLS reads
// outlet_id from the JWT claim). This module keeps the app's own lightweight
// user object (id/name/username/role/outletId) for UI routing, derived from
// the session's app_metadata so it survives a reload without an async flash.

const KEY = 'kasira.staff.session'

export const getStoredUser = () => {
  try { return JSON.parse(localStorage.getItem(KEY)) } catch { return null }
}

export const clearSession = () => localStorage.removeItem(KEY)

export const saveSession = (u) => localStorage.setItem(KEY, JSON.stringify(u))

// Derive the app user (id/name/username/role/outletId) from a Supabase Auth
// session. The Auth user's email is <username>@kasira.local; outlet_id/role
// come from app_metadata (kept in sync by the staff RPCs). The display name
// and staff id are not (yet) in app_metadata for pre-existing staff, so fall
// back to the previously stored user object — the name shown in the shell
// stays correct even right after a reload.
export const userFromAuth = (session, prev) => {
  const u = session?.user
  if (!u) return null
  const meta = u.app_metadata || {}
  const fallback = prev || {}
  return {
    id: meta.staff_id || fallback.id || u.id,
    name: meta.name || fallback.name || u.user_metadata?.name || '',
    username: (u.email || '').replace(/@kasira\.local$/, '') || fallback.username || '',
    role: meta.role || fallback.role || 'kasir',
    outletId: meta.outlet_id || fallback.outletId || null,
  }
}