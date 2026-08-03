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
import { StoreProvider } from './state.jsx'
import './styles.css'

// Hash routes are #/path?query — strip the query string so 'meja?meja=5'
// routes to 'meja'; each view parses its own params from the hash.
const routeFromHash = () => window.location.hash.replace(/^#\//, '').split('?')[0] || 'ringkasan'

function App() {
  const [route, setRoute] = useState(routeFromHash)

  useEffect(() => {
    const onHashChange = () => setRoute(routeFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  if (route === 'kds') return <Kds />
  if (route === 'qr') return <Qr />
  if (route === 'menu' || route === 'stok') return <Menu />
  if (route === 'laporan' || route === 'report') return <Report />
  if (route === 'pengaturan' || route === 'settings' || route === 'setting') return <Settings />
  if (route === 'kasir') return <Cashier />
  if (route === 'meja' || route === 'pelanggan') {
    const hasTable = /[?&](meja|table)=/.test(window.location.hash)
    return hasTable ? <Customer /> : <Tables />
  }
  if (route === 'ringkasan' || route === 'dashboard' || route === '') return <Dashboard />
  return <Dashboard />
}

createRoot(document.getElementById('root')).render(
  <StoreProvider>
    <App />
  </StoreProvider>,
)
