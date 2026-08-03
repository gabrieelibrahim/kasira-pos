// Kasira app shell — shared sidebar + topbar chrome for kasir views.
// Renders around a main-content slot so QR, portal-meja (kasir mode) and any
// other workspace view keep the same navigation chrome.

import React from 'react'
import { Ic } from './icons.jsx'

// icon name -> route
const NAV = [
  { label: 'Ringkasan', icon: 'dashboard', route: '' },
  { label: 'Order masuk', icon: 'inbox', route: 'kasir' },
  { label: 'Layar dapur', icon: 'kitchen', route: 'kds' },
  { label: 'Portal meja', icon: 'tables', route: 'meja' },
  { label: 'QR meja', icon: 'qr', route: 'qr' },
  { label: 'Menu & stok', icon: 'menu', route: 'menu' },
  { label: 'Laporan', icon: 'report', route: 'laporan' },
]

function Icon({ name, size = 18 }) {
  const render = Ic[name] || Ic.dashboard
  return <span aria-hidden="true" className="nav-icon">{render({ width: size, height: size })}</span>
}

function Sidebar({ active }) {
  const go = (route) => { window.location.hash = '#/' + route }
  return (
    <aside className="sidebar">
      <div className="brand-lockup"><div className="brand-mark">K</div><div><strong>kasira</strong><span>CONTROL ROOM</span></div></div>
      <nav aria-label="Navigasi utama">
        <p className="nav-label">Workspace</p>
        {NAV.map((item) => (
          <button type="button" key={item.label} aria-current={active === item.label ? 'page' : undefined} className={`nav-item ${active === item.label ? 'active' : ''}`} onClick={() => go(item.route)}>
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <button type="button" className="nav-item" onClick={() => go('kasir')}><Icon name="settings" /><span>Pengaturan</span></button>
        <div className="help-card"><span className="help-mark">?</span><div><b>Butuh bantuan?</b><small>Buka pusat panduan</small></div><span className="icon"><Ic.arrowUpRight width="16" height="16" /></span></div>
        <div className="user-row"><div className="avatar">RA</div><span><b>Raka Adi</b><small>Kasir · Shift pagi</small></span><span className="icon"><Ic.more width="17" height="17" /></span></div>
      </div>
    </aside>
  )
}

function Topbar({ breadcrumb }) {
  return (
    <header className="topbar">
      <div className="breadcrumb"><span>Workspace</span><span className="crumb-sep">/</span><b>{breadcrumb}</b></div>
      <div className="top-actions">
        <div className="connection"><span className="live-dot" /> Realtime aktif</div>
        <button type="button" className="icon-button" aria-label="Fokus ke pencarian" onClick={() => document.querySelector('.search-field input')?.focus()}><span className="icon"><Ic.search width="17" height="17" /></span></button>
        <button type="button" className="icon-button notification" aria-label="Buka notifikasi"><span className="icon"><Ic.bell width="17" height="17" /></span><i /></button>
        <div className="top-avatar" aria-label="Raka Adi">RA</div>
      </div>
    </header>
  )
}

export default function AppShell({ active, breadcrumb, children }) {
  return (
    <div className="app-shell">
      <Sidebar active={active} />
      <main className="main-content">
        <Topbar breadcrumb={breadcrumb} />
        <div className="content-wrap">{children}</div>
      </main>
    </div>
  )
}
