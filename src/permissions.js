// Kasira role-based access — fixed roles, each maps to a set of allowed views
// (routes). The nav (AppShell + shortcuts) only shows allowed entries, and
// main.jsx blocks any route the session role can't open. This is a UI gate on
// top of the existing PIN login, not a security boundary — Supabase RLS stays
// wide-open for the anon-key customer portal.

// Route → roles allowed to open it. Routes not listed are admin-only.
export const ROUTE_ROLES = {
  '':            ['admin', 'kasir', 'pelayan', 'pemilik'], // Ringkasan
  kasir:         ['admin', 'kasir', 'pelayan'],             // Order masuk
  meja:          ['admin', 'kasir', 'pelayan', 'pemilik'],  // Portal meja (tanpa meja = Tables)
  qr:            ['admin', 'kasir', 'pelayan', 'pemilik'],  // QR meja
  menu:          ['admin', 'kasir', 'pemilik'],             // Menu & stok
  kds:           ['admin', 'kasir', 'dapur'],               // Layar dapur
  laporan:       ['admin', 'kasir', 'pemilik'],             // Laporan
  pengaturan:    ['admin'],                                 // Pengaturan
}

// A role's landing route when its normal home is off-limits (e.g. Pelayan
// would default to 'kasir', but its role-list starts with 'ringkasan').
export const ROLE_HOME = {
  admin: 'ringkasan',
  kasir: 'kasir',
  pelayan: 'kasir',
  dapur: 'kds',
  pemilik: 'ringkasan',
}

export const ROLE_LABELS = {
  admin: 'Admin',
  kasir: 'Kasir',
  pelayan: 'Pelayan',
  dapur: 'Dapur',
  pemilik: 'Pemilik',
}

export const ROLE_ORDER = ['admin', 'kasir', 'pelayan', 'dapur', 'pemilik']

// Canonicalize a route alias into its ROOT route id (so access checks cover
// 'settings', 'report', 'stok' etc.) and return the access list for that view.
const canonicalRoute = (route) => {
  const root = String(route || '').replace(/^\/+/, '').split('?')[0]
  if (['', 'ringkasan', 'dashboard'].includes(root)) return ''
  if (['kasir'].includes(root)) return 'kasir'
  if (['meja', 'pelanggan'].includes(root)) return 'meja'
  if (['qr'].includes(root)) return 'qr'
  if (['menu', 'stok'].includes(root)) return 'menu'
  if (['kds'].includes(root)) return 'kds'
  if (['laporan', 'report'].includes(root)) return 'laporan'
  if (['pengaturan', 'settings', 'setting'].includes(root)) return 'pengaturan'
  return root
}

export function canView(role, route) {
  const root = canonicalRoute(route)
  const allowed = ROUTE_ROLES[root]
  if (!allowed) return false
  return allowed.includes(role)
}

// Allowed entries for a role, in NAV order — used to filter the sidebar &
// shortcuts so a Dapur role never sees Laporan, a Pemilik never sees Order.
export const visibleNav = (role, nav) => nav.filter((item) => canView(role, item.route))
