// SaaS platform dashboard — the super admin's home (#/admin). Standalone
// shell (not the POS AppShell): super_admin has no outlet, so the POS store
// never loads here. All data is fetched directly against Supabase via the
// platform RPCs, which are gated on the super-admin PIN.
//
// The PIN is captured once on the first visit (held in memory only, never
// persisted) and forwarded to every platform RPC. If a call is rejected the
// PIN is dropped and the input screen returns.

import React, { useEffect, useState } from 'react'
import { useAuth } from '../../state.jsx'
import { supabase } from '../../supabase.js'
import { Ic } from '../../icons.jsx'
import TenantsList from './TenantsList.jsx'
import TenantDetail from './TenantDetail.jsx'
import CreateTenant from './CreateTenant.jsx'

// #/admin/tenants/<id> → ['tenants', '<id>']; bare #/admin → ['tenants', '']
const routeSegments = () => window.location.hash.replace(/^#\/admin\/?/, '').split('?')[0].split('/')

function useEscLogout(enabled) {
  const { logout } = useAuth()
  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (event) => {
      if (event.key !== 'Escape' || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')
      if (typing) return
      logout()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled, logout])
}

const ADMIN_NAV = [
  { label: 'Tenants', icon: 'dashboard', route: 'tenants' },
  { label: 'Buat tenant', icon: 'plus', route: 'create' },
]

// Super-admin PIN gate. Held in memory only so the platform RPCs stay gated
// even if an admin leaves a shared terminal unattended mid-session.
function PinGate({ onUnlock }) {
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  return (
    <main className="login">
      <form className="login-card" onSubmit={(e) => { e.preventDefault(); if (!pin || busy) return; setBusy(true); setErr(''); onUnlock(pin).catch(() => setErr('PIN platform salah.')).finally(() => setBusy(false)) }}>
        <div className="login-brand">
          <div className="brand-mark">K</div>
          <div><strong>kasira</strong><span>SAAS PLATFORM</span></div>
        </div>
        <h1>Kunci platform</h1>
        <p className="login-sub">Masukkan PIN Super Admin untuk mengelola tenant.</p>
        <label>PIN Super Admin<input
          type="password" inputMode="numeric" maxLength={6} autoComplete="current-password"
          value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} placeholder="••••" autoFocus
        /></label>
        {err && <div className="login-error">{err}</div>}
        <button type="submit" className="primary-button" disabled={busy || !pin}>{busy ? 'Memeriksa…' : 'Buka platform'}</button>
      </form>
    </main>
  )
}

function AdminDashboard() {
  const { user, logout } = useAuth()
  const [path, setPath] = useState(() => window.location.hash || '#/admin')
  const [pin, setPin] = useState(null)         // super-admin PIN (memory only)
  const [gateKey, setGateKey] = useState(0)    // re-mount the PIN gate cleanly

  // The dashboard only needs the PIN for the write/read RPCs. Verify once via
  // the (idempotent) outlet_stats call so a wrong PIN fails fast with feedback.
  const unlock = async (candidate) => {
    await supabase.rpc('outlet_stats', { p_super_pin: candidate })
    setPin(candidate)
  }

  // A platform call failed → drop the PIN and re-prompt.
  const revokePin = () => { setPin(null); setGateKey((k) => k + 1) }

  useEscLogout(user?.role === 'super_admin')

  useEffect(() => {
    const onHashChange = () => setPath(window.location.hash || '#/admin')
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  if (user?.role !== 'super_admin') {
    return (
      <div className="admin-shell admin-shell-warn">
        <div className="access-denied">
          <div className="brand-mark">K</div>
          <h1>Akses dibatasi</h1>
          <p>Panel ini khusus untuk Super Admin kasira.</p>
          <button type="button" className="primary-button" onClick={() => { window.location.hash = '#/' }}>Kembali</button>
        </div>
      </div>
    )
  }

  if (!pin) return <PinGate key={gateKey} onUnlock={unlock} />

  const seg = routeSegments()
  const view = seg[0] || 'tenants'  // tenants | create | tenant detail
  const isDetail = seg[0] === 'tenants' && seg[1]
  const active = isDetail ? 'Tenants' : view === 'create' ? 'Buat tenant' : 'Tenants'

  return (
    <div className="admin-shell">
      <aside className="sidebar admin-sidebar">
        <div className="brand-lockup"><div className="brand-mark">K</div><div><strong>kasira</strong><span>SAAS PLATFORM</span></div></div>
        <nav aria-label="Navigasi admin">
          <p className="nav-label">Platform</p>
          {ADMIN_NAV.map((item) => {
            const Icon = Ic[item.icon] || Ic.dashboard
            return (
              <button
                type="button" key={item.route}
                aria-current={active === item.label ? 'page' : undefined}
                className={`nav-item ${active === item.label ? 'active' : ''}`}
                onClick={() => { window.location.hash = '#/admin/' + item.route }}
              >
                <span className="nav-icon"><Icon width="20" height="20" /></span>
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="user-row">
            <div className="avatar">SA</div>
            <span><b>{user?.name || 'Platform'}</b><small>Super Admin</small></span>
            <button type="button" className="logout-button" aria-label="Keluar" title="Keluar" onClick={logout}><Ic.power width="16" height="16" /></button>
          </div>
        </div>
      </aside>
      <main className="admin-content">
        <header className="admin-topbar">
          <div className="breadcrumb"><span>kasira</span><span className="crumb-sep">/</span><b>Platform Admin</b></div>
          <div className="top-actions"><div className="top-avatar" aria-label="Super Admin">SA</div></div>
        </header>
        <section className="admin-page">
          {view === 'create' && <CreateTenant pin={pin} onPinRequired={revokePin} />}
          {isDetail && <TenantDetail id={seg[1]} pin={pin} onPinRequired={revokePin} />}
          {view === 'tenants' && !isDetail && <TenantsList pin={pin} onPinRequired={revokePin} />}
        </section>
      </main>
    </div>
  )
}

export default AdminDashboard