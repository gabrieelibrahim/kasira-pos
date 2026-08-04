// Kasira app shell — shared sidebar + topbar chrome for kasir views.
// Renders around a main-content slot so QR, portal-meja (kasir mode) and any
// other workspace view keep the same navigation chrome.

import React from 'react'
import { Ic } from './icons.jsx'
import { isActionable, useAuth, useStore } from './state.jsx'
import { NAV, NAV_EXTRA, useShortcuts } from './useShortcuts.js'

// Two-letter initials from a staff member's name ("Raka Adi" -> "RA").
const initialsOf = (name) => (name || '').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()

function Icon({ name, size = 18 }) {
  const render = Ic[name] || Ic.dashboard
  return <span aria-hidden="true" className="nav-icon">{render({ width: size, height: size })}</span>
}

function Sidebar({ active, badge }) {
  const { outlet, orders } = useStore()
  const { user, logout } = useAuth()
  const outletName = outlet?.name || 'kasira'
  const pending = typeof badge === 'number' ? badge : orders.filter(isActionable).length
  const go = (route) => { window.location.hash = '#/' + route }
  const initials = initialsOf(user?.name)
  return (
    <aside className="sidebar">
      <div className="brand-lockup"><div className="brand-mark">K</div><div><strong>{outletName}</strong><span>CONTROL ROOM</span></div></div>
      <nav aria-label="Navigasi utama">
        <p className="nav-label">Workspace</p>
        {NAV.map((item) => (
          <button type="button" key={item.label} aria-current={active === item.label ? 'page' : undefined} className={`nav-item ${active === item.label ? 'active' : ''}`} onClick={() => go(item.route)}>
            <Icon name={item.icon} />
            <span>{item.label}</span>
            {item.count && pending > 0 && <em>{pending}</em>}
            <kbd className="nav-key">{item.key}</kbd>
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <button type="button" aria-current={active === 'Pengaturan' ? 'page' : undefined} className={`nav-item ${active === 'Pengaturan' ? 'active' : ''}`} onClick={() => go('pengaturan')}><Icon name="settings" /><span>Pengaturan</span><kbd className="nav-key">8</kbd></button>
        <div className="user-row">
          <div className="avatar">{initials}</div>
          <span><b>{user?.name || 'Staf'}</b><small>{user?.role === 'admin' ? 'Admin' : 'Kasir'}</small></span>
          <button type="button" className="logout-button" aria-label="Keluar" title="Keluar" onClick={logout}><Ic.power width="16" height="16" /></button>
        </div>
      </div>
    </aside>
  )
}

function Topbar({ breadcrumb }) {
  const { outlet } = useStore()
  const { user } = useAuth()
  const outletName = outlet?.name || 'kasira'
  const initials = initialsOf(user?.name)
  return (
    <header className="topbar">
      <div className="breadcrumb"><span>{outletName}</span><span className="crumb-sep">/</span><b>{breadcrumb}</b></div>
      <div className="top-actions">
        <button type="button" className="icon-button" aria-label="Fokus ke pencarian" onClick={() => document.querySelector('.search-field input')?.focus()}><span className="icon"><Ic.search width="17" height="17" /></span></button>
        <button type="button" className="icon-button notification" aria-label="Buka notifikasi"><span className="icon"><Ic.bell width="17" height="17" /></span><i /></button>
        <div className="top-avatar" aria-label={user?.name || 'Staf'}>{initials}</div>
      </div>
    </header>
  )
}

export default function AppShell({ active, breadcrumb, badge, children }) {
  // Global 1-8 sidebar shortcuts shared with KDS (defined in useShortcuts).
  useShortcuts()

  return (
    <div className="app-shell">
      <Sidebar active={active} badge={badge} />
      <main className="main-content">
        <Topbar breadcrumb={breadcrumb} />
        <div className="content-wrap">{children}</div>
      </main>
    </div>
  )
}
