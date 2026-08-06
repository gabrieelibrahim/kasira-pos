// Kasira entry — hash-based router over modular views.
//   #/            -> cashier dashboard
//   #/kds         -> kitchen display
//   #/meja        -> customer QR portal
//   #/qr          -> printable per-table QR codes
// Each view is a self-contained module, so it can be served independently
// (e.g. on its own subdomain) later.

import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import Customer from './Customer'
import Kds from './Kds'
import Qr from './Qr'
import Cashier from './views/Cashier'
import Dashboard from './views/Dashboard'
import Menu from './views/Menu'
import Report from './views/Report'
import Settings from './views/Settings'
import Tables from './views/Tables'
import { AuthProvider, StoreProvider, useAuth } from './state.jsx'
import { canView } from './permissions.js'
import Login from './Login.jsx'
import './styles.css'

// Hash routes are #/path?query — strip the query string so 'meja?meja=5'
// routes to 'meja'; each view parses its own params from the hash.
const routeFromHash = () => window.location.hash.replace(/^#\//, '').split('?')[0] || 'ringkasan'

function AccessDenied() {
  return (
    <div className="access-denied">
      <div className="brand-mark">K</div>
      <h1>Akses dibatasi</h1>
      <p>Role kamu tidak punya izin membuka halaman ini. Hubungi admin untuk akses.</p>
      <button type="button" className="primary-button" onClick={() => { window.location.hash = '#/' }}>Kembali</button>
    </div>
  )
}

function App() {
  const [route, setRoute] = useState(routeFromHash)
  const { user } = useAuth()

  useEffect(() => {
    const onHashChange = () => setRoute(routeFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  // Public: the customer QR portal is never gated.
  const isCustomer = route === 'meja' && /[?&](meja|table)=/.test(window.location.hash)
  if (isCustomer) return <Customer />

  // Protected: everything else requires a logged-in staff member, and the
  // role must be allowed to open the requested view.
  if (!user) return <Login />
  if (!canView(user.role, route)) return <AccessDenied />

  const hasTable = /[?&](meja|table)=/.test(window.location.hash)
  if (route === 'kds') return <Kds />
  if (route === 'qr') return <Qr />
  if (route === 'menu' || route === 'stok') return <Menu />
  if (route === 'laporan' || route === 'report') return <Report />
  if (route === 'pengaturan' || route === 'settings' || route === 'setting') return <Settings />
  if (route === 'kasir') return <Cashier />
  if (route === 'meja' || route === 'pelanggan') return hasTable ? <Customer /> : <Tables />
  return <Dashboard />
}

createRoot(document.getElementById('root')).render(
  <AuthProvider>
    <StoreProvider>
      <App />
    </StoreProvider>
  </AuthProvider>,
)
