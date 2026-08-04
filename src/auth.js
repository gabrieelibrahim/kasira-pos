// App-level staff auth helpers.
//
// PIN verification happens server-side via the login_staff RPC (bcrypt);
// this module only persists/restores the session and calls the RPC. The login
// is a UI gate, not a data-security boundary (RLS stays wide-open for the
// anon-key customer portal) — it just decides who can reach the kasir views.

const KEY = 'kasira.staff.session'

export const getStoredUser = () => {
  try { return JSON.parse(localStorage.getItem(KEY)) } catch { return null }
}

export const clearSession = () => localStorage.removeItem(KEY)

export const saveSession = (u) => localStorage.setItem(KEY, JSON.stringify(u))